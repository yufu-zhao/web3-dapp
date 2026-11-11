<template>
  <div class="trade-layout">
    <div class="market-column">
      <section class="panel market-panel">
        <header class="market-heading">
          <div>
            <span class="eyebrow">{{ t("trading_market_title") }}</span>
            <h2>
              {{ tokenSymbol }}
              <span>/ {{ paymentSymbol }}</span>
            </h2>
          </div>
          <button
            class="refresh-button"
            type="button"
            :disabled="marketLoading"
            :aria-label="t('trading_refresh')"
            @click="loadMarket"
          >
            <q-icon name="refresh" :class="{ spinning: marketLoading }" />
          </button>
        </header>

        <div v-if="marketError" class="state-box error" role="alert">
          <span>{{ marketError }}</span>
          <button type="button" @click="loadMarket">{{ t("text_b8784c8dd563") }}</button>
        </div>
        <template v-else>
          <div class="market-price">
            <strong>{{ market?.price ? formatPrice(market.price) : "—" }}</strong>
            <small>{{ paymentSymbol }}</small>
            <span class="market-state" :class="`state-${market?.state ?? 'loading'}`">
              {{
                market?.state === "ready"
                  ? t("trading_market_live")
                  : market?.state === "not-open"
                    ? t("trading_market_not_open")
                    : marketLoading
                      ? t("trading_loading")
                      : t("trading_market_empty")
              }}
            </span>
          </div>

          <div class="chart-toolbar">
            <div class="interval-tabs">
              <button
                v-for="item in intervals"
                :key="item.value"
                type="button"
                :class="{ active: interval === item.value }"
                @click="changeInterval(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
            <span v-if="candles.length">{{ candles.length }} {{ t("trading_candles") }}</span>
          </div>
          <div v-if="chartLoading" class="chart-placeholder"><q-spinner-dots color="primary" size="28px" /></div>
          <div v-else-if="chartError" class="chart-placeholder chart-error" role="status">{{ chartError }}</div>
          <div v-else-if="!candles.length" class="chart-placeholder">
            <q-icon name="show_chart" />
            <strong>{{ t("trading_no_candles") }}</strong>
            <span>{{ t("trading_no_candles_hint") }}</span>
          </div>
          <svg v-else class="candle-chart" viewBox="0 0 800 250" role="img" :aria-label="t('trading_candle_chart')">
            <g v-for="candle in chartData" :key="candle.timestamp">
              <line
                :x1="candle.x"
                :x2="candle.x"
                :y1="candle.highY"
                :y2="candle.lowY"
                :class="candle.rising ? 'rise-stroke' : 'fall-stroke'"
              />
              <rect
                :x="candle.x - chartBarWidth / 2"
                :y="Math.min(candle.openY, candle.closeY)"
                :width="chartBarWidth"
                :height="Math.max(2, Math.abs(candle.closeY - candle.openY))"
                :class="candle.rising ? 'rise-fill' : 'fall-fill'"
                rx="1"
              />
            </g>
          </svg>
        </template>
        <div class="market-meta">
          <div>
            <span>{{ t("trading_24h_high") }}</span>
            <b>{{ formatPrice(dayHigh) }}</b>
          </div>
          <div>
            <span>{{ t("trading_24h_low") }}</span>
            <b>{{ formatPrice(dayLow) }}</b>
          </div>
          <div>
            <span>{{ t("trading_24h_volume") }}</span>
            <b>{{ dayVolume }}</b>
          </div>
        </div>
      </section>

      <section class="panel recent-trades">
        <header class="section-heading">
          <h3>{{ t("trading_recent") }}</h3>
          <span>{{ trades.length }}</span>
        </header>
        <div v-if="tradeError" class="empty-inline">{{ tradeError }}</div>
        <div v-else-if="!trades.length" class="empty-inline">{{ t("trading_no_trades") }}</div>
        <div v-for="trade in trades" :key="`${trade.transaction_hash}-${trade.log_index}`" class="trade-row">
          <span>{{ formatTime(trade.block_timestamp) }}</span>
          <b>{{ formatPrice(trade.price) }}</b>
          <span>{{ formatTokenAmount(trade.token_volume) }} {{ tokenSymbol }}</span>
        </div>
      </section>
    </div>

    <section class="panel order-panel">
      <header class="section-heading order-heading">
        <div>
          <span class="eyebrow">{{ t("trading_order_title") }}</span>
          <h2>{{ tokenSymbol }} / {{ paymentSymbol }}</h2>
        </div>
        <span class="chain-pill">{{ t("trading_chain", { chainId: chainId ?? "—" }) }}</span>
      </header>

      <div class="segmented side-switch">
        <button type="button" :class="{ selected: side === 'buy' }" @click="side = 'buy'">
          {{ t("text_a1557ec3b077") }}
        </button>
        <button type="button" :class="{ selected: side === 'sell' }" @click="side = 'sell'">
          {{ t("text_fb28ba14091d") }}
        </button>
      </div>
      <div class="order-tabs">
        <button type="button" :class="{ selected: orderType === 'market' }" @click="orderType = 'market'">
          {{ t("text_af4f2ee25580") }}
        </button>
        <button type="button" :class="{ selected: orderType === 'limit' }" @click="orderType = 'limit'">
          {{ t("text_65cdbf4af6df") }}
        </button>
      </div>

      <label class="field-label" for="trade-price">
        {{ t("trading_limit_price") }}
        <span>{{ paymentSymbol }} / {{ tokenSymbol }}</span>
      </label>
      <input
        id="trade-price"
        v-model.trim="price"
        class="field"
        inputmode="decimal"
        type="number"
        min="0"
        step="any"
        :disabled="orderType === 'market'"
        :placeholder="orderType === 'market' ? t('trading_market_price') : t('text_ba5f23926f42')"
      />

      <label class="field-label" for="trade-amount">
        {{ t("trading_amount") }}
        <span>{{ side === "buy" && orderType === "market" ? paymentSymbol : tokenSymbol }}</span>
      </label>
      <input
        id="trade-amount"
        v-model.trim="amount"
        class="field"
        inputmode="decimal"
        type="number"
        min="0"
        step="any"
        :placeholder="t('text_ec6ac20e4abe')"
        @input="refreshQuote"
      />
      <div class="balance-line">
        <span>{{ t("trading_available") }}</span>
        <span>{{ availableBalance }} {{ inputSymbol }}</span>
      </div>
      <div v-if="orderType === 'market' && quotedOut" class="quote-line">
        <span>{{ t("trading_estimated_receive") }}</span>
        <b>{{ quotedOut }} {{ outputSymbol }}</b>
      </div>
      <div v-if="orderType === 'limit'" class="quote-line">
        <span>{{ t("trading_validity") }}</span>
        <b>30 {{ t("trading_minutes") }}</b>
      </div>

      <div v-if="!wallet" class="wallet-hint">{{ t("trading_connect_wallet") }}</div>
      <div v-else-if="wallet.chainId !== chainId" class="wallet-hint error">
        {{ t("text_bcc87d162a38", { chainId }) }}
      </div>
      <button
        class="button primary full submit-button"
        type="button"
        :disabled="busy || !wallet || wallet.chainId !== chainId || !market || market.state !== 'ready'"
        @click="submitOrder"
      >
        <q-spinner v-if="busy" size="18px" />
        {{ busy ? actionLabel : `${side === "buy" ? t("text_a1557ec3b077") : t("text_fb28ba14091d")} ${tokenSymbol}` }}
      </button>
      <p class="safety-note">{{ orderType === "limit" ? t("trading_limit_note") : t("trading_market_note") }}</p>

      <section class="orders-section">
        <header class="section-heading">
          <h3>{{ t("trading_my_orders") }}</h3>
          <button type="button" :disabled="ordersLoading" @click="loadOrders">{{ t("trading_refresh") }}</button>
        </header>
        <div v-if="ordersLoading" class="empty-inline">{{ t("trading_loading") }}</div>
        <div v-else-if="ordersError" class="empty-inline error">{{ ordersError }}</div>
        <div v-else-if="!orders.length" class="empty-inline">{{ t("trading_no_orders") }}</div>
        <article v-for="order in orders" :key="order.order_hash" class="user-order">
          <div class="user-order-top">
            <b :class="order.is_buy ? 'buy-text' : 'sell-text'">
              {{ order.is_buy ? t("text_a1557ec3b077") : t("text_fb28ba14091d") }} · {{ statusLabel(order.status) }}
            </b>
            <button v-if="order.status === 'pending'" type="button" :disabled="busy" @click="cancelOrder(order)">
              {{ t("trading_cancel") }}
            </button>
          </div>
          <span>
            {{ t("trading_min_receive") }} {{ formatIntegerAmount(order) }}
            {{ order.is_buy ? tokenSymbol : paymentSymbol }}
          </span>
          <span v-if="order.transaction_hash" class="tx-hash">{{ compactHash(order.transaction_hash) }}</span>
        </article>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { BrowserProvider, Contract, formatUnits, parseUnits, randomBytes, hexlify } from "ethers";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Notify } from "quasar";
