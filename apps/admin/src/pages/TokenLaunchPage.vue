<template>
  <section class="launch-page">
    <q-card flat bordered class="panel intro-panel">
      <q-card-section class="row items-center q-col-gutter-md">
        <div class="col">
          <div class="eyebrow">TOKEN LAUNCH</div>
          <h2>代币发行 / 开盘</h2>
          <p>按链上合约要求完成私募结算、初始流动性准备和开盘排期。</p>
        </div>
        <q-btn
          flat
          round
          icon="refresh"
          :loading="loading"
          :disable="busy"
          aria-label="刷新链上状态"
          @click="refresh"
        >
          <q-tooltip>刷新链上状态</q-tooltip>
        </q-btn>
        <WalletConnect
          :confirm-changes="true"
          @connected="onWallet"
          @changed="onWallet"
          @disconnected="onDisconnect"
          @change-pending="onPending"
        />
      </q-card-section>
      <q-card-section v-if="binding" class="binding-details">
        <span>网络 Chain ID {{ binding.chainId }}</span>
        <span>
          代币
          <code>{{ binding.token }}</code>
        </span>
        <span>
          私募
          <code>{{ binding.sale }}</code>
        </span>
      </q-card-section>
    </q-card>

    <q-card
      v-if="!binding && !loading && !error"
      flat
      bordered
      class="panel empty-panel"
    >
      <q-icon name="link_off" size="36px" color="grey-6" />
      <strong>尚未绑定部署</strong>
      <span>请先在安装器完成部署绑定，再返回此页面查看发行状态。</span>
    </q-card>
    <q-card v-if="error && !snapshot" flat bordered class="panel empty-panel">
      <q-icon name="error_outline" size="36px" color="negative" />
      <strong>发行状态读取失败</strong>
      <span>{{ error }}</span>
      <q-btn
        color="primary"
        flat
        label="重试"
        :loading="loading"
        @click="refreshPage"
      />
    </q-card>
    <q-card
      v-else-if="binding && !wallet"
      flat
      bordered
      class="panel empty-panel"
    >
      <q-icon name="account_balance_wallet" size="36px" color="primary" />
      <strong>连接有权限的钱包以读取链上发行状态</strong>
      <span>所有状态都以绑定网络上的合约和区块时间为准。</span>
    </q-card>
    <q-card
      v-else-if="loading && !snapshot"
      flat
      bordered
      class="panel loading-panel"
    >
      <q-spinner color="primary" size="32px" />
      <span>正在读取私募、交易对和流动性状态…</span>
    </q-card>

    <template v-if="snapshot">
      <q-card flat bordered class="status-overview panel">
        <div
          class="status-icon"
          :class="snapshot.tradingOpen ? 'is-ready' : 'is-pending'"
        >
          <q-icon :name="snapshot.tradingOpen ? 'check_circle' : 'schedule'" />
        </div>
        <div class="status-copy">
          <div class="row items-center q-gutter-sm">
            <h3>{{
              snapshot.tradingOpen
                ? "交易已开放"
                : snapshot.launchTime
                  ? "开盘已排期"
                  : "开盘尚未开放"
            }}</h3>
            <q-badge
              :color="snapshot.tradingOpen ? 'positive' : 'warning'"
              :text-color="snapshot.tradingOpen ? 'white' : 'dark'"
              :label="
                snapshot.tradingOpen
                  ? '已开放'
                  : snapshot.launchTime
                    ? '已排期'
                    : '准备中'
              "
            />
          </div>
          <p v-if="snapshot.launchTime"
            >计划开盘时间：{{
              formatTime(snapshot.launchTime)
            }}（以链上区块时间为准）</p
          >
          <p v-else>
            {{ saleGateMessage }}
          </p>
        </div>
      </q-card>

      <div class="step-list">
        <q-card flat bordered class="step-card panel">
          <div
            class="step-number"
            :class="snapshot.allRoundsFinalized ? 'done' : ''"
          >
            <q-icon
              :name="snapshot.allRoundsFinalized ? 'check' : 'looks_one'"
            />
          </div>
          <div class="step-body">
            <div class="step-heading">
              <div>
                <h3>完成三期私募结算</h3>
                <p>{{ saleGateMessage }}</p>
              </div>
              <q-badge
                :color="snapshot.allRoundsFinalized ? 'positive' : 'grey-6'"
                :label="`${snapshot.cursor}/3 期已结算`"
              />
            </div>
            <div class="metric-row">
              <span>
                累计售出
                <strong
                  >{{ formatToken(snapshot.sold) }} / 3,000,000 FRC</strong
                >
              </span>
              <span>
                已接受募集款
                <strong
                  >{{ formatPayment(snapshot.acceptedPayment) }} USDT</strong
                >
              </span>
            </div>
            <q-linear-progress
              rounded
              size="7px"
              :value="Math.min(snapshot.cursor / 3, 1)"
              color="positive"
              track-color="grey-3"
            />
          </div>
        </q-card>

        <q-card flat bordered class="step-card panel">
          <div
            class="step-number"
            :class="snapshot.initialLiquidityFunded ? 'done' : ''"
          >
            <q-icon
              :name="snapshot.initialLiquidityFunded ? 'check' : 'looks_two'"
            />
          </div>
          <div class="step-body">
            <div class="step-heading">
              <div>
                <h3>划转初始流动性募集款</h3>
                <p>合约将 600,000 USDT 从私募托管合约划入流动性金库。</p>
              </div>
              <q-badge
                :color="snapshot.initialLiquidityFunded ? 'positive' : 'grey-6'"
                :label="snapshot.initialLiquidityFunded ? '已完成' : '待处理'"
              />
            </div>
            <q-btn
              v-if="!snapshot.initialLiquidityFunded"
              color="primary"
              unelevated
              label="划转 600,000 USDT"
              :disable="!canFund || busy"
              :loading="busy && activeAction === 'fund'"
              @click="runAction('fund')"
            />
            <div v-else class="step-success">
              <q-icon name="check_circle" />
              募集款已进入流动性金库
            </div>
          </div>
        </q-card>

        <q-card flat bordered class="step-card panel">
          <div
            class="step-number"
            :class="snapshot.initialSeeded ? 'done' : ''"
          >
            <q-icon :name="snapshot.initialSeeded ? 'check' : 'looks_3'" />
          </div>
          <div class="step-body">
            <div class="step-heading">
              <div>
                <h3>注入初始流动性</h3>
                <p
                  >按合约固定投入 1,710,000 FRC 和 600,000 USDT，LP
                  凭证由合约永久锁定。</p
                >
              </div>
              <q-badge
                :color="snapshot.initialSeeded ? 'positive' : 'grey-6'"
                :label="snapshot.initialSeeded ? '已完成' : '待处理'"
              />
            </div>
            <div v-if="snapshot.primaryPair" class="pair-details">
              <span>
                交易对
                <code>{{ snapshot.primaryPair }}</code>
              </span>
              <span>LP 总量 {{ formatToken(snapshot.pairSupply) }}</span>
              <span v-if="snapshot.expectedLP > 0n"
                >预计铸造约 {{ formatToken(snapshot.expectedLP) }} LP</span
              >
            </div>
            <q-input
              v-if="!snapshot.initialSeeded"
              v-model.trim="minimumLP"
              outlined
              dense
              class="minimum-lp-input"
              label="最低接收 LP 数量（18 位精度）"
              :disable="!canSeed || busy"
            >
              <template #hint
                >默认值按链上当前余额及约 1%
                滑点保护估算；可提高最低值。</template
              >
            </q-input>
            <q-btn
              v-if="!snapshot.initialSeeded"
              color="primary"
              unelevated
              label="注入初始流动性"
              :disable="!canSeed || busy || !minimumLP"
              :loading="busy && activeAction === 'seed'"
              @click="runAction('seed')"
            />
            <div v-else class="step-success">
              <q-icon name="check_circle" />
              初始流动性已注入
            </div>
          </div>
        </q-card>

        <q-card flat bordered class="step-card panel">
          <div class="step-number" :class="snapshot.launchTime ? 'done' : ''">
            <q-icon :name="snapshot.launchTime ? 'check' : 'looks_4'" />
          </div>
          <div class="step-body">
            <div class="step-heading">
              <div>
                <h3>安排代币开盘</h3>
                <p>选择未来的开盘时间。交易将在链上到达该时间后自动开放。</p>
              </div>
              <q-badge
                :color="snapshot.launchTime ? 'positive' : 'grey-6'"
                :label="snapshot.launchTime ? '已排期' : '待排期'"
              />
            </div>
            <div
              v-if="snapshot.primaryPair || snapshot.priceOracle"
              class="pair-details"
            >
              <span
                >交易对 {{ snapshot.primaryPair ? "已登记" : "未登记" }}</span
              >
              <span
                >价格预言机
                {{ snapshot.oracleConfigured ? "已登记" : "未登记" }}</span
              >
              <span
                >预言机采样
                {{ snapshot.oracleInitialized ? "已启动" : "开盘后启动" }}</span
              >
              <span
                >交易对储备
                {{ snapshot.reservesReady ? "已就绪" : "未就绪" }}</span
              >
            </div>
            <q-input
              v-if="!snapshot.launchTime"
              v-model="launchDateTime"
              outlined
              dense
              type="datetime-local"
              stack-label
              label="开盘时间"
              class="launch-time-input"
              :disable="!canSchedule || busy"
            />
            <q-btn
              v-if="!snapshot.launchTime"
              color="primary"
              unelevated
              label="安排开盘"
              :disable="!canSchedule || busy || !launchDateTime"
              :loading="busy && activeAction === 'schedule'"
              @click="runAction('schedule')"
            />
            <div v-else class="step-success">
              <q-icon name="event_available" />
              {{ formatTime(snapshot.launchTime) }}
            </div>
          </div>
        </q-card>

        <q-card flat bordered class="step-card panel">
          <div
            class="step-number"
            :class="snapshot.oracleInitialized ? 'done' : ''"
          >
            <q-icon
              :name="snapshot.oracleInitialized ? 'check' : 'monitor_heart'"
            />
          </div>
          <div class="step-body">
            <div class="step-heading">
              <div>
                <h3>启动开盘价格监控</h3>
                <p>
                  交易开放后启动价格预言机基准采样。此调用无参数、无需代币转账，需由管理员在后台单独确认。
                </p>
              </div>
              <q-badge
                :color="snapshot.oracleInitialized ? 'positive' : 'grey-6'"
                :label="
                  snapshot.oracleInitialized
                    ? '已启动'
                    : snapshot.tradingOpen
                      ? '待启动'
                      : '开盘后可用'
                "
              />
            </div>
            <q-btn
              v-if="!snapshot.oracleInitialized"
              color="primary"
              unelevated
              label="启动预言机采样"
              :disable="!canStartOracle || busy"
              :loading="busy && activeAction === 'oracle'"
              @click="runAction('oracle')"
            />
            <div v-else class="step-success">
              <q-icon name="check_circle" />
              预言机已开始记录开盘后的价格数据
            </div>
          </div>
        </q-card>
      </div>

      <q-banner v-if="!snapshot.active" rounded class="error-banner">
        当前私募模块未与绑定代币匹配，所有链上操作均已禁用。
      </q-banner>
      <q-banner
        v-else-if="!snapshot.canReachLiquidity"
        rounded
        class="info-banner"
      >
        当前尚未满足开盘前置条件。合约要求三期全部结算、累计售出 3,000,000
        FRC，并募集至少 600,000 USDT；条件未满足时相应操作保持禁用。
      </q-banner>
    </template>

    <q-card
      v-if="transactions.length"
      flat
      bordered
      class="panel transaction-panel"
    >
      <h3>本次操作记录</h3>
      <p v-for="item in transactions" :key="item.hash">
        {{ item.label }} · {{ item.status }} ·
        <code>{{ item.hash }}</code>
      </p>
    </q-card>

    <!-- 每一步单独等待用户在钱包核对并确认，不自动发送后续交易。 -->
    <q-dialog :model-value="confirmation !== null" persistent>
      <q-card class="confirmation-card">
        <q-card-section class="row items-center no-wrap q-gutter-md">
          <q-spinner-hourglass color="primary" size="32px" />
          <div>
            <div class="text-h6">{{ confirmation?.title }}</div>
            <div class="text-body2 text-grey-7">{{
              confirmation?.message
            }}</div>
          </div>
        </q-card-section>
        <q-card-section v-if="confirmation" class="confirmation-details">
          <div>
            钱包：
            <code>{{ confirmation.address }}</code>
          </div>
          <div>Chain ID：{{ confirmation.chainId }}</div>
          <div>
            合约：
            <code>{{ confirmation.target }}</code>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import {
  BrowserProvider,
  Contract,
  ZeroAddress,
  formatUnits,
  parseUnits
} from "ethers";
import { Notify } from "quasar";
import type { ConnectedWallet } from "@chainforge/wallet-connect";
import WalletConnect from "../components/WalletConnect.vue";
import { adminRequest } from "../services/admin-api";
import { canAccess } from "../services/admin-session";

