import { Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { Contract, Interface, Wallet, formatUnits } from "ethers";
import type { PoolClient } from "pg";
import { DatabaseService } from "./database.service.js";
import { LimitOrdersService, type BoundContracts } from "./limit-orders.service.js";

const orderTuple =
  "tuple(address owner,bool buy,uint256 amountIn,uint256 minOut,uint64 issuedAt,uint64 expiry,uint256 salt)";
const limitOrdersInterface = new Interface([
  `function executeBatch(${orderTuple}[] orders,bytes[] signatures)`,
  `function orderHash(${orderTuple} order) view returns(bytes32)`,
  `function consumed(bytes32 orderHash) view returns(bool)`,
  `event OrderExecuted(bytes32 indexed orderHash,address indexed owner,bool buy,uint256 amountIn,uint256 amountOut)`,
]);
const pairInterface = new Interface([
  "function token0() view returns(address)",
  "function getReserves() view returns(uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
]);
const tokenInterface = new Interface([
  "function paymentToken() view returns(address)",
  "function decimals() view returns(uint8)",
]);

interface StoredOrder {
  id: string;
  order_hash: string;
  owner_address: string;
  is_buy: boolean;
  amount_in: string;
  min_out: string;
  issued_at: string;
  expires_at: string;
  salt: string;
  signature: string;
}

@Injectable()
export class LimitOrderExecutorService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private stopped = false;
  private preferBuy = true;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly limitOrdersService: LimitOrdersService,
  ) {}

  onModuleInit() {
    if (!process.env.LIMIT_ORDER_EXECUTOR_PRIVATE_KEY?.trim()) {
      void this.setHeartbeat("disabled", null, null, "未配置限价单执行钱包。");
      return;
    }
    // 服务使用固定轮询间隔检查链上状态和价格触发队列；不启动并行轮询。
    this.timer = setInterval(() => void this.tick(), 5_000);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  private async setHeartbeat(
    state: "disabled" | "ready" | "degraded" | "error",
    nativeBalance: string | null,
    transactionHash: string | null,
    error: string | null,
  ) {
    try {
      await this.databaseService.getPool().query(
        `UPDATE trade_executor_heartbeat
            SET state = $1, native_balance = $2, last_transaction_hash = COALESCE($3, last_transaction_hash),
                last_error = $4, updated_at = NOW() WHERE singleton = TRUE`,
        [state, nativeBalance, transactionHash, error],
      );
    } catch {
      // 安装迁移尚未运行时不让健康状态写入中断 API 启动。
    }
  }

  private async tick() {
    if (this.busy || this.stopped || !process.env.LIMIT_ORDER_EXECUTOR_PRIVATE_KEY?.trim()) return;
    this.busy = true;
    let lockClient: PoolClient | undefined;
    let provider: Awaited<ReturnType<LimitOrdersService["getExecutionContext"]>>["provider"] | undefined;
    try {
      lockClient = await this.databaseService.getPool().connect();
      const lock = await lockClient.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(1398030674) AS locked");
      if (!lock.rows[0]?.locked) return;

      const context = await this.limitOrdersService.getExecutionContext();
      provider = context.provider;
      if (context.binding.chainId !== 97) {
        throw new ServiceUnavailableException("自动执行器仅允许在 BNB Smart Chain 测试网运行；主网需另行验收和启用。");
      }
      const wallet = new Wallet(process.env.LIMIT_ORDER_EXECUTOR_PRIVATE_KEY!, provider);
      const nativeBalance = await provider.getBalance(wallet.address);
      const minimumBalance = BigInt(process.env.LIMIT_ORDER_EXECUTOR_MIN_BALANCE_WEI ?? "10000000000000000");
      if (nativeBalance < minimumBalance) {
        await this.setHeartbeat(
          "degraded",
          nativeBalance.toString(),
          null,
          "执行钱包原生币余额低于配置阈值，暂不提交交易。",
        );
        return;
      }

      const latestBlock = await provider.getBlock("latest");
      if (!latestBlock) throw new Error("读取当前链区块失败。");
      const contract = new Contract(context.binding.orders, limitOrdersInterface, wallet);
      await this.reconcileSubmitted(context.binding, provider);
      let submitted: string | null = null;
      for (const buy of [this.preferBuy, !this.preferBuy]) {
        const candidates = await this.getTriggeredOrders(context.binding, provider, latestBlock.timestamp, buy);
        if (!candidates.length) continue;
        submitted = await this.submitTriggeredBatch(contract, candidates);
        if (submitted) {
          this.preferBuy = !buy;
          break;
        }
      }
      if (!submitted) this.preferBuy = !this.preferBuy;
      await this.setHeartbeat("ready", nativeBalance.toString(), submitted, null);
    } catch (error) {
      await this.setHeartbeat(
        "error",
        null,
        null,
        error instanceof Error ? error.message.slice(0, 1000) : "限价单执行器遇到未知错误。",
      );
    } finally {
      provider?.destroy();
      if (lockClient) {
        try {
          await lockClient.query("SELECT pg_advisory_unlock(1398030674)");
        } catch {
          // 数据库断开时连接归还会释放 advisory lock。
        }
        lockClient.release();
      }
      this.busy = false;
    }
  }

  private async getTriggeredOrders(
    binding: BoundContracts,
    provider: Awaited<ReturnType<LimitOrdersService["getExecutionContext"]>>["provider"],
    timestamp: number,
    buy: boolean,
  ) {
    const token = new Contract(binding.token, tokenInterface, provider);
    const pair = new Contract(binding.pair, pairInterface, provider);
    const [paymentToken, tokenDecimals, token0, reserves] = await Promise.all([
      token.getFunction("paymentToken")() as Promise<string>,
      token.getFunction("decimals")() as Promise<number>,
      pair.getFunction("token0")() as Promise<string>,
      pair.getFunction("getReserves")() as Promise<[bigint, bigint, bigint]>,
    ]);
    const payment = new Contract(paymentToken, tokenInterface, provider);
    const paymentDecimals = (await payment.getFunction("decimals")()) as number;
    const tokenReserve = token0.toLowerCase() === binding.token.toLowerCase() ? reserves[0] : reserves[1];
    const paymentReserve = token0.toLowerCase() === binding.token.toLowerCase() ? reserves[1] : reserves[0];
    if (tokenReserve === 0n || paymentReserve === 0n) return [];
    const currentPrice = formatUnits(
      (paymentReserve * 10n ** (BigInt(tokenDecimals) + 18n)) / (tokenReserve * 10n ** BigInt(paymentDecimals)),
      18,
    );
    const orders = await this.databaseService.getPool().query<StoredOrder>(
      `UPDATE limit_orders SET status = 'expired', updated_at = NOW()
        WHERE chain_id = $1 AND contract_address = $2 AND status = 'pending'
          AND expires_at <= $3 AND transaction_hash IS NULL`,
      [binding.chainId, binding.orders.toLowerCase(), timestamp],
    );
    void orders;
    const result = await this.databaseService.getPool().query<StoredOrder>(
      `SELECT id, order_hash, owner_address, is_buy, amount_in, min_out,
              issued_at::text, expires_at::text, salt::text, signature
         FROM limit_orders
        WHERE chain_id = $1 AND contract_address = $2 AND status = 'pending'
          AND transaction_hash IS NULL AND next_attempt_at <= NOW()
          AND expires_at > $3
          AND is_buy = $5
          AND (($5 AND trigger_price >= $4::numeric)
            OR (NOT $5 AND trigger_price <= $4::numeric))
        ORDER BY CASE WHEN $5 THEN trigger_price END ASC,
                 CASE WHEN NOT $5 THEN trigger_price END DESC,
                 expires_at ASC, id ASC
        LIMIT 20`,
      [binding.chainId, binding.orders.toLowerCase(), timestamp, currentPrice, buy],
    );
    return result.rows;
  }

  private async submitTriggeredBatch(contract: Contract, rows: StoredOrder[]) {
    if (!rows.length) return null;
    const orders = rows.map((row) => ({
      owner: row.owner_address,
      buy: row.is_buy,
      amountIn: row.amount_in,
      minOut: row.min_out,
      issuedAt: row.issued_at,
      expiry: row.expires_at,
      salt: row.salt,
    }));
    const accepted: number[] = [];
    for (let index = 0; index < orders.length; index += 1) {
      const candidateIndexes = [...accepted, index];
      const candidateOrders = candidateIndexes.map((item) => orders[item]!);
      const candidateSignatures = candidateIndexes.map((item) => rows[item]!.signature);
      try {
        await contract.getFunction("executeBatch").staticCall(candidateOrders, candidateSignatures);
        accepted.push(index);
      } catch {
        await this.deferOrder(rows[index]!, "链上预执行未通过，稍后会重新核验价格和签名。");
      }
    }
    if (!accepted.length) return null;
    const batchRows = accepted.map((index) => rows[index]!);
    const batchOrders = accepted.map((index) => orders[index]!);
    const batchSignatures = accepted.map((index) => rows[index]!.signature);
    const transaction = await contract.getFunction("executeBatch")(batchOrders, batchSignatures);
    await this.databaseService.getPool().query(
      `UPDATE limit_orders SET transaction_hash = $1, attempt_count = attempt_count + 1,
              last_error = NULL, updated_at = NOW()
        WHERE id = ANY($2::bigint[])`,
      [transaction.hash.toLowerCase(), batchRows.map((row) => row.id)],
    );
    await this.databaseService
      .getPool()
      .query("UPDATE trade_executor_heartbeat SET last_attempt_at = NOW(), updated_at = NOW() WHERE singleton = TRUE");
    return transaction.hash as string;
  }

  private async deferOrder(row: StoredOrder, message: string) {
    await this.databaseService.getPool().query(
      `UPDATE limit_orders SET attempt_count = attempt_count + 1,
              next_attempt_at = NOW() + INTERVAL '15 seconds',
              last_error = $2, updated_at = NOW() WHERE id = $1`,
      [row.id, message],
    );
  }

  private async reconcileSubmitted(
    binding: BoundContracts,
    provider: Awaited<ReturnType<LimitOrdersService["getExecutionContext"]>>["provider"],
  ) {
    const pending = await this.databaseService.getPool().query<{
      transaction_hash: string;
      order_hash: string;
    }>(
      `SELECT DISTINCT transaction_hash, order_hash FROM limit_orders
        WHERE chain_id = $1 AND contract_address = $2 AND status = 'pending'
          AND transaction_hash IS NOT NULL LIMIT 20`,
      [binding.chainId, binding.orders.toLowerCase()],
    );
    const byTransaction = new Map<string, string[]>();
    for (const row of pending.rows) {
      const hashes = byTransaction.get(row.transaction_hash) ?? [];
      hashes.push(row.order_hash);
      byTransaction.set(row.transaction_hash, hashes);
    }
    const latest = await provider.getBlockNumber();
    for (const [transactionHash, orderHashes] of byTransaction) {
      const receipt = await provider.getTransactionReceipt(transactionHash);
      if (!receipt) continue;
      if (receipt.status === 0) {
        await this.databaseService.getPool().query(
          `UPDATE limit_orders SET transaction_hash = NULL,
                  next_attempt_at = NOW() + INTERVAL '30 seconds',
                  last_error = '执行交易已回滚，将在冷却后重试。', updated_at = NOW()
            WHERE chain_id = $1 AND contract_address = $2 AND transaction_hash = $3`,
          [binding.chainId, binding.orders.toLowerCase(), transactionHash],
        );
        continue;
      }
      if (latest - receipt.blockNumber + 1 < 3) continue;
      const block = await provider.getBlock(receipt.blockNumber);
      if (!block || block.hash !== receipt.blockHash) continue;
      const executed = new Set<string>();
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== binding.orders.toLowerCase()) continue;
        try {
          const event = limitOrdersInterface.parseLog(log);
          if (event?.name === "OrderExecuted") executed.add(String(event.args.orderHash).toLowerCase());
        } catch {
          // 忽略同一合约地址中不属于订单执行的其它日志。
        }
      }
      for (const hash of orderHashes) {
        if (executed.has(hash.toLowerCase())) {
          await this.databaseService.getPool().query(
            `UPDATE limit_orders SET status = 'executed', block_number = $1,
                    block_hash = $2, updated_at = NOW()
              WHERE chain_id = $3 AND contract_address = $4 AND order_hash = $5`,
            [receipt.blockNumber, receipt.blockHash, binding.chainId, binding.orders.toLowerCase(), hash],
          );
        }
      }
    }
  }
}