import { useI18n } from "vue-i18n";
import { useWalletConnection, type ConnectedWallet } from "@chainforge/wallet-connect";

const props = defineProps<{ tokenSymbol: string }>();
const { t } = useI18n();
const { wallet } = useWalletConnection();
const side = ref<"buy" | "sell">("buy");
const orderType = ref<"market" | "limit">("market");
const price = ref("");
const amount = ref("");
const market = ref<{
  state: string;
  chainId: number;
  pairAddress: string;
  price: string | null;
  paymentSymbol: string;
  tokenDecimals: number;
  paymentDecimals: number;
} | null>(null);
const marketError = ref("");
const marketLoading = ref(false);
const candles = ref<Candle[]>([]);
const chartError = ref("");
const chartLoading = ref(false);
const trades = ref<Trade[]>([]);
const tradeError = ref("");
const orders = ref<UserOrder[]>([]);
const ordersError = ref("");
const ordersLoading = ref(false);
const busy = ref(false);
const actionLabel = ref("");
const quotedOut = ref("");
const availableBalance = ref("—");
const paymentSymbol = ref("USDT");
const tokenDecimals = computed(() => market.value?.tokenDecimals ?? 18);
const paymentDecimals = computed(() => market.value?.paymentDecimals ?? 6);
const inputSymbol = computed(() => (side.value === "buy" ? paymentSymbol.value : props.tokenSymbol));
const outputSymbol = computed(() =>
  side.value === "buy" && orderType.value === "market" ? props.tokenSymbol : paymentSymbol.value,
);
const chainId = computed(() => market.value?.chainId ?? null);
const interval = ref("5m");
const intervals = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1d" },
];
interface Candle {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  payment_volume: string;
  trades: string;
}
interface Trade {
  transaction_hash: string;
  block_number: string;
  block_timestamp: string;
  log_index: number;
  price: string;
  token_volume: string;
}
interface UserOrder {
  order_hash: string;
  owner_address: string;
  is_buy: boolean;
  amount_in: string;
  min_out: string;
  issued_at: string;
  expires_at: string;
  salt: string;
  status: string;
  transaction_hash: string | null;
}
interface Binding {
  chainId: number;
  token: string;
  orders: string;
}
const orderAbi = [
  "function router() view returns(address)",
  "function cancelOrder((address owner,bool buy,uint256 amountIn,uint256 minOut,uint64 issuedAt,uint64 expiry,uint256 salt) order)",
];
const tokenAbi = [
  "function paymentToken() view returns(address)",
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
];
const routerAbi = [
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
];
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
let quoteTimer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const chartData = computed(() => {
  if (!candles.value.length) return [];
  const values = candles.value.flatMap((item) => [Number(item.high), Number(item.low)]).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return candles.value.map((item, index) => {
    const y = (value: string) => 226 - ((Number(value) - min) / range) * 210;
    return {
      timestamp: item.timestamp,
      x: 14 + (index + 0.5) * (772 / candles.value.length),
      openY: y(item.open),
      closeY: y(item.close),
      highY: y(item.high),
      lowY: y(item.low),
      rising: Number(item.close) >= Number(item.open),
    };
  });
});
const chartBarWidth = computed(() => Math.max(2, Math.min(10, 700 / Math.max(1, candles.value.length))));
const dayCandles = computed(() =>
  candles.value.filter((item) => Number(item.timestamp) >= Math.floor(Date.now() / 1000) - 86400),
);
const dayHigh = computed(() =>
  dayCandles.value.length ? Math.max(...dayCandles.value.map((item) => Number(item.high))).toString() : "—",
);
const dayLow = computed(() =>
  dayCandles.value.length ? Math.min(...dayCandles.value.map((item) => Number(item.low))).toString() : "—",
);
const dayVolume = computed(() =>
  dayCandles.value
    .reduce((sum, item) => sum + Number(formatUnits(item.payment_volume, paymentDecimals.value)), 0)
    .toLocaleString(undefined, { maximumFractionDigits: 2 }),
);