defineOptions({ name: "TokenLaunchPage" });

type RuntimeBinding = {
  chainId: number;
  deploymentId: string;
  contracts: Record<string, string>;
  pairAddress: string;
  token: string;
  sale: string;
};
type LaunchSnapshot = {
  active: boolean;
  cursor: number;
  allRoundsFinalized: boolean;
  sold: bigint;
  acceptedPayment: bigint;
  paymentUnit: bigint;
  initialLiquidityFunded: boolean;
  initialSeeded: boolean;
  launchTime: bigint;
  tradingOpen: boolean;
  primaryPair: string;
  priceOracle: string;
  oraclePair: string;
  pairSupply: bigint;
  pairTokenBalance: bigint;
  pairPaymentBalance: bigint;
  expectedLP: bigint;
  reservesReady: boolean;
  oracleConfigured: boolean;
  oracleInitialized: boolean;
  timestamp: number;
  admin: boolean;
  operator: boolean;
  launch: boolean;
  decimals: number;
  canReachLiquidity: boolean;
};

const tokenAbi = [
  "function sale() view returns(address)",
  "function liquidityVault() view returns(address)",
  "function primaryPair() view returns(address)",
  "function priceOracle() view returns(address)",
  "function paymentToken() view returns(address)",
  "function launchTime() view returns(uint256)",
  "function tradingOpen() view returns(bool)",
  // 安排未来开盘时间；调用成功后仍需等链上时间到达才会开放交易。
  "function scheduleLaunch(uint256 timestamp)",
  "function hasRole(bytes32,address) view returns(bool)",
  "function DEFAULT_ADMIN_ROLE() view returns(bytes32)",
  "function OPERATOR_ROLE() view returns(bytes32)",
  "function LAUNCH_ROLE() view returns(bytes32)"
];
const saleAbi = [
  "function token() view returns(address)",
  "function activeModule() view returns(bool)",
  "function cursor() view returns(uint8)",
  "function ALLOCATION() view returns(uint256)",
  "function sold() view returns(uint256)",
  "function acceptedPayment() view returns(uint256)",
  "function paymentUnit() view returns(uint256)",
  "function allRoundsFinalized() view returns(bool)",
  "function initialLiquidityFunded() view returns(bool)",
  "function fundInitialLiquidity()",
  "function rounds(uint256) view returns(uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)"
];
const vaultAbi = [
  "function initialSeeded() view returns(bool)",
  "function seedInitialLiquidity(uint256 minimumLP)"
];
const oracleAbi = [
  "function pair() view returns(address)",
  "function initialized() view returns(bool)",
  "function start()"
];
const pairAbi = [
  "function totalSupply() view returns(uint256)",
  "function getReserves() view returns(uint112,uint112,uint32)"
];
const erc20Abi = [
  "function balanceOf(address) view returns(uint256)",
  "function decimals() view returns(uint8)"
];

