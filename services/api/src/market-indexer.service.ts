import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Contract, Interface, formatUnits, getAddress } from "ethers";
import type { PoolClient } from "pg";
import { getBoundRpcProvider } from "./chain-rpc.js";
import { DatabaseService } from "./database.service.js";

const pairInterface = new Interface([
  "function token0() view returns(address)",
  "function token1() view returns(address)",
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)",
]);
const orderEventsInterface = new Interface([
  "event OrderExecuted(bytes32 indexed orderHash,address indexed owner,bool buy,uint256 amountIn,uint256 amountOut)",
  "event OrderCancelled(bytes32 indexed orderHash,address indexed owner)",
]);
const tokenInterface = new Interface([
  "function paymentToken() view returns(address)",
  "function decimals() view returns(uint8)",
]);

interface IndexBinding {
  chainId: number;
  deploymentId: string;
  pair: string;
  limitOrders: string | null;
  token: string;
  verifiedBlock: number;
}

@Injectable()
export class MarketIndexerService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private stopped = false;

  constructor(private readonly databaseService: DatabaseService) {}

  onModuleInit() {
    if (process.env.DEX_INDEXER_ENABLED?.trim().toLowerCase() !== "true") {
      void this.setState("disabled", null, "历史交易索引器未启用。");
      return;
    }
    this.timer = setInterval(() => void this.tick(), 10_000);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  private async setState(
    state: "disabled" | "ready" | "degraded" | "error",
    block: number | null,
    message: string | null,
  ) {
    try {
      await this.databaseService.getPool().query(
        `UPDATE market_indexer_heartbeat
            SET state = $1, last_block = COALESCE($2, last_block),
                last_error = $3, updated_at = NOW() WHERE singleton = TRUE`,
        [state, block, message],
      );
    } catch {
      // 待迁移环境不影响 API 服务启动。
    }
  }

  private async tick() {
    if (this.busy || this.stopped || process.env.DEX_INDEXER_ENABLED?.trim().toLowerCase() !== "true") return;
    this.busy = true;
    let provider: Awaited<ReturnType<typeof getBoundRpcProvider>> | undefined;
    let client: PoolClient | undefined;
    try {
      client = await this.databaseService.getPool().connect();
      const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(1398030675) AS locked");
      if (!lock.rows[0]?.locked) return;
      const binding = await this.getBinding();
      provider = await getBoundRpcProvider(
        binding.chainId,
        [binding.token, binding.pair, ...(binding.limitOrders ? [binding.limitOrders] : [])],
        this.databaseService.getPool(),
      );
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(binding.chainId)) throw new Error("RPC 网络与安装链不匹配。");
      const token = new Contract(binding.token, tokenInterface, provider);
      const [paymentToken, tokenDecimals] = await Promise.all([
        token.getFunction("paymentToken")() as Promise<string>,
        token.getFunction("decimals")() as Promise<number>,
      ]);
      const payment = new Contract(paymentToken, tokenInterface, provider);
      const paymentDecimals = (await payment.getFunction("decimals")()) as number;
      const pair = new Contract(binding.pair, pairInterface, provider);
      const [token0, token1] = await Promise.all([
        pair.getFunction("token0")() as Promise<string>,
        pair.getFunction("token1")() as Promise<string>,
      ]);
      if (
        ![token0.toLowerCase(), token1.toLowerCase()].includes(binding.token.toLowerCase()) ||
        ![token0.toLowerCase(), token1.toLowerCase()].includes(paymentToken.toLowerCase())
      ) {
        throw new Error("已绑定交易对与项目代币/支付币不匹配。");
      }

      const cursor = await this.getCursor(binding);
      let lastBlock = cursor.last_block;
      if (cursor.last_block_hash) {
        const block = await provider.getBlock(lastBlock);
        if (!block || block.hash?.toLowerCase() !== cursor.last_block_hash.toLowerCase()) {
          // 回退 12 个区块后重新索引，避免短链重组留下错误成交记录。
          lastBlock = Math.max(binding.verifiedBlock, lastBlock - 12);
          const ancestor = await provider.getBlock(lastBlock);
          await this.databaseService
            .getPool()
            .query("DELETE FROM dex_trade_events WHERE chain_id = $1 AND pair_address = $2 AND block_number > $3", [
              binding.chainId,
              binding.pair.toLowerCase(),
              lastBlock,
            ]);
          await this.saveCursor(binding, lastBlock, ancestor?.hash ?? null);
        }
      }
      const latest = Math.max(binding.verifiedBlock, (await provider.getBlockNumber()) - 3);
      if (lastBlock >= latest) {
        await this.setState("ready", lastBlock, null);
        return;
      }
      const fromBlock = Math.max(binding.verifiedBlock, lastBlock + 1);
      const toBlock = Math.min(latest, fromBlock + 499);
      const swapTopic = pairInterface.getEvent("Swap")!.topicHash;
      const logs = await provider.getLogs({
        address: binding.pair,
        topics: [swapTopic],
        fromBlock,
        toBlock,
      });
      const blockTimes = new Map<number, number>();
      for (const log of logs) {
        const event = pairInterface.parseLog(log);
        if (!event) continue;
        let blockTimestamp = blockTimes.get(log.blockNumber);
        if (blockTimestamp === undefined) {
          const block = await provider.getBlock(log.blockNumber);
          if (!block) continue;
          blockTimestamp = block.timestamp;
          blockTimes.set(log.blockNumber, blockTimestamp);
        }
        const amount0In = BigInt(event.args.amount0In);
        const amount1In = BigInt(event.args.amount1In);
        const amount0Out = BigInt(event.args.amount0Out);
        const amount1Out = BigInt(event.args.amount1Out);
        const tokenIs0 = token0.toLowerCase() === binding.token.toLowerCase();
        const tokenVolume = tokenIs0 ? amount0In + amount0Out : amount1In + amount1Out;
        const paymentVolume = tokenIs0 ? amount1In + amount1Out : amount0In + amount0Out;
        if (tokenVolume === 0n || paymentVolume === 0n) continue;
        const scaledPrice =
          (paymentVolume * 10n ** (BigInt(tokenDecimals) + 18n)) / (tokenVolume * 10n ** BigInt(paymentDecimals));
        const price = formatUnits(scaledPrice, 18);
        await this.databaseService.getPool().query(
          `INSERT INTO dex_trade_events (
             chain_id, pair_address, transaction_hash, block_number, block_hash,
             block_timestamp, log_index, sender_address, amount0_in, amount1_in,
             amount0_out, amount1_out, token_volume, payment_volume, price
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (chain_id, pair_address, transaction_hash, log_index) DO NOTHING`,
          [
            binding.chainId,
            binding.pair.toLowerCase(),
            log.transactionHash.toLowerCase(),
            log.blockNumber,
            log.blockHash.toLowerCase(),
            blockTimestamp,
            log.index,
            getAddress(event.args.sender).toLowerCase(),
            amount0In.toString(),
            amount1In.toString(),
            amount0Out.toString(),
            amount1Out.toString(),
            tokenVolume.toString(),
            paymentVolume.toString(),
            price,
          ],
        );
      }
      const lastBlockHash = (await provider.getBlock(toBlock))?.hash ?? null;
      await this.saveCursor(binding, toBlock, lastBlockHash);
      if (binding.limitOrders) {
        await this.indexLimitOrderEvents(binding, provider, latest);
      }
      await this.setState("ready", toBlock, null);
    } catch (error) {
      await this.setState("error", null, error instanceof Error ? error.message.slice(0, 1000) : "行情索引失败。");
    } finally {
      provider?.destroy();
      if (client) {
        try {
          await client.query("SELECT pg_advisory_unlock(1398030675)");
        } catch {
          // 数据库连接断开时，释放连接会清理 advisory lock。
        }
        client.release();
      }
      this.busy = false;
    }
  }

  private async getBinding(): Promise<IndexBinding> {
    const result = await this.databaseService.getPool().query<{
      chain_id: string;
      deployment_id: string;
      pair_address: string;
      verified_block: string;
      contracts: Record<string, { address?: unknown }>;
    }>(
      `SELECT chain_id::text, deployment_id, pair_address,
              verified_block::text, contracts
         FROM runtime_contract_binding WHERE singleton = TRUE`,
    );
    const row = result.rows[0];
    const tokenAddress = row?.contracts?.ProjectToken?.address;
    const limitOrdersAddress = row?.contracts?.TokenLimitOrders?.address;
    if (!row || typeof tokenAddress !== "string") throw new Error("系统尚未绑定交易合约。");
    return {
      chainId: Number(row.chain_id),
      deploymentId: row.deployment_id,
      pair: getAddress(row.pair_address),
      token: getAddress(tokenAddress),
      limitOrders: typeof limitOrdersAddress === "string" ? getAddress(limitOrdersAddress) : null,
      verifiedBlock: Number(row.verified_block),
    };
  }

  private async getCursor(binding: IndexBinding) {
    const result = await this.databaseService.getPool().query<{
      last_block: string;
      last_block_hash: string | null;
    }>(
      `INSERT INTO dex_index_cursors (chain_id, pair_address, last_block, last_block_hash)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (chain_id, pair_address) DO NOTHING`,
      [binding.chainId, binding.pair.toLowerCase(), Math.max(0, binding.verifiedBlock - 1)],
    );
    void result;
    const cursor = await this.databaseService.getPool().query<{
      last_block: string;
      last_block_hash: string | null;
    }>("SELECT last_block::text, last_block_hash FROM dex_index_cursors WHERE chain_id = $1 AND pair_address = $2", [binding.chainId, binding.pair.toLowerCase()]);
    return {
      last_block: Number(cursor.rows[0]?.last_block ?? Math.max(0, binding.verifiedBlock - 1)),
      last_block_hash: cursor.rows[0]?.last_block_hash ?? null,
    };
  }

  private async saveCursor(binding: IndexBinding, block: number, hash: string | null) {
    await this.databaseService.getPool().query(
      `INSERT INTO dex_index_cursors (chain_id, pair_address, last_block, last_block_hash, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (chain_id, pair_address) DO UPDATE
         SET last_block = EXCLUDED.last_block,
             last_block_hash = EXCLUDED.last_block_hash,
             updated_at = NOW()`,
      [binding.chainId, binding.pair.toLowerCase(), block, hash?.toLowerCase() ?? null],
    );
  }

  private async indexLimitOrderEvents(
    binding: IndexBinding,
    provider: Awaited<ReturnType<typeof getBoundRpcProvider>>,
    latest: number,
  ) {
    const contractAddress = binding.limitOrders!;
    await this.databaseService.getPool().query(
      `INSERT INTO limit_order_event_cursors (chain_id, contract_address, last_block)
       VALUES ($1,$2,$3) ON CONFLICT (chain_id, contract_address) DO NOTHING`,
      [binding.chainId, contractAddress.toLowerCase(), Math.max(0, binding.verifiedBlock - 1)],
    );
    const cursorResult = await this.databaseService.getPool().query<{
      last_block: string;
      last_block_hash: string | null;
    }>(
      `SELECT last_block::text, last_block_hash FROM limit_order_event_cursors
        WHERE chain_id = $1 AND contract_address = $2`,
      [binding.chainId, contractAddress.toLowerCase()],
    );
    let cursor = Number(cursorResult.rows[0]?.last_block ?? Math.max(0, binding.verifiedBlock - 1));
    const cursorHash = cursorResult.rows[0]?.last_block_hash;
    if (cursorHash) {
      const block = await provider.getBlock(cursor);
      if (!block || block.hash?.toLowerCase() !== cursorHash.toLowerCase()) {
        cursor = Math.max(binding.verifiedBlock, cursor - 12);
        const ancestor = await provider.getBlock(cursor);
        await this.databaseService.getPool().query(
          `UPDATE limit_orders SET status = 'pending', transaction_hash = NULL,
                  block_number = NULL, block_hash = NULL, updated_at = NOW()
            WHERE chain_id = $1 AND contract_address = $2 AND block_number > $3`,
          [binding.chainId, contractAddress.toLowerCase(), cursor],
        );
        await this.databaseService.getPool().query(
          `UPDATE limit_order_event_cursors SET last_block = $3,
                  last_block_hash = $4, updated_at = NOW()
            WHERE chain_id = $1 AND contract_address = $2`,
          [binding.chainId, contractAddress.toLowerCase(), cursor, ancestor?.hash ?? null],
        );
      }
    }
    if (cursor >= latest) return;
    const fromBlock = Math.max(binding.verifiedBlock, cursor + 1);
    const toBlock = Math.min(latest, fromBlock + 499);
    const topics = [
      orderEventsInterface.getEvent("OrderExecuted")!.topicHash,
      orderEventsInterface.getEvent("OrderCancelled")!.topicHash,
    ];
    const logs = await provider.getLogs({
      address: contractAddress,
      topics: [topics],
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      const event = orderEventsInterface.parseLog(log);
      if (!event) continue;
      const status = event.name === "OrderExecuted" ? "executed" : "cancelled";
      await this.databaseService.getPool().query(
        `UPDATE limit_orders SET status = $1, transaction_hash = $2,
                block_number = $3, block_hash = $4, last_error = NULL, updated_at = NOW()
          WHERE chain_id = $5 AND contract_address = $6 AND order_hash = $7`,
        [
          status,
          log.transactionHash.toLowerCase(),
          log.blockNumber,
          log.blockHash.toLowerCase(),
          binding.chainId,
          contractAddress.toLowerCase(),
          String(event.args.orderHash).toLowerCase(),
        ],
      );
    }
    const hash = (await provider.getBlock(toBlock))?.hash ?? null;
    await this.databaseService.getPool().query(
      `UPDATE limit_order_event_cursors SET last_block = $3,
              last_block_hash = $4, updated_at = NOW()
        WHERE chain_id = $1 AND contract_address = $2`,
      [binding.chainId, contractAddress.toLowerCase(), toBlock, hash],
    );
  }
}