async function jsonApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(typeof body?.message === "string" ? body.message : t("trading_api_error"));
  }
  return response.json() as Promise<T>;
}

async function loadMarket() {
  marketLoading.value = true;
  marketError.value = "";
  try {
    market.value = await jsonApi("/public/limit-orders/market");
    if (market.value) paymentSymbol.value = market.value.paymentSymbol;
  } catch (error) {
    marketError.value = error instanceof Error ? error.message : t("trading_market_error");
  } finally {
    marketLoading.value = false;
  }
  await Promise.all([loadCandles(), loadTrades(), loadWalletBalance()]);
}

async function loadCandles() {
  chartLoading.value = true;
  chartError.value = "";
  try {
    const now = Math.floor(Date.now() / 1000);
    const span = interval.value === "1d" ? 90 * 86400 : interval.value === "4h" ? 30 * 86400 : 7 * 86400;
    const result = await jsonApi<{ candles: Candle[] }>(
      `/public/limit-orders/candles?interval=${interval.value}&from=${now - span}&to=${now}`,
    );
    candles.value = result.candles;
  } catch (error) {
    chartError.value = error instanceof Error ? error.message : t("trading_chart_error");
  } finally {
    chartLoading.value = false;
  }
}

async function loadTrades() {
  try {
    const result = await jsonApi<{ trades: Trade[] }>("/public/limit-orders/trades?limit=20");
    trades.value = result.trades;
    tradeError.value = "";
  } catch (error) {
    trades.value = [];
    tradeError.value = error instanceof Error ? error.message : t("trading_trades_error");
  }
}