const binding = ref<RuntimeBinding | null>(null);
const wallet = ref<ConnectedWallet | null>(null);
const pendingChange = ref(false);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const snapshot = ref<LaunchSnapshot | null>(null);
const minimumLP = ref("");
const launchDateTime = ref("");
const activeAction = ref<"fund" | "seed" | "schedule" | "oracle" | null>(null);
const confirmation = ref<{
  title: string;
  message: string;
  address: string;
  chainId: number;
  target: string;
} | null>(null);
const transactions = ref<{ hash: string; label: string; status: string }[]>([]);
let contextVersion = 0;

const canFund = computed(() =>
  Boolean(
    snapshot.value?.active &&
    snapshot.value.canReachLiquidity &&
    !snapshot.value.initialLiquidityFunded &&
    canAccess("launch:fund")
  )
);
const canSeed = computed(() =>
  Boolean(
    snapshot.value?.active &&
    snapshot.value.initialLiquidityFunded &&
    !snapshot.value.initialSeeded &&
    snapshot.value.primaryPair !== ZeroAddress &&
    snapshot.value.oracleConfigured &&
    snapshot.value.pairSupply === 0n &&
    snapshot.value.expectedLP > 0n &&
    (snapshot.value.admin || snapshot.value.operator) &&
    canAccess("launch:seed")
  )
);
const canSchedule = computed(() =>
  Boolean(
    snapshot.value?.active &&
    snapshot.value.canReachLiquidity &&
    snapshot.value.initialLiquidityFunded &&
    snapshot.value.initialSeeded &&
    snapshot.value.primaryPair !== ZeroAddress &&
    snapshot.value.oracleConfigured &&
    snapshot.value.reservesReady &&
    !snapshot.value.launchTime &&
    (snapshot.value.admin || snapshot.value.launch) &&
    canAccess("launch:schedule")
  )
);
const canStartOracle = computed(() =>
  Boolean(
    snapshot.value?.active &&
    snapshot.value.tradingOpen &&
    snapshot.value.oracleConfigured &&
    !snapshot.value.oracleInitialized &&
    canAccess("launch:oracle")
  )
);
const saleGateMessage = computed(() => {
  const state = snapshot.value;
  if (!state) return "正在读取私募结算状态。";
  if (!state.allRoundsFinalized)
    return `私募尚未结束：已结算 ${state.cursor}/3 期；完成三期结算后才能进入发行准备。`;
  if (state.sold !== 3_000_000n * 10n ** 18n)
    return `三期已结算，但累计售出为 ${formatToken(state.sold)} FRC；合约要求售满 3,000,000 FRC。`;
  if (state.acceptedPayment < 600_000n * state.paymentUnit)
    return `募集款为 ${formatPayment(state.acceptedPayment)} USDT，合约要求至少 600,000 USDT。`;
  return "三期已结算且达到合约规定的售出与募集款门槛。";
});

