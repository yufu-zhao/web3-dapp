import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  Contract,
  Interface,
  TypedDataEncoder,
  formatUnits,
  getAddress,
  verifyTypedData
} from "ethers";
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
    { name: "salt", type: "uint256" }
  ]
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
  "event OrderCancelled(bytes32 indexed orderHash,address indexed owner)"
]);
const pairInterface = new Interface([
  "function token0() view returns(address)",
  "function token1() view returns(address)",
  "function getReserves() view returns(uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)"
]);
const approvalInterface = new Interface([
  "function approve(address spender,uint256 value) returns(bool)"
]);
const marketSwapInterface = new Interface([
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)"
]);
const erc20Interface = new Interface([
  "function paymentToken() view returns(address)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function effectiveSellTaxBps() view returns(uint256 burnBps,uint256 ecosystemBps)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)"
]);
const projectTokenInterface = new Interface([
  ...erc20Interface.fragments.map(fragment => fragment.format("full")),
  "function tradingOpen() view returns(bool)"
]);
const routerInterface = new Interface([
  "function getAmountsOut(uint256 amountIn,address[] path) view returns(uint256[] amounts)"
]);
const erc1271Interface = new Interface([
  "function isValidSignature(bytes32 hash,bytes signature) view returns(bytes4)"
]);
const eip712Domain = {
  name: "ChainForge Signed Limit Orders",
  version: "1"
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

interface MarketBuyAttempt {
  id: string;
  chain_id: string;
  deployment_id: string;
  pair_address: string;
  owner_address: string;
  payment_token: string;
  project_token: string;
  router_address: string;
  amount_in: string;
  expected_out: string;
  min_out: string;
  status: string;
  approval_tx_hash: string | null;
  swap_tx_hash: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
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
                       WHERE version = '0012_limit_orders_market_data') AS applied`
    );
    if (!result.rows[0]?.applied) {
      throw new ServiceUnavailableException("限价单功能等待数据库迁移。");
    }
  }

  private async ensureMarketBuyMigration() {
    const result = await this.databaseService
      .getPool()
      .query<{ applied: boolean }>(
        `SELECT to_regclass('public.schema_migrations') IS NOT NULL
          AND EXISTS (SELECT 1 FROM schema_migrations
                       WHERE version = '0015_market_buy_attempts') AS applied`
      );
    if (!result.rows[0]?.applied) {
      throw new ServiceUnavailableException("市价买入记录功能等待数据库迁移。");
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
         FROM runtime_contract_binding WHERE singleton = TRUE`
    );
    const row = result.rows[0];
    const orders = row?.contracts?.TokenLimitOrders?.address;
    const token = row?.contracts?.ProjectToken?.address;
    const chainId = Number(row?.chain_id);
    if (
      !row ||
      !Number.isSafeInteger(chainId) ||
      typeof orders !== "string" ||
      typeof token !== "string"
    ) {
      throw new ServiceUnavailableException("限价单合约尚未完成安装绑定。");
    }
    return {
      chainId,
      deploymentId: row.deployment_id,
      token: getAddress(token),
      orders: getAddress(orders),
      pair: getAddress(row.pair_address)
    };
  }

  private async getProvider(binding: BoundContracts) {
    return getBoundRpcProvider(
      binding.chainId,
      [binding.token, binding.orders, binding.pair],
      this.databaseService.getPool()
    );
  }

  async getExecutionContext() {
    const binding = await this.getBinding();
    const provider = await this.getProvider(binding);
    return { binding, provider };
  }

  private async getRouterAddress(
    binding: BoundContracts,
    provider: Awaited<ReturnType<typeof getBoundRpcProvider>>
  ) {
    const contract = new Contract(binding.orders, orderInterface, provider);
    const router = getAddress(
      (await contract.getFunction("router")()) as string
    );
    if ((await provider.getCode(router)) === "0x") {
      throw new ServiceUnavailableException(
        "限价单合约绑定的路由器地址无代码。"
      );
    }
    return router;
  }

  private parseOrder(input: unknown): SignedOrder {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("签名订单格式无效。");
    }
    const row = input as Record<string, unknown>;
    const uintString = (value: unknown) =>
      typeof value === "string" && /^(0|[1-9]\d{0,77})$/.test(value);
    const time = (value: unknown) =>
      Number.isSafeInteger(value) && Number(value) >= 0;
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
      salt: row.salt as string
    };
  }

  async submitOrder(input: unknown) {
    const body =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const order = this.parseOrder(body.order);
    if (
      typeof body.signature !== "string" ||
      !/^0x(?:[0-9a-f]{2}){1,1024}$/i.test(body.signature)
    ) {
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
        throw new ServiceUnavailableException(
          "当前 RPC 网络与安装绑定不匹配。"
        );
      }
      const block = await provider.getBlock("latest");
      if (
        !block ||
        order.issuedAt > block.timestamp ||
        order.expiry <= block.timestamp
      ) {
        throw new BadRequestException("订单签名时间无效或订单已过期。");
      }
      const contract = new Contract(binding.orders, orderInterface, provider);
      const hash = TypedDataEncoder.hash(
        {
          ...eip712Domain,
          chainId: binding.chainId,
          verifyingContract: binding.orders
        },
        orderTypes,
        order
      );
      let contractHash: string;
      try {
        contractHash = (await contract.getFunction("orderHash")(
          order
        )) as string;
      } catch {
        // 活跃绑定可能仍指向旧版合约；不要把 ABI 不兼容伪装成签名错误。
        throw new ServiceUnavailableException(
          "当前绑定的限价单合约不支持签名订单，请先按最新合约包重新部署并更新运行时绑定。"
        );
      }
      if (contractHash.toLowerCase() !== hash.toLowerCase()) {
        throw new ServiceUnavailableException("签名摘要与绑定合约不匹配。");
      }
      const ownerCode = await provider.getCode(order.owner);
      if (ownerCode === "0x") {
        if (
          verifyTypedData(
            {
              ...eip712Domain,
              chainId: binding.chainId,
              verifyingContract: binding.orders
            },
            orderTypes,
            order,
            body.signature
          ).toLowerCase() !== order.owner
        ) {
          throw new BadRequestException("订单签名与钱包地址不匹配。");
        }
      } else {
        const wallet = new Contract(order.owner, erc1271Interface, provider);
        const magic = (await wallet.getFunction("isValidSignature")(
          hash,
          body.signature
        )) as string;
        if (magic.toLowerCase() !== "0x1626ba7e") {
          throw new BadRequestException("合约钱包拒绝该订单签名。");
        }
      }

      const token = new Contract(binding.token, erc20Interface, provider);
      const paymentToken = (await token.getFunction(
        "paymentToken"
      )()) as string;
      const inputToken = order.buy ? paymentToken : binding.token;
      const asset = new Contract(inputToken, erc20Interface, provider);
      const payment = new Contract(paymentToken, erc20Interface, provider);
      const [balance, allowance, consumed, tokenDecimals, paymentDecimals] =
        await Promise.all([
          asset.getFunction("balanceOf")(order.owner) as Promise<bigint>,
          asset.getFunction("allowance")(
            order.owner,
            binding.orders
          ) as Promise<bigint>,
          contract.getFunction("consumed")(hash) as Promise<boolean>,
          token.getFunction("decimals")() as Promise<number>,
          payment.getFunction("decimals")() as Promise<number>
        ]);
      if (consumed) throw new BadRequestException("该限价单已取消或执行。");
      if (balance < BigInt(order.amountIn)) {
        throw new BadRequestException("输入币余额不足，订单未登记。");
      }
      if (allowance < BigInt(order.amountIn)) {
        throw new BadRequestException("限价单授权额度不足，订单未登记。");
      }
      // ethers 返回 uint8 为 bigint，先转换为 bigint 再计算，避免登记时混用数字类型。
      const basePriceNumerator =
        BigInt(order.buy ? order.amountIn : order.minOut) *
        10n ** (BigInt(tokenDecimals) + 18n);
      // 报价触发索引按代币最高转账税率留出余量，最终可成交性由合约模拟决定。
      const priceNumerator = order.buy
        ? (basePriceNumerator * 9_700n) / 10_000n
        : (basePriceNumerator * 10_000n) / 7_500n;
      const priceDenominator =
        BigInt(order.buy ? order.minOut : order.amountIn) *
        10n ** BigInt(paymentDecimals);
      const triggerPrice = formatUnits(priceNumerator / priceDenominator, 18);
      const pending = await this.databaseService
        .getPool()
        .query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM limit_orders
          WHERE chain_id = $1 AND contract_address = $2
            AND owner_address = $3 AND status = 'pending'`,
          [binding.chainId, binding.orders.toLowerCase(), order.owner]
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
          body.signature
        ]
      );
      return {
        orderHash: hash,
        state: saved.rowCount ? "pending" : "already-recorded"
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
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
      [binding.chainId, binding.orders.toLowerCase(), owner]
    );
    return { orders: result.rows };
  }

  async createMarketBuyAttempt(bodyInput: unknown) {
    await this.ensureMarketBuyMigration();
    const body = this.asObject(bodyInput);
    const owner = this.parseOwner(body.owner);
    const amountIn = this.parseAmount(body.amountIn, "市价买入数量");
    const binding = await this.getBinding();
    const quote = await this.quote(true, amountIn);
    const provider = await this.getProvider(binding);
    try {
      const token = new Contract(
        binding.token,
        projectTokenInterface,
        provider
      );
      const [paymentToken, routerAddress] = await Promise.all([
        token.getFunction("paymentToken")() as Promise<string>,
        this.getRouterAddress(binding, provider)
      ]);
      const result = await this.databaseService.getPool().query<{ id: string }>(
        `INSERT INTO market_buy_attempts (
           chain_id, deployment_id, pair_address, owner_address, payment_token,
           project_token, router_address, amount_in, expected_out, min_out, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'awaiting_approval')
         RETURNING id::text`,
        [
          binding.chainId,
          binding.deploymentId,
          binding.pair.toLowerCase(),
          owner,
          getAddress(paymentToken).toLowerCase(),
          binding.token.toLowerCase(),
          getAddress(routerAddress).toLowerCase(),
          amountIn,
          quote.amountOut,
          quote.minOut
        ]
      );
      return {
        id: result.rows[0]!.id,
        owner_address: owner,
        amount_in: amountIn,
        expected_out: quote.amountOut,
        min_out: quote.minOut,
        status: "awaiting_approval"
      };
    } finally {
      provider.destroy();
    }
  }

  async recordMarketBuyStage(idInput: string, bodyInput: unknown) {
    await this.ensureMarketBuyMigration();
    const id = this.parseRecordId(idInput);
    const body = this.asObject(bodyInput);
    const owner = this.parseOwner(body.owner);
    const stage = body.stage;
    if (stage !== "approval" && stage !== "swap" && stage !== "wallet") {
      throw new BadRequestException("市价买入记录阶段无效。");
    }
    const binding = await this.getBinding();
    const selected = await this.databaseService
      .getPool()
      .query<MarketBuyAttempt>(
        `SELECT id::text, chain_id::text, deployment_id, pair_address, owner_address,
              payment_token, project_token, router_address, amount_in::text,
              expected_out::text, min_out::text, status, approval_tx_hash,
              swap_tx_hash, error_code, error_message, created_at, updated_at
         FROM market_buy_attempts
        WHERE id = $1 AND chain_id = $2 AND pair_address = $3 AND owner_address = $4`,
        [id, binding.chainId, binding.pair.toLowerCase(), owner]
      );
    const attempt = selected.rows[0];
    if (!attempt) throw new BadRequestException("找不到该钱包的市价买入记录。");

    if (stage === "wallet") {
      const outcome = body.outcome;
      if (outcome !== "failed" && outcome !== "cancelled") {
        throw new BadRequestException("钱包操作状态无效。");
      }
      const phase = body.phase;
      const code = this.parseOptionalText(body.errorCode, 64);
      const message = this.parseOptionalText(body.errorMessage, 500);
      // 买入授权已生效后，即使用户取消第二次钱包确认，也保留可继续的状态。
      const nextStatus =
        phase === "swap" && attempt.status === "approval_confirmed"
          ? "approval_confirmed"
          : outcome;
      await this.databaseService.getPool().query(
        `UPDATE market_buy_attempts SET status = $2, error_code = $3,
                error_message = $4, updated_at = NOW()
          WHERE id = $1 AND status NOT IN ('succeeded','failed','cancelled')`,
        [id, nextStatus, code, message ?? "钱包操作未完成。"]
      );
      return this.getMarketBuyAttempt(id, binding);
    }

    const transactionHash = this.parseTransactionHash(body.transactionHash);
    const provider = await this.getProvider(binding);
    try {
      const [transaction, receipt] = await Promise.all([
        provider.getTransaction(transactionHash),
        provider.getTransactionReceipt(transactionHash)
      ]);
      if (transaction) {
        this.assertMarketBuyTransaction(attempt, stage, transaction);
      }
      const status = await this.resolveMarketBuyStatus(
        attempt,
        stage,
        transaction,
        receipt,
        provider
      );
      await this.saveMarketBuyStage(id, stage, transactionHash, status);
      return this.getMarketBuyAttempt(id, binding);
    } finally {
      provider.destroy();
    }
  }

  async listMarketBuyAttempts(ownerInput: string) {
    await this.ensureMarketBuyMigration();
    const owner = this.parseOwner(ownerInput);
    const binding = await this.getBinding();
    const query = () =>
      this.databaseService.getPool().query<MarketBuyAttempt>(
        `SELECT id::text, chain_id::text, deployment_id, pair_address, owner_address,
                payment_token, project_token, router_address, amount_in::text,
                expected_out::text, min_out::text, status, approval_tx_hash,
                swap_tx_hash, error_code, error_message, created_at, updated_at
           FROM market_buy_attempts
          WHERE chain_id = $1 AND pair_address = $2 AND owner_address = $3
          ORDER BY created_at DESC LIMIT 50`,
        [binding.chainId, binding.pair.toLowerCase(), owner]
      );
    let result = await query();
    const recoverable = result.rows
      .filter(
        attempt =>
          attempt.status === "approval_pending" ||
          attempt.status === "swap_pending" ||
          (attempt.status === "awaiting_approval" && !attempt.approval_tx_hash)
      )
      .slice(0, 10);
    if (recoverable.length) {
      const provider = await this.getProvider(binding);
      try {
        for (const attempt of recoverable) {
          if (
            attempt.status === "awaiting_approval" &&
            !attempt.approval_tx_hash
          ) {
            const paymentToken = new Contract(
              attempt.payment_token,
              erc20Interface,
              provider
            );
            const allowance = (await paymentToken.getFunction("allowance")(
              attempt.owner_address,
              attempt.router_address
            )) as bigint;
            if (allowance >= BigInt(attempt.amount_in)) {
              await this.databaseService.getPool().query(
                `UPDATE market_buy_attempts
                    SET status = 'approval_confirmed', error_code = 'APPROVAL_RECOVERED',
                        error_message = NULL, updated_at = NOW()
                  WHERE id = $1 AND status = 'awaiting_approval' AND approval_tx_hash IS NULL`,
                [attempt.id]
              );
            }
            continue;
          }
          const stage = attempt.status === "swap_pending" ? "swap" : "approval";
          const hash =
            stage === "swap" ? attempt.swap_tx_hash : attempt.approval_tx_hash;
          if (!hash) continue;
          const [transaction, receipt] = await Promise.all([
            provider.getTransaction(hash),
            provider.getTransactionReceipt(hash)
          ]);
          if (transaction)
            this.assertMarketBuyTransaction(attempt, stage, transaction);
          if (!receipt) continue;
          const status = await this.resolveMarketBuyStatus(
            attempt,
            stage,
            transaction,
            receipt,
            provider
          );
          await this.saveMarketBuyStage(attempt.id, stage, hash, status);
        }
      } finally {
        provider.destroy();
      }
      result = await query();
    }
    return { attempts: result.rows };
  }

  async prepareMarketBuyAttempt(idInput: string, bodyInput: unknown) {
    await this.ensureMarketBuyMigration();
    const id = this.parseRecordId(idInput);
    const body = this.asObject(bodyInput);
    const owner = this.parseOwner(body.owner);
    const binding = await this.getBinding();
    const selected = await this.databaseService
      .getPool()
      .query<MarketBuyAttempt>(
        `SELECT id::text, chain_id::text, deployment_id, pair_address, owner_address,
              payment_token, project_token, router_address, amount_in::text,
              expected_out::text, min_out::text, status, approval_tx_hash,
              swap_tx_hash, error_code, error_message, created_at, updated_at
         FROM market_buy_attempts
        WHERE id = $1 AND chain_id = $2 AND pair_address = $3 AND owner_address = $4`,
        [id, binding.chainId, binding.pair.toLowerCase(), owner]
      );
    const attempt = selected.rows[0];
    if (!attempt) throw new BadRequestException("找不到该钱包的市价买入记录。");
    if (
      attempt.status !== "approval_confirmed" &&
      attempt.status !== "awaiting_approval"
    ) {
      throw new BadRequestException("该笔买入尚未完成授权，不能继续提交。");
    }

    const provider = await this.getProvider(binding);
    try {
      const token = new Contract(
        attempt.payment_token,
        erc20Interface,
        provider
      );
      const allowance = (await token.getFunction("allowance")(
        attempt.owner_address,
        attempt.router_address
      )) as bigint;
      if (allowance < BigInt(attempt.amount_in)) {
        throw new BadRequestException(
          "路由器授权额度不足，请重新发起买入授权。"
        );
      }
    } finally {
      provider.destroy();
    }

    // 恢复下单前重新取报价，避免沿用授权阶段已经过期的最低到账价。
    const quote = await this.quote(true, attempt.amount_in);
    await this.databaseService.getPool().query(
      `UPDATE market_buy_attempts
          SET status = 'approval_confirmed', expected_out = $2, min_out = $3, error_code = NULL,
              error_message = NULL, updated_at = NOW()
        WHERE id = $1 AND status IN ('approval_confirmed','awaiting_approval')`,
      [id, quote.amountOut, quote.minOut]
    );
    return this.getMarketBuyAttempt(id, binding);
  }

  private async getMarketBuyAttempt(id: string, binding: BoundContracts) {
    const result = await this.databaseService.getPool().query<MarketBuyAttempt>(
      `SELECT id::text, chain_id::text, deployment_id, pair_address, owner_address,
              payment_token, project_token, router_address, amount_in::text,
              expected_out::text, min_out::text, status, approval_tx_hash,
              swap_tx_hash, error_code, error_message, created_at, updated_at
         FROM market_buy_attempts
        WHERE id = $1 AND chain_id = $2 AND pair_address = $3`,
      [id, binding.chainId, binding.pair.toLowerCase()]
    );
    return result.rows[0] ?? null;
  }

  private async saveMarketBuyStage(
    id: string,
    stage: "approval" | "swap",
    transactionHash: string,
    result: {
      status: string;
      errorCode: string | null;
      errorMessage: string | null;
    }
  ) {
    const approvalStage = stage === "approval";
    await this.databaseService.getPool().query(
      `UPDATE market_buy_attempts
          SET ${approvalStage ? "approval_tx_hash" : "swap_tx_hash"} = $2,
              status = $3, error_code = $4, error_message = $5, updated_at = NOW()
        WHERE id = $1 AND status NOT IN ('succeeded','failed','cancelled')`,
      [
        id,
        transactionHash,
        result.status,
        result.errorCode,
        result.errorMessage
      ]
    );
  }

  private assertMarketBuyTransaction(
    attempt: MarketBuyAttempt,
    stage: "approval" | "swap",
    transaction: Awaited<
      ReturnType<
        Awaited<ReturnType<typeof getBoundRpcProvider>>["getTransaction"]
      >
    >
  ) {
    if (
      !transaction ||
      transaction.from.toLowerCase() !== attempt.owner_address.toLowerCase()
    ) {
      throw new BadRequestException("交易哈希发起钱包与记录钱包不匹配。");
    }
    if (stage === "approval") {
      if (
        !transaction.to ||
        transaction.to.toLowerCase() !== attempt.payment_token.toLowerCase()
      ) {
        throw new BadRequestException("授权交易目标与支付代币不匹配。");
      }
      try {
        const [spender, value] = approvalInterface.decodeFunctionData(
          "approve",
          transaction.data
        );
        if (
          String(spender).toLowerCase() !==
            attempt.router_address.toLowerCase() ||
          BigInt(value) < BigInt(attempt.amount_in)
        ) {
          throw new BadRequestException("授权对象或额度与市价买入记录不匹配。");
        }
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException("无法解码该授权交易。");
      }
      return;
    }
    if (
      !transaction.to ||
      transaction.to.toLowerCase() !== attempt.router_address.toLowerCase()
    ) {
      throw new BadRequestException("成交交易目标与已绑定路由器不匹配。");
    }
    try {
      const [amountIn, minOut, path, recipient] =
        marketSwapInterface.decodeFunctionData(
          "swapExactTokensForTokensSupportingFeeOnTransferTokens",
          transaction.data
        );
      if (
        BigInt(amountIn) !== BigInt(attempt.amount_in) ||
        BigInt(minOut) !== BigInt(attempt.min_out) ||
        path.length !== 2 ||
        String(path[0]).toLowerCase() !== attempt.payment_token.toLowerCase() ||
        String(path[1]).toLowerCase() !== attempt.project_token.toLowerCase() ||
        String(recipient).toLowerCase() !== attempt.owner_address.toLowerCase()
      ) {
        throw new BadRequestException("成交参数与市价买入记录不匹配。");
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("无法解码该市价买入交易。");
    }
  }

  private async resolveMarketBuyStatus(
    attempt: MarketBuyAttempt,
    stage: "approval" | "swap",
    transaction: Awaited<
      ReturnType<
        Awaited<ReturnType<typeof getBoundRpcProvider>>["getTransaction"]
      >
    >,
    receipt: Awaited<
      ReturnType<
        Awaited<ReturnType<typeof getBoundRpcProvider>>["getTransactionReceipt"]
      >
    >,
    provider: Awaited<ReturnType<typeof getBoundRpcProvider>>
  ) {
    if (!transaction || !receipt) {
      return {
        status: stage === "approval" ? "approval_pending" : "swap_pending",
        errorCode: null,
        errorMessage: null
      };
    }
    if (receipt.status !== 1) {
      return {
        status: "failed",
        errorCode: "CHAIN_REVERTED",
        errorMessage: await this.getMarketBuyRevertReason(
          provider,
          transaction,
          receipt
        )
      };
    }
    if (stage === "approval") {
      const token = new Contract(
        attempt.payment_token,
        erc20Interface,
        provider
      );
      const allowance = (await token.getFunction("allowance")(
        attempt.owner_address,
        attempt.router_address
      )) as bigint;
      if (allowance < BigInt(attempt.amount_in)) {
        return {
          status: "failed",
          errorCode: "APPROVAL_NOT_EFFECTIVE",
          errorMessage: "授权交易回执成功，但路由器可用授权额度仍不足。"
        };
      }
      return {
        status: "approval_confirmed",
        errorCode: null,
        errorMessage: null
      };
    }
    const swapTopic = pairInterface.getEvent("Swap")!.topicHash;
    const hasPairSwap = receipt.logs.some(
      log =>
        log.address.toLowerCase() === attempt.pair_address.toLowerCase() &&
        log.topics[0]?.toLowerCase() === swapTopic.toLowerCase()
    );
    if (!transaction || !hasPairSwap) {
      return {
        status: "failed",
        errorCode: "SWAP_EVENT_MISSING",
        errorMessage: "交易回执成功，但未检测到绑定交易对的 Swap 事件。"
      };
    }
    return { status: "succeeded", errorCode: null, errorMessage: null };
  }

  private async getMarketBuyRevertReason(
    provider: Awaited<ReturnType<typeof getBoundRpcProvider>>,
    transaction: Awaited<
      ReturnType<
        Awaited<ReturnType<typeof getBoundRpcProvider>>["getTransaction"]
      >
    >,
    receipt: NonNullable<
      Awaited<
        ReturnType<
          Awaited<
            ReturnType<typeof getBoundRpcProvider>
          >["getTransactionReceipt"]
        >
      >
    >
  ) {
    const fallback = "交易已上链但执行回滚；当前 RPC 未返回具体回滚原因。";
    if (!transaction || receipt.blockNumber <= 0) return fallback;
    try {
      await provider.send("eth_call", [
        {
          from: transaction.from,
          to: transaction.to,
          data: transaction.data,
          value: `0x${transaction.value.toString(16)}`,
          gas: `0x${transaction.gasLimit.toString(16)}`
        },
        `0x${(receipt.blockNumber - 1).toString(16)}`
      ]);
      return fallback;
    } catch (error) {
      const detail = error as {
        reason?: unknown;
        shortMessage?: unknown;
        info?: { error?: { message?: unknown } };
        message?: unknown;
      };
      const message =
        (typeof detail.reason === "string" && detail.reason) ||
        (typeof detail.info?.error?.message === "string" &&
          detail.info.error.message) ||
        (typeof detail.shortMessage === "string" && detail.shortMessage) ||
        (typeof detail.message === "string" &&
          detail.message.split("\n", 1)[0]);
      if (!message) return fallback;
      return `链上执行回滚：${message.replace(/https?:\/\/\S+/g, "[RPC]").slice(0, 450)}`;
    }
  }

  private asObject(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException("市价买入记录参数无效。");
    }
    return value as Record<string, unknown>;
  }

  private parseOwner(value: unknown) {
    if (typeof value !== "string")
      throw new BadRequestException("钱包地址无效。");
    try {
      return getAddress(value).toLowerCase();
    } catch {
      throw new BadRequestException("钱包地址无效。");
    }
  }

  private parseAmount(value: unknown, label: string) {
    if (typeof value !== "string" || !/^[1-9]\d{0,77}$/.test(value)) {
      throw new BadRequestException(`${label}无效。`);
    }
    return value;
  }

  private parseRecordId(value: string) {
    if (!/^[1-9]\d{0,17}$/.test(value))
      throw new BadRequestException("交易记录编号无效。");
    return value;
  }

  private parseTransactionHash(value: unknown) {
    if (typeof value !== "string" || !/^0x[\da-fA-F]{64}$/.test(value)) {
      throw new BadRequestException("交易哈希无效。");
    }
    return value.toLowerCase();
  }

  private parseOptionalText(value: unknown, maxLength: number) {
    if (typeof value !== "string" || !value.trim()) return null;
    return (
      value
        .replace(/https?:\/\/\S+/g, "[RPC]")
        // 这里按设计匹配并移除输入中的控制字符。
        // oxlint-disable-next-line eslint/no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, maxLength)
    );
  }

  async getCandles(
    intervalInput: string,
    fromInput?: string,
    toInput?: string
  ) {
    const intervals: Record<string, number> = {
      "1m": 60,
      "5m": 300,
      "15m": 900,
      "1h": 3600,
      "4h": 14400,
      "1d": 86400
    };
    const interval = intervals[intervalInput] ?? 300;
    const to =
      toInput === undefined ? Math.floor(Date.now() / 1000) : Number(toInput);
    const from = fromInput === undefined ? to - 7 * 86400 : Number(fromInput);
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 0 ||
      to <= from ||
      to - from > 90 * 86400
    ) {
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
      [binding.chainId, binding.pair.toLowerCase(), interval, from, to]
    );
    return {
      interval: intervalInput in intervals ? intervalInput : "5m",
      candles: result.rows
    };
  }

  async listTrades(limitInput?: string, sideInput?: string) {
    const limit = limitInput === undefined ? 50 : Number(limitInput);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException("交易记录每页数量需为 1 至 200。");
    }
    const binding = await this.getBinding();
    const provider = await this.getProvider(binding);
    let tokenIs0: boolean;
    try {
      const pair = new Contract(binding.pair, pairInterface, provider);
      tokenIs0 =
        String(await pair.getFunction("token0")()).toLowerCase() ===
        binding.token.toLowerCase();
    } finally {
      provider.destroy();
    }
    const direction = tokenIs0
      ? "(amount0_out > 0 AND amount1_in > 0)"
      : "(amount1_out > 0 AND amount0_in > 0)";
    const side =
      sideInput === "buy" ? true : sideInput === "sell" ? false : null;
    if (sideInput && sideInput !== "buy" && sideInput !== "sell")
      throw new BadRequestException("成交方向无效。");
    const result = await this.databaseService.getPool().query(
      `SELECT transaction_hash, block_number, block_timestamp, log_index,
              sender_address, token_volume, payment_volume, price,
              ${direction} AS is_buy,
              CASE WHEN EXISTS (SELECT 1 FROM limit_orders lo WHERE lo.transaction_hash = e.transaction_hash AND lo.status = 'executed') THEN 'limit' ELSE 'market' END AS trade_type,
              'succeeded' AS status
         FROM dex_trade_events e
        WHERE chain_id = $1 AND pair_address = $2 AND ($4::boolean IS NULL OR ${direction} = $4)
        ORDER BY block_number DESC, log_index DESC LIMIT $3`,
      [binding.chainId, binding.pair.toLowerCase(), limit, side]
    );
    return { trades: result.rows };
  }

  async getMarket() {
    const binding = await this.getBinding();
    const provider = await this.getProvider(binding);
    try {
      const pair = new Contract(binding.pair, pairInterface, provider);
      const token = new Contract(
        binding.token,
        projectTokenInterface,
        provider
      );
      const [token0, token1, reserves, tokenDecimals, paymentToken] =
        await Promise.all([
          pair.getFunction("token0")() as Promise<string>,
          pair.getFunction("token1")() as Promise<string>,
          pair.getFunction("getReserves")() as Promise<
            [bigint, bigint, bigint]
          >,
          token.getFunction("decimals")() as Promise<bigint>,
          token.getFunction("paymentToken")() as Promise<string>
        ]);
      const payment = new Contract(paymentToken, erc20Interface, provider);
      const [paymentDecimals, paymentSymbol] = await Promise.all([
        payment.getFunction("decimals")() as Promise<bigint>,
        payment.getFunction("symbol")() as Promise<string>
      ]);
      if (
        ![token0.toLowerCase(), token1.toLowerCase()].includes(
          binding.token.toLowerCase()
        ) ||
        ![token0.toLowerCase(), token1.toLowerCase()].includes(
          paymentToken.toLowerCase()
        )
      ) {
        throw new ServiceUnavailableException(
          "当前交易对代币与安装绑定不匹配。"
        );
      }
      const tokenReserve =
        token0.toLowerCase() === binding.token.toLowerCase()
          ? reserves[0]
          : reserves[1];
      const paymentReserve =
        token0.toLowerCase() === binding.token.toLowerCase()
          ? reserves[1]
          : reserves[0];
      const price =
        tokenReserve === 0n
          ? null
          : formatUnits(
              (paymentReserve * 10n ** (BigInt(tokenDecimals) + 18n)) /
                (tokenReserve * 10n ** BigInt(paymentDecimals)),
              18
            );
      const tradingOpen = (await token.getFunction("tradingOpen")()) as boolean;
      return {
        state: !tradingOpen
          ? "not-open"
          : tokenReserve === 0n || paymentReserve === 0n
            ? "empty"
            : "ready",
        chainId: binding.chainId,
        pairAddress: binding.pair,
        paymentSymbol,
        tokenDecimals: Number(tokenDecimals),
        paymentDecimals: Number(paymentDecimals),
        price,
        tokenReserve: tokenReserve.toString(),
        paymentReserve: paymentReserve.toString()
      };
    } finally {
      provider.destroy();
    }
  }

  async quote(buyInput: unknown, amountInput: unknown) {
    if (
      typeof buyInput !== "boolean" ||
      typeof amountInput !== "string" ||
      !/^[1-9]\d{0,77}$/.test(amountInput)
    ) {
      throw new BadRequestException("报价方向或输入数量无效。");
    }
    const binding = await this.getBinding();
    const provider = await this.getProvider(binding);
    try {
      const token = new Contract(binding.token, erc20Interface, provider);
      if (
        !(await new Contract(
          binding.token,
          projectTokenInterface,
          provider
        ).getFunction("tradingOpen")())
      ) {
        throw new ServiceUnavailableException("代币交易尚未开放。");
      }
      const payment = (await token.getFunction("paymentToken")()) as string;
      const input = buyInput ? payment : binding.token;
      const output = buyInput ? binding.token : payment;
      const routerAddress = await this.getRouterAddress(binding, provider);
      const router = new Contract(routerAddress, routerInterface, provider);
      let routedInput = BigInt(amountInput);
      if (!buyInput) {
        const rates = (await token.getFunction("effectiveSellTaxBps")()) as [
          bigint,
          bigint
        ];
        routedInput =
          (routedInput * (10_000n - BigInt(rates[0]) - BigInt(rates[1]))) /
          10_000n;
      }
      const amounts = (await router.getFunction("getAmountsOut")(routedInput, [
        input,
        output
      ])) as bigint[];
      if (amounts.length !== 2 || amounts[1] === undefined) {
        throw new ServiceUnavailableException("路由器报价格式无效。");
      }
      const netOut = buyInput ? (amounts[1] * 9_700n) / 10_000n : amounts[1];
      const settings = await this.databaseService
        .getPool()
        .query<{ slippage_bps: number }>(
          "SELECT slippage_bps FROM trade_executor_settings WHERE singleton = TRUE"
        );
      const slippageBps = settings.rows[0]?.slippage_bps ?? 100;
      const minimum = (netOut * BigInt(10_000 - slippageBps)) / 10_000n;
      return {
        amountOut: netOut.toString(),
        minOut: minimum.toString(),
        slippageBps
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
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
        .query(
          "SELECT slippage_bps, updated_at FROM trade_executor_settings WHERE singleton = TRUE"
        ),
      this.databaseService
        .getPool()
        .query(
          "SELECT state, native_balance, last_attempt_at, last_transaction_hash, last_error, updated_at FROM trade_executor_heartbeat WHERE singleton = TRUE"
        ),
      this.databaseService
        .getPool()
        .query(
          "SELECT state, last_block, last_error, updated_at FROM market_indexer_heartbeat WHERE singleton = TRUE"
        )
    ]);
    return {
      settings: settings.rows[0] ?? null,
      executor: heartbeat.rows[0] ?? null,
      indexer: indexer.rows[0] ?? null
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
      [value, adminId]
    );
    return this.getSettings();
  }
}