async function loadOrders() {
  if (!wallet.value) {
    orders.value = [];
    return;
  }
  ordersLoading.value = true;
  ordersError.value = "";
  try {
    const result = await jsonApi<{ orders: UserOrder[] }>(`/public/limit-orders/orders/${wallet.value.address}`);
    orders.value = result.orders;
  } catch (error) {
    ordersError.value = error instanceof Error ? error.message : t("trading_orders_error");
  } finally {
    ordersLoading.value = false;
  }
}

async function getBinding() {
  const data = await jsonApi<{ state: string; chainId: number; contracts: Record<string, string> }>(
    "/public/runtime-contracts",
  );
  if (data.state !== "bound" || !data.contracts?.TokenLimitOrders || !data.contracts?.ProjectToken)
    throw new Error(t("trading_unbound"));
  return {
    chainId: data.chainId,
    token: data.contracts.ProjectToken,
    orders: data.contracts.TokenLimitOrders,
  } satisfies Binding;
}

async function createContext(expected: ConnectedWallet) {
  const binding = await getBinding();
  const provider = new BrowserProvider(expected.provider as never);
  const [chain, accounts] = await Promise.all([provider.send("eth_chainId", []), provider.send("eth_accounts", [])]);
  if (
    Number(chain) !== binding.chainId ||
    !Array.isArray(accounts) ||
    String(accounts[0]).toLowerCase() !== expected.address.toLowerCase() ||
    wallet.value?.address.toLowerCase() !== expected.address.toLowerCase() ||
    wallet.value?.chainId !== binding.chainId
  ) {
    throw new Error(t("text_8630d001179c", { chainId: binding.chainId }));
  }
  const signer = await provider.getSigner(expected.address);
  const ordersContract = new Contract(binding.orders, orderAbi, signer);
  const token = new Contract(binding.token, tokenAbi, provider);
  const payment = String(await token.getFunction("paymentToken")());
  const router = String(await ordersContract.getFunction("router")());
  return { binding, provider, signer, ordersContract, token, payment, router };
}

async function ensureAllowance(
  ctx: Awaited<ReturnType<typeof createContext>>,
  inputAddress: string,
  amountIn: bigint,
  expected: ConnectedWallet,
) {
  const inputToken = new Contract(inputAddress, tokenAbi, ctx.provider);
  const allowance = BigInt(await inputToken.getFunction("allowance")(expected.address, ctx.binding.orders));
  if (allowance >= amountIn) return;
  await assertWallet(expected, ctx.binding.chainId);
  actionLabel.value = t("trading_approve");
  const tokenWrite = inputToken.connect(ctx.signer) as Contract;
  const approval = await tokenWrite.getFunction("approve")(ctx.binding.orders, amountIn);
  const receipt = await ctx.provider.waitForTransaction(String(approval.hash), 1, 120_000);
  if (!receipt || receipt.status !== 1) throw new Error(t("text_876e0778e352"));
  await assertWallet(expected, ctx.binding.chainId);
}