function sqrt(value: bigint) {
  if (value < 2n) return value;
  let current = value;
  let next = (current + 1n) / 2n;
  while (next < current) {
    current = next;
    next = (current + value / current) / 2n;
  }
  return current;
}
function formatToken(value: bigint) {
  return formatUnits(value, 18);
}
function formatPayment(value: bigint) {
  return formatUnits(value, snapshot.value?.decimals ?? 18);
}
function formatTime(value: bigint) {
  return new Date(Number(value) * 1000).toLocaleString("zh-CN");
}
function invalidate() {
  contextVersion++;
  snapshot.value = null;
}
function onWallet(value: ConnectedWallet) {
  wallet.value = value;
  pendingChange.value = false;
  invalidate();
  void refresh();
}
function onDisconnect() {
  wallet.value = null;
  invalidate();
  loading.value = false;
}
function onPending(value: boolean) {
  pendingChange.value = value;
  if (value) invalidate();
  else if (wallet.value) void refresh();
}
async function loadBinding() {
  error.value = "";
  try {
    const response = await fetch("/api/public/runtime-contracts", {
      cache: "no-store"
    });
    if (!response.ok) throw new Error("无法读取生效合约绑定。");
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || !("state" in value))
      throw new Error("生效合约绑定数据无效。");
    const result = value as {
      state: string;
      chainId?: number;
      deploymentId?: string;
      contracts?: Record<string, string>;
      pairAddress?: string;
    };
    if (result.state !== "bound") {
      binding.value = null;
      return;
    }
    if (
      !result.chainId ||
      !result.deploymentId ||
      !result.contracts?.ProjectToken ||
      !result.contracts.FairSaleV2 ||
      !result.contracts.StrategicLiquidityVaultV2 ||
      !result.contracts.TokenPriceOracle ||
      !result.pairAddress
    )
      throw new Error("生效合约绑定缺少发行、流动性或预言机合约地址。");
    binding.value = {
      chainId: result.chainId,
      deploymentId: result.deploymentId,
      contracts: result.contracts,
      pairAddress: result.pairAddress,
      token: result.contracts.ProjectToken,
      sale: result.contracts.FairSaleV2
    };
  } catch (reason) {
    binding.value = null;
    error.value =
      reason instanceof Error ? reason.message : "读取部署绑定失败。";
    Notify.create({
      type: "negative",
      message: error.value,
      position: "top",
      timeout: 6000
    });
  }
}
async function checkedContext() {
  const target = binding.value;
  const current = wallet.value;
  if (!target || !current || pendingChange.value)
    throw new Error("请先加载部署并连接钱包。");
  const provider = new BrowserProvider(current.provider as never);
  const [network, accounts] = await Promise.all([
    provider.send("eth_chainId", []),
    provider.send("eth_accounts", [])
  ]);
  if (
    Number(network) !== target.chainId ||
    current.chainId !== target.chainId ||
    !Array.isArray(accounts) ||
    String(accounts[0]).toLowerCase() !== current.address.toLowerCase()
  )
    throw new Error("钱包账户或网络与当前绑定不匹配，请重新连接。\u200b");
  const token = new Contract(
    target.contracts.ProjectToken!,
    tokenAbi,
    provider
  );
  const sale = new Contract(target.contracts.FairSaleV2!, saleAbi, provider);
  const [tokenCode, saleCode, saleToken, configuredSale, active] =
    await Promise.all([
      provider.getCode(target.contracts.ProjectToken!),
      provider.getCode(target.contracts.FairSaleV2!),
      sale.getFunction("token")(),
      token.getFunction("sale")(),
      sale.getFunction("activeModule")()
    ]);
  if (tokenCode === "0x" || saleCode === "0x")
    throw new Error("绑定地址上没有合约代码。");
  if (
    String(saleToken).toLowerCase() !==
      target.contracts.ProjectToken!.toLowerCase() ||
    String(configuredSale).toLowerCase() !==
      target.contracts.FairSaleV2!.toLowerCase()
  )
    throw new Error("私募合约与绑定的代币不匹配。");
  return { provider, token, sale, current, target, active: Boolean(active) };
}
async function refresh() {
  error.value = "";
  if (!binding.value) await loadBinding();
  if (!binding.value || !wallet.value) return;
  const version = contextVersion;
  loading.value = true;
  try {
    const { provider, token, sale, current, target, active } =
      await checkedContext();
    const vault = new Contract(
      target.contracts.StrategicLiquidityVaultV2!,
      vaultAbi,
      provider
    );
    const oracle = new Contract(
      target.contracts.TokenPriceOracle!,
      oracleAbi,
      provider
    );
    const pair = new Contract(target.pairAddress, pairAbi, provider);
    const [
      cursor,
      allocation,
      sold,
      acceptedPayment,
      paymentUnit,
      allRoundsFinalized,
      initialLiquidityFunded,
      initialSeeded,
      launchTime,
      tradingOpen,
      primaryPair,
      priceOracle,
      liquidityVault,
      paymentToken,
      roleAdmin,
      roleOperator,
      roleLaunch,
      rounds,
      pairSupply,
      reserves,
      oraclePair,
      oracleInitialized,
      block
    ] = await Promise.all([
      sale.getFunction("cursor")(),
      sale.getFunction("ALLOCATION")(),
      sale.getFunction("sold")(),
      sale.getFunction("acceptedPayment")(),
      sale.getFunction("paymentUnit")(),
      sale.getFunction("allRoundsFinalized")(),
      sale.getFunction("initialLiquidityFunded")(),
      vault.getFunction("initialSeeded")(),
      token.getFunction("launchTime")(),
      token.getFunction("tradingOpen")(),
      token.getFunction("primaryPair")(),
      token.getFunction("priceOracle")(),
      token.getFunction("liquidityVault")(),
      token.getFunction("paymentToken")(),
      token.getFunction("DEFAULT_ADMIN_ROLE")(),
      token.getFunction("OPERATOR_ROLE")(),
      token.getFunction("LAUNCH_ROLE")(),
      Promise.all([0, 1, 2].map(index => sale.getFunction("rounds")(index))),
      pair.getFunction("totalSupply")(),
      pair.getFunction("getReserves")(),
      oracle.getFunction("pair")(),
      oracle.getFunction("initialized")(),
      provider.getBlock("latest")
    ]);
    if (!block) throw new Error("无法读取当前区块时间。");
    if (
      String(liquidityVault).toLowerCase() !==
      target.contracts.StrategicLiquidityVaultV2!.toLowerCase()
    )
      throw new Error("绑定的流动性金库与代币合约配置不匹配。");
    const pairMatches =
      String(primaryPair).toLowerCase() === target.pairAddress.toLowerCase();
    const oracleMatches =
      String(priceOracle).toLowerCase() ===
        target.contracts.TokenPriceOracle!.toLowerCase() &&
      String(oraclePair).toLowerCase() === target.pairAddress.toLowerCase();
    const payment = new Contract(String(paymentToken), erc20Abi, provider);
    const [
      decimals,
      pairTokenBalance,
      pairPaymentBalance,
      admin,
      operator,
      launch
    ] = await Promise.all([
      payment.getFunction("decimals")(),
      new Contract(
        target.contracts.ProjectToken!,
        erc20Abi,
        provider
      ).getFunction("balanceOf")(target.pairAddress),
      payment.getFunction("balanceOf")(target.pairAddress),
      token.getFunction("hasRole")(roleAdmin, current.address),
      token.getFunction("hasRole")(roleOperator, current.address),
      token.getFunction("hasRole")(roleLaunch, current.address)
    ]);
    const saleComplete =
      Boolean(allRoundsFinalized) && BigInt(sold) === BigInt(allocation);
    const acceptedEnough =
      BigInt(acceptedPayment) >= 600_000n * BigInt(paymentUnit);
    const canReachLiquidity = saleComplete && acceptedEnough;
    const expectedLP =
      BigInt(pairSupply) === 0n
        ? sqrt(
            (BigInt(pairTokenBalance) + 1_710_000n * 10n ** 18n) *
              (BigInt(pairPaymentBalance) + 600_000n * BigInt(paymentUnit))
          ) - 1000n
        : 0n;
    if (version !== contextVersion) return;
    snapshot.value = {
      active,
      cursor: Number(cursor),
      allRoundsFinalized: Boolean(allRoundsFinalized),
      sold: BigInt(sold),
      acceptedPayment: BigInt(acceptedPayment),
      paymentUnit: BigInt(paymentUnit),
      initialLiquidityFunded: Boolean(initialLiquidityFunded),
      initialSeeded: Boolean(initialSeeded),
      launchTime: BigInt(launchTime),
      tradingOpen: Boolean(tradingOpen),
      primaryPair: pairMatches ? target.pairAddress : ZeroAddress,
      priceOracle: String(priceOracle),
      oraclePair: String(oraclePair),
      pairSupply: BigInt(pairSupply),
      pairTokenBalance: BigInt(pairTokenBalance),
      pairPaymentBalance: BigInt(pairPaymentBalance),
      expectedLP: expectedLP > 0n ? expectedLP : 0n,
      reservesReady: BigInt(reserves[0]) > 0n && BigInt(reserves[1]) > 0n,
      oracleConfigured: oracleMatches,
      oracleInitialized: Boolean(oracleInitialized),
      timestamp: block.timestamp,
      admin: Boolean(admin),
      operator: Boolean(operator),
      launch: Boolean(launch),
      decimals: Number(decimals),
      canReachLiquidity
    };
    if (expectedLP > 0n && !minimumLP.value)
      minimumLP.value = formatUnits((expectedLP * 9900n) / 10000n, 18);
    if (!launchDateTime.value) {
      const suggested = new Date((block.timestamp + 3600) * 1000);
      const local = new Date(
        suggested.getTime() - suggested.getTimezoneOffset() * 60000
      );
      launchDateTime.value = local.toISOString().slice(0, 16);
    }
  } catch (reason) {
    if (version === contextVersion) {
      error.value =
        reason instanceof Error ? reason.message : "读取链上发行状态失败。";
      Notify.create({
        type: "negative",
        message: error.value,
        position: "top",
        timeout: 6000
      });
    }
  } finally {
    if (version === contextVersion) loading.value = false;
  }
}

