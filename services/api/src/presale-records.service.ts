import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Contract, Interface, getAddress } from "ethers";
import { getBoundRpcProvider } from "./chain-rpc.js";
import { DatabaseService } from "./database.service.js";

const saleInterface = new Interface([
  "event Committed(address indexed buyer,uint8 indexed round,uint256 index,uint256 payment)",
]);
const saleReadInterface = new Interface([
  "function paymentUnit() view returns(uint256)",
]);

export interface PresaleRecordQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  round?: string;
}

@Injectable()
export class PresaleRecordsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async submitTransaction(transactionHashInput: unknown) {
    await this.ensureMigrationApplied();
    if (
      typeof transactionHashInput !== "string" ||
      !/^0x[a-f\d]{64}$/i.test(transactionHashInput)
    ) {
      throw new BadRequestException("认购交易哈希格式无效。");
    }
    const binding = await this.getBinding();
    const provider = await getBoundRpcProvider(
      binding.chainId,
      [binding.saleAddress],
      this.databaseService.getPool(),
    );
    try {
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(binding.chainId)) {
        throw new ServiceUnavailableException(
          "当前 RPC 返回的网络与系统绑定链不一致。",
        );
      }
      const receipt =
        await provider.getTransactionReceipt(transactionHashInput);
      if (!receipt || receipt.status !== 1) {
        throw new BadRequestException("认购交易不存在、未确认或执行失败。");
      }
      // 等待至少 3 个区块确认，降低短暂链重组导致记录失真的风险。
      const latestBlockNumber = await provider.getBlockNumber();
      if (latestBlockNumber - receipt.blockNumber + 1 < 3) {
        throw new BadRequestException("认购交易确认数不足，请稍后重新提交。");
      }
      if (receipt.to?.toLowerCase() !== binding.saleAddress.toLowerCase()) {
        throw new BadRequestException("交易目标不是当前绑定的私募合约。");
      }
      const block = await provider.getBlock(receipt.blockNumber);
      if (!block || block.hash !== receipt.blockHash) {
        throw new ServiceUnavailableException("无法确认认购交易区块哈希。");
      }
      const sale = new Contract(
        binding.saleAddress,
        saleReadInterface,
        provider,
      );
      const paymentUnit = (await sale.getFunction("paymentUnit")()) as bigint;
      const paymentDecimals =
        paymentUnit === 1_000_000n
          ? 6
          : paymentUnit === 1_000_000_000_000_000_000n
            ? 18
            : null;
      if (!paymentDecimals) {
        throw new ServiceUnavailableException("无法确认认购支付币精度。");
      }
      // 只从当前绑定 Sale 合约的成功交易回执提取事件，不采信客户端提交的钱包或金额。
      const records = receipt.logs
        .filter(
          (log) =>
            log.address.toLowerCase() === binding.saleAddress.toLowerCase(),
        )
        .flatMap((log) => {
          try {
            const parsed = saleInterface.parseLog(log);
            if (!parsed || parsed.name !== "Committed") return [];
            const round = Number(parsed.args.round);
            if (![0, 1, 2].includes(round)) return [];
            return [
              {
                chainId: binding.chainId,
                saleAddress: binding.saleAddress,
                transactionHash: receipt.hash.toLowerCase(),
                blockNumber: receipt.blockNumber,
                blockHash: receipt.blockHash,
                logIndex: log.index,
                buyerAddress: getAddress(parsed.args.buyer).toLowerCase(),
                roundId: round,
                participantIndex: parsed.args.index.toString(),
                paymentAmount: parsed.args.payment.toString(),
                paymentDecimals,
              },
            ];
          } catch {
            return [];
          }
        });
      if (!records.length) {
        throw new BadRequestException("交易回执中没有当前私募合约的认购事件。");
      }
      let saved = 0;
      for (const record of records) {
        const result = await this.databaseService.getPool().query(
          `INSERT INTO presale_records (
             chain_id, sale_address, transaction_hash, block_number, block_hash,
             log_index, buyer_address, round_id, participant_index, payment_amount,
             payment_decimals
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (chain_id, transaction_hash, log_index) DO NOTHING`,
          [
            record.chainId,
            record.saleAddress,
            record.transactionHash,
            record.blockNumber,
            record.blockHash,
            record.logIndex,
            record.buyerAddress,
            record.roundId,
            record.participantIndex,
            record.paymentAmount,
            record.paymentDecimals,
          ],
        );
        saved += result.rowCount ?? 0;
      }
      return { saved };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException("无法核验私募认购交易。");
    } finally {
      provider.destroy();
    }
  }

  async list(query: PresaleRecordQuery) {
    await this.ensureMigrationApplied();
    const page = this.readInteger(query.page, 1, 1_000_000, 1, "页码");
    const pageSize = this.readInteger(query.pageSize, 20, 100, 10, "每页条数");
    const search = (query.search ?? "").trim();
    if (search.length > 128) throw new BadRequestException("搜索内容过长。");
    const round =
      query.round === undefined || query.round === ""
        ? null
        : this.readInteger(query.round, 0, 2, 0, "期数");
    const where: string[] = [];
    const values: unknown[] = [];
    if (search) {
      values.push(`%${search}%`);
      where.push(
        `(buyer_address ILIKE $${values.length} OR transaction_hash ILIKE $${values.length})`,
      );
    }
    if (round !== null) {
      values.push(round);
      where.push(`round_id = $${values.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const count = await this.databaseService
      .getPool()
      .query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM presale_records ${clause}`,
        values,
      );
    const pageValues = [...values, pageSize, (page - 1) * pageSize];
    const rows = await this.databaseService.getPool().query(
      `SELECT id::text, chain_id::text AS "chainId", sale_address AS "saleAddress",
              transaction_hash AS "transactionHash", block_number::text AS "blockNumber",
              block_hash AS "blockHash", log_index AS "logIndex",
              buyer_address AS "buyerAddress", round_id AS "roundId",
              participant_index::text AS "participantIndex",
              payment_amount::text AS "paymentAmount", payment_decimals AS "paymentDecimals",
              created_at AS "createdAt"
         FROM presale_records ${clause}
        ORDER BY block_number DESC, log_index DESC, id DESC
        LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    return {
      items: rows.rows,
      total: Number(count.rows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  private async getBinding() {
    const pool = this.databaseService.getPool();
    const table = await pool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.runtime_contract_binding') IS NOT NULL AS exists",
    );
    if (!table.rows[0]?.exists)
      throw new ServiceUnavailableException("系统尚未绑定生效合约。");
    const result = await pool.query<{
      chain_id: string;
      contracts: Record<string, { address?: unknown }>;
    }>(
      "SELECT chain_id::text, contracts FROM runtime_contract_binding WHERE singleton = TRUE",
    );
    const row = result.rows[0];
    const chainId = Number(row?.chain_id);
    const rawAddress = row?.contracts?.FairSaleV2?.address;
    if (
      !Number.isSafeInteger(chainId) ||
      chainId <= 0 ||
      typeof rawAddress !== "string" ||
      !/^0x[a-f\d]{40}$/i.test(rawAddress)
    ) {
      throw new ServiceUnavailableException("私募合约绑定信息无效。");
    }
    return { chainId, saleAddress: getAddress(rawAddress) };
  }

  private async ensureMigrationApplied() {
    const pool = this.databaseService.getPool();
    const schema = await pool.query<{ ready: boolean }>(
      `SELECT to_regclass('public.presale_records') IS NOT NULL
          AND to_regclass('public.schema_migrations') IS NOT NULL AS ready`,
    );
    if (!schema.rows[0]?.ready) {
      throw new ServiceUnavailableException(
        "私募记录数据库迁移尚未应用，请在安装器数据库页执行“应用待执行迁移”。",
      );
    }
    const migration = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE version = '0009_presale_records'",
    );
    if (!migration.rowCount) {
      throw new ServiceUnavailableException(
        "私募记录数据库迁移尚未应用，请在安装器数据库页执行“应用待执行迁移”。",
      );
    }
  }

  private readInteger(
    raw: string | undefined,
    fallback: number,
    max: number,
    min: number,
    label: string,
  ) {
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new BadRequestException(`${label}参数无效。`);
    }
    return value;
  }
}