async function assertWallet(expected: ConnectedWallet, targetChainId: number) {
  const provider = new BrowserProvider(expected.provider as never);
  const [chain, accounts] = await Promise.all([provider.send("eth_chainId", []), provider.send("eth_accounts", [])]);
  if (
    Number(chain) !== targetChainId ||
    !Array.isArray(accounts) ||
    String(accounts[0]).toLowerCase() !== expected.address.toLowerCase() ||
    wallet.value?.address.toLowerCase() !== expected.address.toLowerCase() ||
    wallet.value?.chainId !== targetChainId
  )
    throw new Error(t("trading_wallet_changed"));
}

async function loadWalletBalance() {
  availableBalance.value = "—";
  if (!wallet.value || !market.value?.chainId) return;
  try {
    const ctx = await createContext(wallet.value);
    const tokenDecimals = Number(await ctx.token.getFunction("decimals")());
    const paymentToken = new Contract(ctx.payment, tokenAbi, ctx.provider);
    const [paymentDecimals, inputAddress] = await Promise.all([
      paymentToken.getFunction("decimals")() as Promise<number>,
      Promise.resolve(side.value === "buy" ? ctx.payment : ctx.binding.token),
    ]);
    paymentSymbol.value = "USDT";
    const input = new Contract(inputAddress, tokenAbi, ctx.provider);
    const decimals = inputAddress.toLowerCase() === ctx.payment.toLowerCase() ? paymentDecimals : tokenDecimals;
    availableBalance.value = formatUnits(await input.getFunction("balanceOf")(wallet.value.address), decimals);
    paymentSymbol.value = String(await paymentToken.getFunction("symbol")());
    ctx.provider.destroy();
  } catch {
    availableBalance.value = "—";
  }
}

async function refreshQuote() {
  if (quoteTimer) clearTimeout(quoteTimer);
  quotedOut.value = "";
  if (orderType.value !== "market" || !amount.value || !/^(?:\d+\.?\d*|\.\d+)$/.test(amount.value)) return;
  quoteTimer = setTimeout(async () => {
    try {
      const current = wallet.value;
      if (!current) return;
      const binding = await getBinding();
      const provider = new BrowserProvider(current.provider as never);
      const token = new Contract(binding.token, tokenAbi, provider);
      const payment = String(await token.getFunction("paymentToken")());
      const tokenDecimals = Number(await token.getFunction("decimals")());
      const paymentDecimals = Number(await new Contract(payment, tokenAbi, provider).getFunction("decimals")());
      const inputIsPayment = side.value === "buy";
      const amountIn = parseUnits(amount.value, inputIsPayment ? paymentDecimals : tokenDecimals);
      const quote = await jsonApi<{ amountOut: string; minOut: string }>(
        `/public/limit-orders/quote?buy=${side.value === "buy"}&amountIn=${amountIn}`,
      );
      quotedOut.value = formatUnits(quote.amountOut, inputIsPayment ? tokenDecimals : paymentDecimals);
      provider.destroy();
    } catch {
      quotedOut.value = "";
    }
  }, 350);
}