async function runAction(action: "fund" | "seed" | "schedule" | "oracle") {
  if (busy.value || !wallet.value || !snapshot.value || !binding.value) return;
  const allowed =
    action === "fund"
      ? canFund.value
      : action === "seed"
        ? canSeed.value
        : action === "schedule"
          ? canSchedule.value
          : canStartOracle.value;
  if (!allowed) return;
  const state = snapshot.value;
  const target = binding.value;
  const version = contextVersion;
  const current = wallet.value;
  const label =
    action === "fund"
      ? "划转 600,000 USDT"
      : action === "seed"
        ? "注入初始流动性"
        : action === "schedule"
          ? "安排代币开盘"
          : "启动预言机采样";
  busy.value = true;
  activeAction.value = action;
  error.value = "";
  confirmation.value = {
    title: "正在准备链上操作",
    message: "正在核对权限、钱包账户和链上前置条件，请稍候。",
    address: current.address,
    chainId: current.chainId,
    target:
      action === "fund"
        ? target.contracts.FairSaleV2!
        : action === "seed"
          ? target.contracts.StrategicLiquidityVaultV2!
          : action === "schedule"
            ? target.contracts.ProjectToken!
            : target.contracts.TokenPriceOracle!
  };
  let hash = "";
  try {
    await nextTick();
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    await adminRequest(`/launch/authorize/${action}`);
    const {
      provider,
      token,
      sale,
      current: checkedWallet,
      target: checkedBinding,
      active
    } = await checkedContext();
    if (!active) throw new Error("私募模块未生效，已停止操作。");
    if (
      version !== contextVersion ||
      pendingChange.value ||
      checkedWallet.address !== current.address
    )
      throw new Error("钱包账户或网络已变化，已停止操作。");
    const signer = await provider.getSigner(current.address);
    let contract: Contract;
    let method: string;
    let args: unknown[];
    if (action === "fund") {
      contract = sale.connect(signer) as Contract;
      method = "fundInitialLiquidity";
      args = [];
    } else if (action === "seed") {
      contract = new Contract(
        checkedBinding.contracts.StrategicLiquidityVaultV2!,
        vaultAbi,
        provider
      ).connect(signer) as Contract;
      method = "seedInitialLiquidity";
      try {
        args = [BigInt(parseUnits(minimumLP.value, 18))];
      } catch {
        throw new Error("请输入有效的最低 LP 数量。");
      }
      if ((args[0] as bigint) <= 0n)
        throw new Error("最低 LP 数量必须大于零。");
    } else if (action === "schedule") {
      contract = token.connect(signer) as Contract;
      method = "scheduleLaunch";
      const launchSeconds = Math.floor(
        new Date(launchDateTime.value).getTime() / 1000
      );
      if (
        !Number.isSafeInteger(launchSeconds) ||
        launchSeconds <= state.timestamp
      )
        throw new Error("开盘时间必须晚于当前链上区块时间。");
      args = [launchSeconds];
    } else {
      contract = new Contract(
        checkedBinding.contracts.TokenPriceOracle!,
        oracleAbi,
        provider
      ).connect(signer) as Contract;
      method = "start";
      args = [];
    }
    const write = contract.getFunction(method);
    confirmation.value.title = "正在检查交易";
    confirmation.value.message = "正在模拟交易并检查合约条件，请稍候。";
    await write.staticCall(...args);
    await adminRequest(`/launch/authorize/${action}`);
    const latest = await checkedContext();
    if (!latest.active || version !== contextVersion || pendingChange.value)
      throw new Error("部署绑定或钱包状态已变化，已停止操作。");
    confirmation.value.title = "等待钱包确认";
    confirmation.value.message = `请在钱包中核对并确认“${label}”。钱包响应前，此页面会保持等待。`;
    await nextTick();
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    const tx = await write(...args);
    confirmation.value = null;
    hash = tx.hash;
    transactions.value.unshift({ hash, label, status: "等待链上确认" });
    Notify.create({
      type: "info",
      message: "交易已提交，正在等待链上确认。",
      position: "top",
      timeout: 5000
    });
    const receipt = await tx.wait(1, 120000);
    if (!receipt || receipt.status !== 1)
      throw new Error("交易未确认或执行失败，请通过交易哈希核查。");
    const record = transactions.value.find(item => item.hash === hash);
    if (record) record.status = "已确认";
    Notify.create({
      type: "positive",
      message: "交易已确认，正在刷新发行状态。",
      position: "top"
    });
    if (version === contextVersion) await refresh();
  } catch (reason) {
    const record = transactions.value.find(item => item.hash === hash);
    if (record) record.status = "未确认或失败，请核查";
    error.value = reason instanceof Error ? reason.message : "链上操作失败。";
    Notify.create({
      type: "negative",
      message: error.value,
      position: "top",
      timeout: 8000
    });
  } finally {
    confirmation.value = null;
    activeAction.value = null;
    busy.value = false;
  }
}

