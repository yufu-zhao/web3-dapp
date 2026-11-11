import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Contract, Interface, TypedDataEncoder, formatUnits, getAddress, verifyTypedData } from "ethers";
import { getBoundRpcProvider } from "./chain-rpc.js";
import { DatabaseService } from "./database.service.js";

const durationSeconds = 30 * 60;
const orderTypes = {
  Order: [
    { name: "owner", type: "address" },
    { name: "buy", type: "bool" },
    { name: "amountIn", type: "uint256" },
    { name: "minOut", type: "uint256" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiry", type: "uint64" },
    { name: "salt", type: "uint256" },
  ],
};
const orderTuple =
  "tuple(address owner,bool buy,uint256 amountIn,uint256 minOut,uint64 issuedAt,uint64 expiry,uint256 salt)";
const orderInterface = new Interface([
  `function executeBatch(${orderTuple}[] orders,bytes[] signatures)`,
  `function orderHash(${orderTuple} order) view returns(bytes32)`,
  "function consumed(bytes32 orderHash) view returns(bool)",
  "function ORDER_DURATION() view returns(uint256)",
  "function MAX_BATCH() view returns(uint256)",
  "function router() view returns(address)",
  "event OrderExecuted(bytes32 indexed orderHash,address indexed owner,bool buy,uint256 amountIn,uint256 amountOut)",
  "event OrderCancelled(bytes32 indexed orderHash,address indexed owner)",
]);
const pairInterface = new Interface([
  "function token0() view returns(address)",
  "function token1() view returns(address)",
  "function getReserves() view returns(uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
]);
const erc20Interface = new Interface([
  "function paymentToken() view returns(address)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function effectiveSellTaxBps() view returns(uint256 burnBps,uint256 ecosystemBps)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
]);
const projectTokenInterface = new Interface([
  ...erc20Interface.fragments.map((fragment) => fragment.format("full")),
  "function tradingOpen() view returns(bool)",
]);
const routerInterface = new Interface([
  "function getAmountsOut(uint256 amountIn,address[] path) view returns(uint256[] amounts)",
]);
const erc1271Interface = new Interface([
  "function isValidSignature(bytes32 hash,bytes signature) view returns(bytes4)",
]);
const eip712Domain = {
  name: "ChainForge Signed Limit Orders",
  version: "1",
};

export interface BoundContracts {
  chainId: number;
  deploymentId: string;
  token: string;
  orders: string;
  pair: string;
}

interface SignedOrder {
  owner: string;
  buy: boolean;
  amountIn: string;
  minOut: string;
  issuedAt: number;
  expiry: number;
  salt: string;
}

@Injectable()
export class LimitOrdersService {
  constructor(private readonly databaseService: DatabaseService) {}

  private async ensureMigration() {
    const result = await this.databaseService.getPool().query<{
      applied: boolean;
    }>(
      `SELECT to_regclass('public.schema_migrations') IS NOT NULL
          AND EXISTS (SELECT 1 FROM schema_migrations
                       WHERE version = '0012_limit_orders_and_market_data') AS applied`,
    );
    if (!result.rows[0]?.applied) {
      throw new ServiceUnavailableException("限价单功能等待数据库迁移。");
    }
  }

  private async getBinding(): Promise<BoundContracts> {
    await this.ensureMigration();
    const result = await this.databaseService.getPool().query<{
      chain_id: string;
      deployment_id: string;
      contracts: Record<string, { address?: unknown }>;
      pair_address: string;
    }>(
      `SELECT chain_id::text, deployment_id, contracts, pair_address
         FROM runtime_contract_binding WHERE singleton = TRUE`,
    );
    const row = result.rows[0];
    const orders = row?.contracts?.TokenLimitOrders?.address;
    const token = row?.contracts?.ProjectToken?.address;
    const chainId = Number(row?.chain_id);
    if (!row || !Number.isSafeInteger(chainId) || typeof orders !== "string" || typeof token !== "string") {
      throw new ServiceUnavailableException("限价单合约尚未完成安装绑定。");
    }
    return {
      chainId,
      deploymentId: row.deployment_id,
      token: getAddress(token),
      orders: getAddress(orders),
      pair: getAddress(row.pair_address),
    };
  }

  private async getProvider(binding: BoundContracts) {
    return getBoundRpcProvider(
      binding.chainId,
      [binding.token, binding.orders, binding.pair],
      this.databaseService.getPool(),
    );
  }

  async getExecutionContext() {
    const binding = await this.getBinding();
    const provider = await this.getProvider(binding);
    return { binding, provider };
  }

  private async getRouterAddress(binding: BoundContracts, provider: Awaited<ReturnType<typeof getBoundRpcProvider>>) {
    const contract = new Contract(binding.orders, orderInterface, provider);
    const router = getAddress((await contract.getFunction("router")()) as string);
    if ((await provider.getCode(router)) === "0x") {
      throw new ServiceUnavailableException("限价单合约绑定的路由器地址无代码。");
    }
    return router;
  }

  private parseOrder(input: unknown): SignedOrder {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("签名订单格式无效。");
    }
    const row = input as Record<string, unknown>;
    const uintString = (value: unknown) => typeof value === "string" && /^(0|[1-9]\d{0,77})$/.test(value);
    const time = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
    if (
      typeof row.owner !== "string" ||
      typeof row.buy !== "boolean" ||
      !uintString(row.amountIn) ||
      row.amountIn === "0" ||
      !uintString(row.minOut) ||
      row.minOut === "0" ||
      !time(row.issuedAt) ||
      !time(row.expiry) ||
      !uintString(row.salt)
    ) {
      throw new BadRequestException("签名订单字段无效。");
    }
    let owner: string;
    try {
      owner = getAddress(row.owner).toLowerCase();
    } catch {
      throw new BadRequestException("订单钱包地址无效。");
    }
    return {
      owner,
      buy: row.buy,
      amountIn: row.amountIn as string,
      minOut: row.minOut as string,
      issuedAt: Number(row.issuedAt),
      expiry: Number(row.expiry),
      salt: row.salt as string,
    };
  }

  async submitOrder(input: unknown) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const order = this.parseOrder(body.order);
    if (typeof body.signature !== "string" || !/^0x(?:[0-9a-f]{2}){1,1024}$/i.test(body.signature)) {
      throw new BadRequestException("钱包签名格式无效。");
    }
    if (order.expiry !== order.issuedAt + durationSeconds) {
      throw new BadRequestException("限价单固定有效期为 30 分钟。");
    }
    const binding = await this.getBinding();
    const provider = await this.getProvider(binding);
    try {
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(binding.chainId)) {
        throw new ServiceUnavailableException("当前 RPC 网络与安装绑定不匹配。");
      }
      const block = await provider.getBlock("latest");
      if (!block || order.issuedAt > block.timestamp || order.expiry <= block.timestamp) {
        throw new BadRequestException("订单签名时间无效或订单已过期。");
      }
      const contract = new Contract(binding.orders, orderInterface, provider);
      const hash = TypedDataEncoder.hash(
        { ...eip712Domain, chainId: binding.chainId, verifyingContract: binding.orders },
        orderTypes,
        order,
      );
      const contractHash = (await contract.getFunction("orderHash")(order)) as string;
      if (contractHash.toLowerCase() !== hash.toLowerCase()) {
        throw new ServiceUnavailableException("签名摘要与绑定合约不匹配。");
      }
      const ownerCode = await provider.getCode(order.owner);
      if (ownerCode === "0x") {
        if (
          verifyTypedData(
            { ...eip712Domain, chainId: binding.chainId, verifyingContract: binding.orders },
            orderTypes,
            order,
            body.signature,
          ).toLowerCase() !== order.owner
        ) {
          throw new BadRequestException("订单签名与钱包地址不匹配。");
        }
      } else {
        const wallet = new Contract(order.owner, erc1271Interface, provider);
        const magic = (await wallet.getFunction("isValidSignature")(hash, body.signature)) as string;
        if (magic.toLowerCase() !== "0x1626ba7e") {
          throw new BadRequestException("合约钱包拒绝该订单签名。");
        }
      }

      const token = new Contract(binding.token, erc20Interface, provider);
      const paymentToken = (await token.getFunction("paymentToken")()) as string;
      const inputToken = order.buy ? paymentToken : binding.token;
      const asset = new Contract(inputToken, erc20Interface, provider);
      const payment = new Contract(paymentToken, erc20Interface, provider);
      const [balance, allowance, consumed, tokenDecimals, paymentDecimals] = await Promise.all([
        asset.getFunction("balanceOf")(order.owner) as Promise<bigint>,
        asset.getFunction("allowance")(order.owner, binding.orders) as Promise<bigint>,
        contract.getFunction("consumed")(hash) as Promise<boolean>,
        token.getFunction("decimals")() as Promise<number>,
        payment.getFunction("decimals")() as Promise<number>,
      ]);
      if (consumed) throw new BadRequestException("该限价单已取消或执行。");
      if (balance < BigInt(order.amountIn)) {
        throw new BadRequestException("输入币余额不足，订单未登记。");
      }
      if (allowance < BigInt(order.amountIn)) {
        throw new BadRequestException("限价单授权额度不足，订单未登记。");
      }
      const basePriceNumerator = BigInt(order.buy ? order.amountIn : order.minOut) * 10n ** BigInt(tokenDecimals + 18);
      // 报价触发索引按代币最高转账税率留出余量，最终可成交性由合约模拟决定。
      const priceNumerator = order.buy
        ? (basePriceNumerator * 9_700n) / 10_000n
        : (basePriceNumerator * 10_000n) / 7_500n;
      const priceDenominator = BigInt(order.buy ? order.minOut : order.amountIn) * 10n ** BigInt(paymentDecimals);
      const triggerPrice = formatUnits(priceNumerator / priceDenominator, 18);
      const pending = await this.databaseService.getPool().query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM limit_orders
          WHERE chain_id = $1 AND contract_address = $2
            AND owner_address = $3 AND status = 'pending'`,
        [binding.chainId, binding.orders.toLowerCase(), order.owner],
      );
      if (Number(pending.rows[0]?.count ?? 0) >= 100) {
        throw new BadRequestException("该钱包待执行限价单已达到数量上限。");
      }
      const saved = await this.databaseService.getPool().query(
        `INSERT INTO limit_orders (
           chain_id, deployment_id, contract_address, order_hash, owner_address,
           is_buy, amount_in, min_out, trigger_price, issued_at, expires_at, salt, signature
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (chain_id, contract_address, order_hash) DO NOTHING`,
        [
          binding.chainId,
          binding.deploymentId,
          binding.orders.toLowerCase(),
          hash.toLowerCase(),
          order.owner,
          order.buy,
          order.amountIn,
          order.minOut,
          triggerPrice,
          order.issuedAt,
          order.expiry,
          order.salt,
          body.signature,
        ],
      );
      return { orderHash: hash, state: saved.rowCount ? "pending" : "already-recorded" };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("无法验证或保存限价单。");
    } finally {
      provider.destroy();
    }
  }

  async listOrders(ownerInput: string) {
    let owner: string;
    try {
      owner = getAddress(ownerInput).toLowerCase();
    } catch {
      throw new BadRequestException("钱包地址无效。");
    }
    const binding = await this.getBinding();
    const result = await this.databaseService.getPool().query(
      `SELECT order_hash, owner_address, is_buy, amount_in, min_out,
              issued_at, expires_at, salt, status, transaction_hash, block_number,
              last_error, created_at
         FROM limit_orders
        WHERE chain_id = $1 AND contract_address = $2 AND owner_address = $3
        ORDER BY created_at DESC LIMIT 200`,
      [binding.chainId, binding.orders.toLowerCase(), owner],
    );
    return { orders: result.rows };
  }

  async getCandles(intervalInput: string, fromInput?: string, toInput?: string) {
    const intervals: Record<string, number> = {
      "1m": 60,
      "5m": 300,
      "15m": 900,
      "1h": 3600,
      "4h": 14400,
      "1d": 86400,
    };
    const interval = intervals[intervalInput] ?? 300;
    const to = toInput === undefined ? Math.floor(Date.now() / 1000) : Number(toInput);
    const from = fromInput === undefined ? to - 7 * 86400 : Number(fromInput);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from || to - from > 90 * 86400) {
      throw new BadRequestException("K 线查询范围无效，单次最多查询 90 天。");
    }
    const binding = await this.getBinding();
    const result = await this.databaseService.getPool().query(
      `SELECT (FLOOR(block_timestamp / $3::numeric) * $3)::bigint AS timestamp,
              (ARRAY_AGG(price ORDER BY block_timestamp, block_number, log_index))[1]::text AS open,
              MAX(price)::text AS high, MIN(price)::text AS low,
              (ARRAY_AGG(price ORDER BY block_timestamp DESC, block_number DESC, log_index DESC))[1]::text AS close,
              SUM(payment_volume)::text AS payment_volume,
              COUNT(*)::text AS trades
         FROM dex_trade_events
        WHERE chain_id = $1 AND pair_address = $2
          AND block_timestamp >= $4 AND block_timestamp < $5
        GROUP BY FLOOR(block_timestamp / $3::numeric)
        ORDER BY timestamp ASC`,
      [binding.chainId, binding.pair.toLowerCase(), interval, from, to],
    );
    return { interval: intervalInput in intervals ? intervalInput : "5m", candles: result.rows };
  }

  async listTrades(limitInput?: string) {
    const limit = limitInput === undefined ? 50 : Number(limitInput);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException("交易记录每页数量需为 1 至 200。");
    }
    const binding = await this.getBinding();
    const result = await this.databaseService.getPool().query(
      `SELECT transaction_hash, block_number, block_timestamp, log_index,
              sender_address, token_volume, payment_volume, price
         FROM dex_trade_events
        WHERE chain_id = $1 AND pair_address = $2
        ORDER BY block_number DESC, log_index DESC LIMIT $3`,
      [binding.chainId, binding.pair.toLowerCase(), limit],
    );
    return { trades: result.rows };
  }

  async getMarket() {
    const binding = await this.getBinding();
    const provider = await this.getProvider(binding);
    try {
      const pair = new Contract(binding.pair, pairInterface, provider);
      const token = new Contract(binding.token, projectTokenInterface, provider);
      const [token0, token1, reserves, tokenDecimals, paymentToken] = await Promise.all([
        pair.getFunction("token0")() as Promise<string>,
        pair.getFunction("token1")() as Promise<string>,
        pair.getFunction("getReserves")() as Promise<[bigint, bigint, bigint]>,
        token.getFunction("decimals")() as Promise<bigint>,
        token.getFunction("paymentToken")() as Promise<string>,
      ]);
      const payment = new Contract(paymentToken, erc20Interface, provider);
      const [paymentDecimals, paymentSymbol] = await Promise.all([
        payment.getFunction("decimals")() as Promise<bigint>,
        payment.getFunction("symbol")() as Promise<string>,
      ]);
      if (
        ![token0.toLowerCase(), token1.toLowerCase()].includes(binding.token.toLowerCase()) ||
        ![token0.toLowerCase(), token1.toLowerCase()].includes(paymentToken.toLowerCase())
      ) {
        throw new ServiceUnavailableException("当前交易对代币与安装绑定不匹配。");
      }
      const tokenReserve = token0.toLowerCase() === binding.token.toLowerCase() ? reserves[0] : reserves[1];
      const paymentReserve = token0.toLowerCase() === binding.token.toLowerCase() ? reserves[1] : reserves[0];
      const price =
        tokenReserve === 0n
          ? null
          : formatUnits(
              (paymentReserve * 10n ** (BigInt(tokenDecimals) + 18n)) / (tokenReserve * 10n ** BigInt(paymentDecimals)),
              18,
            );
      const tradingOpen = (await token.getFunction("tradingOpen")()) as boolean;
      return {
        state: !tradingOpen ? "not-open" : tokenReserve === 0n || paymentReserve === 0n ? "empty" : "ready",
        chainId: binding.chainId,
        pairAddress: binding.pair,
        paymentSymbol,
        tokenDecimals: Number(tokenDecimals),
        paymentDecimals: Number(paymentDecimals),
        price,
        tokenReserve: tokenReserve.toString(),
        paymentReserve: paymentReserve.toString(),
      };
    } finally {
      provider.destroy();
    }
  }

  async quote(buyInput: unknown, amountInput: unknown) {
    if (typeof buyInput !== "boolean" || typeof amountInput !== "string" || !/^[1-9]\d{0,77}$/.test(amountInput)) {
      throw new BadRequestException("报价方向或输入数量无效。");
    }
    const binding = await this.getBinding();
    const provider = await this.getProvider(binding);
    try {
      const token = new Contract(binding.token, erc20Interface, provider);
      if (!(await new Contract(binding.token, projectTokenInterface, provider).getFunction("tradingOpen")())) {
        throw new ServiceUnavailableException("代币交易尚未开放。");
      }
      const payment = (await token.getFunction("paymentToken")()) as string;
      const input = buyInput ? payment : binding.token;
      const output = buyInput ? binding.token : payment;
      const routerAddress = await this.getRouterAddress(binding, provider);
      const router = new Contract(routerAddress, routerInterface, provider);
      let routedInput = BigInt(amountInput);
      if (!buyInput) {
        const rates = (await token.getFunction("effectiveSellTaxBps")()) as [bigint, bigint];
        routedInput = (routedInput * (10_000n - BigInt(rates[0]) - BigInt(rates[1]))) / 10_000n;
      }
      const amounts = (await router.getFunction("getAmountsOut")(routedInput, [input, output])) as bigint[];
      if (amounts.length !== 2 || amounts[1] === undefined) {
        throw new ServiceUnavailableException("路由器报价格式无效。");
      }
      const netOut = buyInput ? (amounts[1] * 9_700n) / 10_000n : amounts[1];
      const settings = await this.databaseService
        .getPool()
        .query<{ slippage_bps: number }>("SELECT slippage_bps FROM trade_executor_settings WHERE singleton = TRUE");
      const slippageBps = settings.rows[0]?.slippage_bps ?? 100;
      const minimum = (netOut * BigInt(10_000 - slippageBps)) / 10_000n;
      return { amountOut: netOut.toString(), minOut: minimum.toString(), slippageBps };
    } catch {
      throw new ServiceUnavailableException("无法读取当前交易对报价。");
    } finally {
      provider.destroy();
    }
  }

  async getSettings() {
    await this.ensureMigration();
    const [settings, heartbeat, indexer] = await Promise.all([
      this.databaseService
        .getPool()
        .query("SELECT slippage_bps, updated_at FROM trade_executor_settings WHERE singleton = TRUE"),
      this.databaseService
        .getPool()
        .query(
          "SELECT state, native_balance, last_attempt_at, last_transaction_hash, last_error, updated_at FROM trade_executor_heartbeat WHERE singleton = TRUE",
        ),
      this.databaseService
        .getPool()
        .query("SELECT state, last_block, last_error, updated_at FROM market_indexer_heartbeat WHERE singleton = TRUE"),
    ]);
    return {
      settings: settings.rows[0] ?? null,
      executor: heartbeat.rows[0] ?? null,
      indexer: indexer.rows[0] ?? null,
    };
  }

  async updateSlippage(value: unknown, adminId: string) {
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 500) {
      throw new BadRequestException("滑点需设置为 1 至 500 个基点。");
    }
    await this.ensureMigration();
    await this.databaseService.getPool().query(
      `UPDATE trade_executor_settings SET slippage_bps = $1,
              updated_by = $2, updated_at = NOW() WHERE singleton = TRUE`,
      [value, adminId],
    );
    return this.getSettings();
  }
}