async function submitOrder() {
  const expected = wallet.value;
  if (!expected || busy.value) return;
  busy.value = true;
  try {
    const ctx = await createContext(expected);
    const tokenDecimals = Number(await ctx.token.getFunction("decimals")());
    const paymentContract = new Contract(ctx.payment, tokenAbi, ctx.provider);
    const paymentDecimals = Number(await paymentContract.getFunction("decimals")());
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(amount.value) || Number(amount.value) <= 0)
      throw new Error(t("text_32960f85c70d"));
    if (orderType.value === "market") {
      const inputIsPayment = side.value === "buy";
      const inputAddress = inputIsPayment ? ctx.payment : ctx.binding.token;
      const inputDecimals = inputIsPayment ? paymentDecimals : tokenDecimals;
      const inputAmount = parseUnits(amount.value, inputDecimals);
      const quote = await jsonApi<{ minOut: string }>(
        `/public/limit-orders/quote?buy=${side.value === "buy"}&amountIn=${inputAmount}`,
      );
      await ensureAllowance(ctx, inputAddress, inputAmount, expected);
      await assertWallet(expected, ctx.binding.chainId);
      actionLabel.value = t("trading_wait_wallet");
      const router = new Contract(ctx.router, routerAbi, ctx.signer);
      const path = inputIsPayment ? [ctx.payment, ctx.binding.token] : [ctx.binding.token, ctx.payment];
      const tx = await router.getFunction("swapExactTokensForTokensSupportingFeeOnTransferTokens")(
        inputAmount,
        BigInt(quote.minOut),
        path,
        expected.address,
        Math.floor(Date.now() / 1000) + 120,
      );
      const receipt = await ctx.provider.waitForTransaction(String(tx.hash), 1, 120_000);
      if (!receipt || receipt.status !== 1) throw new Error(t("text_876e0778e352"));
      Notify.create({
        type: "positive",
        message: t("trading_market_confirmed", { hash: compactHash(String(tx.hash)) }),
        position: "top",
      });
    } else {
      if (!price.value || !/^(?:\d+\.?\d*|\.\d+)$/.test(price.value) || Number(price.value) <= 0)
        throw new Error(t("trading_price_required"));
      const amountToken = parseUnits(amount.value, tokenDecimals);
      const priceScaled = parseUnits(price.value, 18);
      const quoteAmount =
        (priceScaled * amountToken * 10n ** BigInt(paymentDecimals)) / (10n ** 18n * 10n ** BigInt(tokenDecimals));
      const buy = side.value === "buy";
      const amountIn = buy ? quoteAmount : amountToken;
      const minOut = buy ? amountToken : quoteAmount;
      if (amountIn <= 0n || minOut <= 0n) throw new Error(t("text_32960f85c70d"));
      const inputAddress = buy ? ctx.payment : ctx.binding.token;
      await ensureAllowance(ctx, inputAddress, amountIn, expected);
      await assertWallet(expected, ctx.binding.chainId);
      const block = await ctx.provider.getBlock("latest");
      if (!block) throw new Error(t("text_e1880ab0704b"));
      const order = {
        owner: expected.address,
        buy,
        amountIn: amountIn.toString(),
        minOut: minOut.toString(),
        issuedAt: block.timestamp,
        expiry: block.timestamp + 1800,
        salt: BigInt(hexlify(randomBytes(32))).toString(),
      };
      actionLabel.value = t("trading_sign_order");
      const signature = await ctx.signer.signTypedData(
        {
          name: "ChainForge Signed Limit Orders",
          version: "1",
          chainId: ctx.binding.chainId,
          verifyingContract: ctx.binding.orders,
        },
        orderTypes,
        order,
      );
      await assertWallet(expected, ctx.binding.chainId);
      actionLabel.value = t("trading_save_order");
      const result = await jsonApi<{ orderHash: string }>("/public/limit-orders/orders", {
        method: "POST",
        body: JSON.stringify({ order, signature }),
      });
      Notify.create({
        type: "positive",
        message: t("trading_order_submitted", { hash: compactHash(result.orderHash) }),
        position: "top",
      });
      await loadOrders();
    }
    amount.value = "";
    quotedOut.value = "";
    await loadWalletBalance();
  } catch (error) {
    const message = error instanceof Error ? error.message : t("text_49a60439db7d");
    const code =
      typeof error === "object" && error !== null && "code" in error ? Number((error as { code: unknown }).code) : 0;
    Notify.create({ type: "negative", message: code === 4001 ? t("text_c65c7ec95ec4") : message, position: "top" });
  } finally {
    busy.value = false;
    actionLabel.value = "";
  }
}

async function cancelOrder(order: UserOrder) {
  const expected = wallet.value;
  if (!expected || busy.value) return;
  busy.value = true;
  try {
    const ctx = await createContext(expected);
    await assertWallet(expected, ctx.binding.chainId);
    actionLabel.value = t("trading_cancel_wait");
    const tx = await ctx.ordersContract.getFunction("cancelOrder")({
      owner: order.owner_address,
      buy: order.is_buy,
      amountIn: order.amount_in,
      minOut: order.min_out,
      issuedAt: order.issued_at,
      expiry: order.expires_at,
      salt: order.salt,
    });
    const receipt = await ctx.provider.waitForTransaction(String(tx.hash), 1, 120_000);
    if (!receipt || receipt.status !== 1) throw new Error(t("text_876e0778e352"));
    Notify.create({ type: "positive", message: t("trading_cancelled"), position: "top" });
    await loadOrders();
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : t("trading_cancel_error"),
      position: "top",
    });
  } finally {
    busy.value = false;
    actionLabel.value = "";
  }
}