async function refreshPage() {
  await loadBinding();
  invalidate();
  if (binding.value && wallet.value) await refresh();
}

onMounted(() => void refreshPage());
</script>

<style lang="scss" scoped>
.launch-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel {
  border-radius: 16px;
  background: var(--admin-surface, #fff);
}
.intro-panel h2,
.status-copy h3,
.step-heading h3,
.transaction-panel h3 {
  margin: 0;
  font-size: 18px;
}
.intro-panel p,
.status-copy p,
.step-heading p {
  margin: 6px 0 0;
  color: var(--admin-muted-text, #738096);
  line-height: 1.6;
}
.eyebrow {
  margin-bottom: 6px;
  color: var(--admin-primary, #3978d4);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
}
.binding-details,
.pair-details,
.metric-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  color: var(--admin-muted-text, #738096);
  font-size: 13px;
}
.binding-details {
  border-top: 1px solid var(--admin-border, #d9e0e9);
}
.binding-details code,
.pair-details code,
.transaction-panel code {
  overflow-wrap: anywhere;
}
.empty-panel,
.loading-panel {
  display: flex;
  min-height: 190px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  color: var(--admin-muted-text, #738096);
}
.empty-panel strong {
  color: var(--admin-text, #202d42);
}
.status-overview {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
}
.status-icon,
.step-number {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
}
.status-icon {
  width: 48px;
  height: 48px;
  font-size: 25px;
}
.is-ready,
.step-number.done {
  color: #16744d;
  background: #e7f7ee;
}
.is-pending {
  color: #805b12;
  background: #fff3d4;
}
.status-copy {
  min-width: 0;
}
.status-copy h3 {
  font-size: 19px;
}
.step-list {
  display: grid;
  gap: 12px;
}
.step-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
}
.step-number {
  width: 34px;
  height: 34px;
  margin-top: 2px;
  color: var(--admin-muted-text, #738096);
  background: var(--admin-background, #f3f6fa);
}
.step-number.done {
  background: #e7f7ee;
}
.step-body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.step-heading {
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.step-heading h3 {
  font-size: 16px;
}
.metric-row {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--admin-background, #f3f6fa);
}
.metric-row strong {
  color: var(--admin-text, #202d42);
}
.pair-details {
  width: 100%;
}
.minimum-lp-input,
.launch-time-input {
  width: min(100%, 380px);
}
.step-success {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #16744d;
  font-weight: 600;
}
.info-banner {
  background: #eef5ff;
  color: #315f99;
}
.transaction-panel {
  padding: 18px 20px;
}
.transaction-panel p {
  margin: 10px 0 0;
}
.confirmation-card {
  width: min(480px, calc(100vw - 32px));
  border-radius: 16px;
}
.confirmation-details {
  display: grid;
  gap: 8px;
  padding-top: 0;
  color: var(--admin-muted-text, #738096);
}
.confirmation-details code {
  overflow-wrap: anywhere;
}
@media (max-width: 700px) {
  .step-card {
    gap: 10px;
    padding: 16px 14px;
  }
  .step-heading {
    flex-direction: column;
  }
  .status-overview {
    align-items: flex-start;
    padding: 16px;
  }
  .binding-details {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