function changeInterval(value: string) {
  interval.value = value;
  void loadCandles();
}
function formatPrice(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 8 }) : "—";
}
function formatTokenAmount(raw: string) {
  try {
    return Number(formatUnits(raw, tokenDecimals.value)).toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch {
    return "—";
  }
}
function formatIntegerAmount(order: UserOrder) {
  return Number(formatUnits(order.min_out, order.is_buy ? tokenDecimals.value : paymentDecimals.value)).toLocaleString(
    undefined,
    { maximumFractionDigits: 6 },
  );
}
function formatTime(raw: string) {
  return new Date(Number(raw) * 1000).toLocaleTimeString();
}
function compactHash(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
function statusLabel(status: string) {
  return (
    (
      {
        pending: t("trading_status_pending"),
        executed: t("trading_status_executed"),
        cancelled: t("trading_status_cancelled"),
        expired: t("trading_status_expired"),
        failed: t("trading_status_failed"),
      } as Record<string, string>
    )[status] ?? status
  );
}

watch(
  () => [wallet.value?.address, side.value, orderType.value],
  () => {
    void loadWalletBalance();
    if (wallet.value) void loadOrders();
    void refreshQuote();
  },
);
onMounted(() => {
  void loadMarket();
  refreshTimer = setInterval(() => {
    void loadMarket();
    if (wallet.value) void loadOrders();
  }, 30_000);
});
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (quoteTimer) clearTimeout(quoteTimer);
});
</script>

<style lang="scss" scoped>
.trade-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.8fr);
  gap: 20px;
  align-items: start;
}
.market-column {
  display: grid;
  gap: 18px;
  min-width: 0;
}
.market-panel,
.order-panel,
.recent-trades {
  padding: 22px;
  border: 1px solid rgba(225, 186, 101, 0.15);
  border-radius: 18px;
  background: linear-gradient(145deg, #171918, #101211);
}
.market-heading,
.section-heading,
.user-order-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.market-heading h2,
.order-heading h2 {
  margin: 5px 0 0;
  color: #f7f4ed;
  font-size: 21px;
}
.market-heading h2 span {
  color: #92958e;
  font-weight: 400;
}
.eyebrow {
  color: #caa75f;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
}
.refresh-button {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid #343a35;
  border-radius: 50%;
  background: #202420;
  color: #caa75f;
  cursor: pointer;
}
.spinning {
  animation: spin 1s linear infinite;
}
.market-price {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 20px 0 12px;
}
.market-price strong {
  color: #f2eee4;
  font-size: clamp(28px, 4vw, 40px);
  font-variant-numeric: tabular-nums;
}
.market-price small,
.market-state {
  color: #a3a69f;
}
.market-state {
  margin-left: auto;
  font-size: 12px;
}
.state-ready {
  color: #87c99e;
}
.state-empty,
.state-loading {
  color: #c7a866;
}
.chart-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #868c85;
  font-size: 11px;
}
.interval-tabs {
  display: flex;
  gap: 5px;
}
.interval-tabs button {
  padding: 6px 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #8d928c;
  cursor: pointer;
}
.interval-tabs button.active {
  background: rgba(202, 167, 95, 0.16);
  color: #e5c579;
}
.candle-chart {
  display: block;
  width: 100%;
  height: 250px;
  margin: 12px 0;
  overflow: visible;
}
.candle-chart line {
  stroke-width: 1.5;
}
.rise-stroke {
  stroke: #42b983;
}
.fall-stroke {
  stroke: #df6b69;
}
.rise-fill {
  fill: #42b983;
}
.fall-fill {
  fill: #df6b69;
}
.chart-placeholder {
  display: flex;
  height: 250px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #92978f;
  text-align: center;
}
.chart-placeholder .q-icon {
  font-size: 32px;
  color: #caa75f;
}
.chart-placeholder strong {
  color: #d8d4c9;
}
.chart-placeholder span {
  font-size: 12px;
}
.market-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid #292f2b;
}
.market-meta div {
  display: grid;
  gap: 5px;
}
.market-meta span,
.balance-line,
.quote-line {
  color: #858b84;
  font-size: 11px;
}
.market-meta b {
  color: #ddd9ce;
  font-size: 12px;
  font-weight: 600;
}
.section-heading h3 {
  margin: 0;
  color: #e9e5da;
  font-size: 15px;
}
.section-heading > span {
  color: #878e86;
  font-size: 12px;
}
.trade-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1.2fr;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid #272d29;
  color: #969b94;
  font-size: 11px;
}
.trade-row:last-child {
  border-bottom: 0;
}
.trade-row b {
  color: #e4dfd3;
  font-variant-numeric: tabular-nums;
}
.order-panel {
  position: sticky;
  top: 20px;
}
.order-heading {
  margin-bottom: 18px;
}
.chain-pill {
  padding: 6px 9px;
  border: 1px solid #383c34;
  border-radius: 99px;
  color: #b3b5ad;
  font-size: 10px;
  white-space: nowrap;
}
.segmented,
.order-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 5px;
  margin-bottom: 14px;
  padding: 4px;
  border-radius: 10px;
  background: #0d100e;
}
.segmented button,
.order-tabs button {
  border: 0;
  border-radius: 8px;
  padding: 9px;
  background: transparent;
  color: #8f948e;
  cursor: pointer;
  font-size: 12px;
}
.segmented button.selected {
  background: #1f3328;
  color: #74d49a;
}
.segmented button:last-child.selected {
  background: #3b2524;
  color: #ed8a82;
}
.order-tabs button.selected {
  background: #262a25;
  color: #e6c577;
}
.field-label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 16px 0 7px;
  color: #c4c4bc;
  font-size: 12px;
}
.field-label span {
  color: #828982;
}
.field {
  box-sizing: border-box;
  width: 100%;
  min-height: 46px;
  padding: 0 13px;
  border: 1px solid #333a34;
  border-radius: 10px;
  outline: none;
  background: #0e110f;
  color: #f1eee5;
  font: inherit;
}
.field:focus {
  border-color: #be9c55;
}
.field:disabled {
  color: #777d76;
}
.balance-line,
.quote-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}
.balance-line span:last-child,
.quote-line b {
  color: #c8c8bf;
  font-weight: 500;
}
.quote-line {
  padding-top: 11px;
  border-top: 1px solid #292f2b;
}
.submit-button {
  display: flex;
  min-height: 46px;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
}
.safety-note,
.wallet-hint {
  margin: 12px 0 0;
  color: #8f948c;
  font-size: 11px;
  line-height: 1.6;
}
.wallet-hint {
  padding: 10px 12px;
  border: 1px solid #45402f;
  border-radius: 9px;
  background: #211e16;
}
.wallet-hint.error,
.error {
  color: #ed8a82;
}
.orders-section {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid #2b302c;
}
.orders-section .section-heading {
  margin-bottom: 12px;
}
.orders-section button,
.state-box button {
  border: 0;
  background: transparent;
  color: #d1ae63;
  cursor: pointer;
  font-size: 11px;
}
.empty-inline {
  padding: 18px 5px;
  color: #828981;
  font-size: 12px;
  text-align: center;
}
.user-order {
  display: grid;
  gap: 7px;
  padding: 12px 0;
  border-bottom: 1px solid #282e29;
  color: #979c94;
  font-size: 11px;
}
.user-order:last-child {
  border: 0;
}
.user-order-top b {
  font-size: 12px;
}
.buy-text {
  color: #74d49a;
}
.sell-text {
  color: #ed8a82;
}
.tx-hash {
  color: #c3a25d;
  font-family: monospace;
}
.state-box {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: #211b18;
  color: #eb9c8d;
  font-size: 12px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 900px) {
  .trade-layout {
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 14px;
  }
  .market-panel,
  .order-panel,
  .recent-trades {
    padding: 17px;
  }
}
@media (max-width: 720px) {
  .trade-layout {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .order-panel {
    position: static;
  }
  .market-price strong {
    font-size: 29px;
  }
  .market-meta {
    gap: 6px;
  }
  .market-meta span {
    font-size: 10px;
  }
  .market-meta b {
    font-size: 11px;
  }
  .candle-chart,
  .chart-placeholder {
    height: 200px;
  }
}
</style>
