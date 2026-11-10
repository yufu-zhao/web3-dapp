<template>
  <section class="presale-page">
    <div class="row items-center full-height">
      <div>fdsf</div>
      <q-spacer />
      <q-btn flat icon="refresh" :loading="loading" :disable="busy" round @click="reload">
        <q-tooltip>刷新数据</q-tooltip>
      </q-btn>
      <WalletConnect
        v-if="selected"
        :confirm-changes="true"
        @connected="onWallet"
        @changed="onWallet"
        @disconnected="onDisconnect"
        @change-pending="onPending"
      />
    </div>
    <q-banner v-if="error" rounded class="error-banner">{{ error }}</q-banner>
    <q-banner v-if="notice" rounded class="notice-banner">
      {{ notice }}
    </q-banner>
    <q-card flat bordered class="panel">
      <q-card-section class="heading">
        <div>
          <h2>私募管理</h2>
          <p>读取安装器绑定的私募合约，管理三期认购。</p>
        </div>
        <q-btn flat icon="refresh" label="刷新" :loading="loading" :disable="busy" @click="reload" />
      </q-card-section>
      <q-card-section class="controls">
        <WalletConnect
          v-if="selected"
          :confirm-changes="true"
          @connected="onWallet"
          @changed="onWallet"
          @disconnected="onDisconnect"
          @change-pending="onPending"
        />
        <p v-if="!selected && !loading">安装器尚未提供生效部署绑定，私募数据及链上操作暂不可用。</p>
        <p v-else-if="!wallet">连接钱包后读取链上数据。</p>
        <p v-if="selected">合约 {{ selected.sale }} · 链 {{ chainId }}</p>
      </q-card-section>
    </q-card>

    <template v-if="snapshot">
      <q-banner v-if="!snapshot.active" rounded class="error-banner">
        该私募合约未关联为代币当前的私募模块，链上写入已禁用。
      </q-banner>
      <q-card flat bordered class="panel">
        <q-card-section>
          <h2>三期认购条款</h2>
          <p>
            价格单位 USDT/FRC，基础额度单位 FRC；每人认购金额单位
            USDT。三期条款和每人认购金额可在首位用户认购前调整，首位用户认购后由合约锁定。
          </p>
          <div class="terms-grid">
            <div v-for="(_, index) in snapshot.rounds" :key="index" class="terms-item">
              <strong>第 {{ index + 1 }} 期</strong>
              <q-input v-model.trim="prices[index]" outlined dense label="价格（USDT/FRC）" :disable="!canTerms" />
              <q-input v-model.trim="amounts[index]" outlined dense label="基础额度（FRC）" :disable="!canTerms" />
            </div>
          </div>
          <p>
            新部署默认每人认购金额为 100 USDT；当前链上值为
            {{ formatPayment(snapshot.ticket) }} USDT。三期基础额度合计须为 3,000,000 FRC。
          </p>
          <q-input v-model.trim="ticketAmount" outlined dense label="每人认购金额（USDT）" :disable="!canTerms" />
          <q-btn
            v-if="canTerms"
            color="primary"
            unelevated
            label="保存三期条款"
            :loading="busy"
            class="q-mt-sm"
            @click="runAction('terms')"
          />
          <p v-else>条款仅能在第一期且无认购、未开盘时由链上超管配置。</p>
        </q-card-section>
      </q-card>
      <div class="round-grid">
        <q-card v-for="(round, index) in snapshot.rounds" :key="index" flat bordered class="panel">
          <q-card-section>
            <h2>
              第 {{ index + 1 }} 期
              <q-badge :label="roundStatus(index)" />
            </h2>
            <p>价格：{{ formatPayment(round.price) }} USDT/FRC</p>
            <p>基础额度：{{ formatToken(round.base) }} FRC</p>
            <p>本期可售：{{ formatToken(round.offered) }} FRC</p>
            <p>参与人数：{{ round.participants.toString() }}</p>
            <p>已分配：{{ formatToken(round.allocated) }} FRC</p>
            <p>已接受：{{ formatPayment(round.accepted) }} USDT</p>
            <p>开始：{{ formatTime(round.start) }}</p>
            <p>结束：{{ formatTime(round.end) }}</p>
            <template v-if="index === snapshot.cursor && canSchedule">
              <q-input
                v-model="startTime"
                outlined
                dense
                type="datetime-local"
                label="开始时间"
                stack-label
                :disable="startLocked"
              />
              <q-input v-model="endTime" outlined dense type="datetime-local" label="结束时间" stack-label />
              <q-btn color="primary" unelevated label="设置本期时间" :loading="busy" @click="runAction('schedule')" />
            </template>
            <q-btn
              v-if="index === snapshot.cursor && canFinalize"
              color="primary"
              unelevated
              label="结算本期"
              :loading="busy"
              @click="runAction('finalize')"
            />
          </q-card-section>
        </q-card>
      </div>
    </template>
    <div v-if="transactions.length" class="panel transaction-history">
      <strong>本次操作记录</strong>
      <p v-for="transaction in transactions" :key="transaction.hash">
        {{ transaction.label }} · 链 {{ transaction.chainId }} · {{ transaction.status }}：
        <code>{{ transaction.hash }}</code>
        （合约 {{ transaction.sale }}）
      </p>
    </div>

    <!-- 钱包确认由用户本人完成；弹窗只覆盖钱包请求等待阶段。 -->
    <q-dialog :model-value="walletConfirmation !== null" persistent>
      <q-card class="wallet-confirmation-card">
        <q-card-section class="row items-center no-wrap q-gutter-md">
          <q-spinner-hourglass color="primary" size="32px" />
          <div>
            <div class="text-h6">{{ walletConfirmation?.title }}</div>
            <div class="text-body2 text-grey-7">
              {{ walletConfirmation?.message }}
            </div>
          </div>
        </q-card-section>
        <q-card-section v-if="walletConfirmation" class="confirmation-details">
          <div>
            账户：
            <code>{{ walletConfirmation.address }}</code>
          </div>
          <div>网络：{{ walletConfirmation.chainId }}</div>
          <div>
            合约：
            <code>{{ walletConfirmation.sale }}</code>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { BrowserProvider, Contract, ZeroHash, formatUnits, parseUnits } from "ethers";
import type { ConnectedWallet } from "@chainforge/wallet-connect";
import WalletConnect from "../components/WalletConnect.vue";
import { adminRequest } from "../services/admin-api";
import { canAccess } from "../services/admin-session";

defineOptions({ name: "PresalePage" });
type Deployment = {
  id: string;
  sale: string;
  token: string;
  completedAt: string;
};
type Round = {
  price: bigint;
  base: bigint;
  offered: bigint;
  participants: bigint;
  allocated: bigint;
  accepted: bigint;
  start: bigint;
  end: bigint;
  finalized: boolean;
};
type Snapshot = {
  active: boolean;
  cursor: number;
  participants: bigint;
  launched: bigint;
  ticket: bigint;
  decimals: number;
  timestamp: number;
  admin: boolean;
  operator: boolean;
  launch: boolean;
  rounds: Round[];
};
const saleAbi = [
  "function token() view returns(address)",
  "function activeModule() view returns(bool)",
  "function cursor() view returns(uint8)",
  "function totalParticipants() view returns(uint256)",
  "function ticket() view returns(uint256)",
  "function paymentUnit() view returns(uint256)",
  "function price(uint8) view returns(uint256)",
  "function roundBase(uint256) view returns(uint256)",
  "function roundStartTimes(uint256) view returns(uint256)",
  "function rounds(uint256) view returns(uint256 endTime,uint256 offered,uint256 participants,uint256 allocated,uint256 share,uint256 extraWeiParticipants,uint256 acceptedPayment,bool finalized)",
  "function configureSaleTerms(uint256[3],uint256[3],uint256)",
  "function setRoundTimes(uint8,uint256,uint256)",
  "function finalize(uint8)",
];
const tokenAbi = [
  "function sale() view returns(address)",
  "function launchTime() view returns(uint256)",
  "function hasRole(bytes32,address) view returns(bool)",
  "function OPERATOR_ROLE() view returns(bytes32)",
  "function LAUNCH_ROLE() view returns(bytes32)",
];
const chainId = ref<number | null>(null);
const deployments = ref<Deployment[]>([]);
// 仅使用安装器绑定的唯一部署，不根据历史归档自动推断。
const selectedId = ref<string | null>(null);
const wallet = ref<ConnectedWallet | null>(null);
const pendingChange = ref(false);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const walletConfirmation = ref<{
  label: string;
  title: string;
  message: string;
  address: string;
  chainId: number;
  sale: string;
} | null>(null);
type TransactionRecord = {
  hash: string;
  label: string;
  status: string;
  chainId: number;
  sale: string;
};
const transactions = ref<TransactionRecord[]>([]);
const historyKey = "chainforge:presale-transactions";
// 仅保存公开交易标识，刷新后仍可查找交易结果。
try {
  const stored: unknown = JSON.parse(localStorage.getItem(historyKey) ?? "[]");
  if (Array.isArray(stored))
    transactions.value = stored
      .filter(
        (item): item is TransactionRecord =>
          item &&
          typeof item === "object" &&
          /^0x[0-9a-f]{64}$/i.test(item.hash) &&
          typeof item.label === "string" &&
          typeof item.status === "string" &&
          Number.isSafeInteger(item.chainId) &&
          /^0x[0-9a-f]{40}$/i.test(item.sale),
      )
      .slice(0, 50);
} catch {
  /* 浏览器存储不可用时仍保留本次页面内的记录。 */
}
watch(
  transactions,
  (items) => {
    try {
      localStorage.setItem(historyKey, JSON.stringify(items.slice(0, 50)));
    } catch {
      /* 存储受限时不影响交易回执处理。 */
    }
  },
  { deep: true },
);
const snapshot = ref<Snapshot | null>(null);
const prices = ref<string[]>(["", "", ""]);
const amounts = ref<string[]>(["", "", ""]);
const ticketAmount = ref("100");
const startTime = ref("");
const endTime = ref("");
let contextVersion = 0;
const selected = computed(() => deployments.value.find((item) => item.id === selectedId.value));
const ready = computed(() => Boolean(snapshot.value?.active && wallet.value && !pendingChange.value && !busy.value));
const canTerms = computed(() =>
  Boolean(
    ready.value &&
    canAccess("presale:terms") &&
    snapshot.value?.admin &&
    snapshot.value.cursor === 0 &&
    snapshot.value.participants === 0n &&
    snapshot.value.launched === 0n,
  ),
);
const canSchedule = computed(() =>
  Boolean(
    ready.value &&
    canAccess("presale:schedule") &&
    (snapshot.value?.admin || snapshot.value?.operator) &&
    snapshot.value &&
    snapshot.value.cursor < 3 &&
    (!snapshot.value.rounds[snapshot.value.cursor]?.end ||
      Number(snapshot.value.rounds[snapshot.value.cursor]?.end) > snapshot.value.timestamp),
  ),
);
const canFinalize = computed(() =>
  Boolean(
    ready.value &&
    canAccess("presale:finalize") &&
    (snapshot.value?.admin || snapshot.value?.operator || snapshot.value?.launch) &&
    snapshot.value &&
    snapshot.value.cursor < 3 &&
    snapshot.value.rounds[snapshot.value.cursor]?.end &&
    Number(snapshot.value.rounds[snapshot.value.cursor]?.end) <= snapshot.value.timestamp,
  ),
);
const startLocked = computed(() => {
  const s = snapshot.value;
  const round = s?.rounds[s.cursor];
  return Boolean(round && (round.participants > 0n || (round.start > 0n && Number(round.start) <= s!.timestamp)));
});
function formatToken(value: bigint) {
  return formatUnits(value, 18);
}
function formatPayment(value: bigint) {
  return formatUnits(value, snapshot.value?.decimals ?? 18);
}
function formatTime(value: bigint) {
  return value ? new Date(Number(value) * 1000).toLocaleString("zh-CN") : "未设置";
}
function localInput(value: bigint) {
  if (!value) return "";
  const date = new Date(Number(value) * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function roundStatus(index: number) {
  const s = snapshot.value!;
  const r = s.rounds[index]!;
  if (r.finalized) return "已结算";
  if (index > s.cursor) return "等待上期结算";
  if (!r.start || !r.end) return "未排期";
  if (s.timestamp < Number(r.start)) return "待开始";
  return s.timestamp < Number(r.end) ? "认购中" : "待结算";
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

// RPC 超时后停止后续步骤；已提交的交易仍保留哈希供核查。
async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}超时，请检查钱包及网络。`)), 30000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 每次读取及交易前都以钱包实际网络和账户重新校验部署，不能依赖缓存状态。
async function checkedContext() {
  const target = selected.value;
  const current = wallet.value;
  const expectedChain = chainId.value;
  if (!target || !current || !expectedChain || pendingChange.value) throw new Error("请先选择部署并连接钱包。");
  const provider = new BrowserProvider(current.provider as never);
  const [network, accounts, saleCode, tokenCode] = await Promise.all([
    provider.send("eth_chainId", []),
    provider.send("eth_accounts", []),
    provider.getCode(target.sale),
    provider.getCode(target.token),
  ]);
  if (
    Number(network) !== expectedChain ||
    current.chainId !== expectedChain ||
    !Array.isArray(accounts) ||
    String(accounts[0]).toLowerCase() !== current.address.toLowerCase()
  )
    throw new Error("钱包账户或网络已变化，请重新连接并刷新。");
  if (saleCode === "0x" || tokenCode === "0x") throw new Error("部署地址不存在合约代码。");
  const sale = new Contract(target.sale, saleAbi, provider);
  const token = new Contract(target.token, tokenAbi, provider);
  const [saleToken, tokenSale, active] = await Promise.all([
    sale.getFunction("token")(),
    token.getFunction("sale")(),
    sale.getFunction("activeModule")(),
  ]);
  if (String(saleToken).toLowerCase() !== target.token.toLowerCase())
    throw new Error("部署记录中的私募合约与代币不匹配。");
  return {
    provider,
    sale,
    token,
    current,
    target,
    active: Boolean(active && String(tokenSale).toLowerCase() === target.sale.toLowerCase()),
  };
}
async function refresh() {
  const version = contextVersion;
  error.value = "";
  loading.value = true;
  try {
    if (!selected.value || !wallet.value) return;
    const { provider, sale, token, current, active } = await checkedContext();
    const [cursor, participants, ticket, unit, launched, operatorRole, launchRole, block] = await Promise.all([
      sale.getFunction("cursor")(),
      sale.getFunction("totalParticipants")(),
      sale.getFunction("ticket")(),
      sale.getFunction("paymentUnit")(),
      token.getFunction("launchTime")(),
      token.getFunction("OPERATOR_ROLE")(),
      token.getFunction("LAUNCH_ROLE")(),
      provider.getBlock("latest"),
    ]);
    const decimals = unit === 1000000n ? 6 : unit === 1000000000000000000n ? 18 : 0;
    if (!decimals || !block) throw new Error("无法确认支付币精度或区块时间。");
    const [admin, operator, launch, rounds] = await Promise.all([
      token.getFunction("hasRole")(ZeroHash, current.address),
      token.getFunction("hasRole")(operatorRole, current.address),
      token.getFunction("hasRole")(launchRole, current.address),
      Promise.all(
        [0, 1, 2].map(async (id) => {
          const [price, base, start, data] = await Promise.all([
            sale.getFunction("price")(id),
            sale.getFunction("roundBase")(id),
            sale.getFunction("roundStartTimes")(id),
            sale.getFunction("rounds")(id),
          ]);
          return {
            price,
            base,
            start,
            end: data.endTime,
            offered: data.offered,
            participants: data.participants,
            allocated: data.allocated,
            accepted: data.acceptedPayment,
            finalized: data.finalized,
          } as Round;
        }),
      ),
    ]);
    if (version !== contextVersion) return;
    snapshot.value = {
      active,
      cursor: Number(cursor),
      participants,
      ticket,
      decimals,
      launched,
      timestamp: block.timestamp,
      admin,
      operator,
      launch,
      rounds,
    };
    prices.value = rounds.map((r) => formatUnits(r.price, decimals));
    amounts.value = rounds.map((r) => formatUnits(r.base, 18));
    ticketAmount.value = formatUnits(ticket, decimals);
    const round = rounds[Number(cursor)];
    startTime.value = localInput(round?.start ?? 0n);
    endTime.value = localInput(round?.end ?? 0n);
  } catch (reason) {
    if (version === contextVersion) {
      snapshot.value = null;
      error.value = reason instanceof Error ? reason.message : "无法读取链上私募状态。";
    }
  } finally {
    if (version === contextVersion) loading.value = false;
  }
}
async function runAction(action: "terms" | "schedule" | "finalize") {
  if (busy.value || !snapshot.value || !wallet.value || !selected.value) return;
  const permitted = action === "terms" ? canTerms.value : action === "schedule" ? canSchedule.value : canFinalize.value;
  if (!permitted) return;
  const previous = snapshot.value;
  const version = contextVersion;
  error.value = "";
  notice.value = "";
  busy.value = true;
  walletConfirmation.value = {
    label: action === "terms" ? "保存三期条款" : action === "schedule" ? "设置本期时间" : "结算本期",
    title: "正在准备链上操作",
    message: "正在检查操作权限、钱包账户和网络，请稍候。",
    address: wallet.value.address,
    chainId: wallet.value.chainId,
    sale: selected.value.sale,
  };
  let submittedHash = "";
  try {
    // 点击后先确保准备状态已绘制，再开始网络权限与钱包检查。
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await withTimeout(adminRequest(`/presale/authorize/${action}`), "后台权限检查");
    const { provider, sale, current, active, target } = await withTimeout(checkedContext(), "钱包检查");
    if (!active) throw new Error("私募合约不是当前有效模块，不能提交交易。");
    const signer = await withTimeout(provider.getSigner(current.address), "钱包账户检查");
    if (
      version !== contextVersion ||
      pendingChange.value ||
      (await signer.getAddress()).toLowerCase() !== current.address.toLowerCase()
    )
      throw new Error("钱包账户或网络已变化，操作已停止。");
    let method: string;
    let args: unknown[];
    if (action === "terms") {
      let nextPrices: bigint[];
      let nextAmounts: bigint[];
      let nextTicket: bigint;
      try {
        nextPrices = prices.value.map((value) => parseUnits(value, previous.decimals));
        nextAmounts = amounts.value.map((value) => parseUnits(value, 18));
        nextTicket = parseUnits(ticketAmount.value, previous.decimals);
      } catch {
        throw new Error(`请输入有效的十进制数字；价格和认购金额最多 ${previous.decimals} 位小数，额度最多 18 位小数。`);
      }
      if (
        nextPrices.some((value) => value <= 0n) ||
        nextTicket <= 0n ||
        nextAmounts.some((value) => value <= 0n) ||
        nextAmounts.reduce((a, b) => a + b, 0n) !== parseUnits("3000000", 18)
      )
        throw new Error("三期价格和额度须大于零，额度合计须为 3,000,000 FRC。");
      const maxPrice = (1n << 128n) - 1n;
      if (
        nextTicket > maxPrice ||
        nextPrices.some((price) => price > maxPrice || (nextTicket * 10n ** 18n) / price === 0n)
      ) {
        throw new Error("价格超出合约允许范围，或单次认购金额不足以购买最小单位。");
      }
      const expected = nextPrices.reduce(
        (total, price, index) => total + (nextAmounts[index]! * price) / 10n ** 18n,
        0n,
      );
      if (expected < 600000n * 10n ** BigInt(previous.decimals)) {
        throw new Error("三期预计募集金额合计至少为 600,000 USDT。");
      }
      method = "configureSaleTerms";
      args = [nextPrices, nextAmounts, nextTicket];
    } else if (action === "schedule") {
      // 已开始的轮次必须原样保留链上开始时间，包括秒数。
      const original = previous.rounds[previous.cursor];
      const start =
        startLocked.value || startTime.value === localInput(original?.start ?? 0n)
          ? Number(original?.start ?? 0n)
          : Math.floor(new Date(startTime.value).getTime() / 1000);
      const end =
        endTime.value === localInput(original?.end ?? 0n)
          ? Number(original?.end ?? 0n)
          : Math.floor(new Date(endTime.value).getTime() / 1000);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end <= start)
        throw new Error("请选择有效的开始和结束时间。");
      method = "setRoundTimes";
      args = [previous.cursor, start, end];
    } else {
      method = "finalize";
      args = [previous.cursor];
    }
    // 模拟调用由合约校验最新轮次、角色、时间与条款限制。
    const write = sale.connect(signer).getFunction(method);
    walletConfirmation.value.title = "正在检查交易";
    walletConfirmation.value.message = "正在模拟交易并检查合约规则，请稍候。";
    await withTimeout(write.staticCall(...args), "交易模拟");
    await withTimeout(adminRequest(`/presale/authorize/${action}`), "后台权限检查");
    if (!(await withTimeout(checkedContext(), "钱包检查")).active) throw new Error("私募合约已不再是当前有效模块。");
    if (version !== contextVersion || pendingChange.value) throw new Error("钱包账户或网络已变化，操作已停止。");
    // 先让等待弹窗完成渲染，再请求钱包签名，避免钱包弹窗期间页面无反馈。
    walletConfirmation.value.title = "等待钱包确认";
    walletConfirmation.value.message = `请在钱包弹出的窗口中核对并确认“${walletConfirmation.value.label}”。钱包响应前，此页面会保持等待。`;
    // 让弹窗至少经过一次浏览器绘制，再调用可能打开钱包界面的 provider。
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const tx = await write(...args);
    walletConfirmation.value = null;
    submittedHash = tx.hash;
    transactions.value.unshift({
      hash: tx.hash,
      label: action === "terms" ? "设置条款" : action === "schedule" ? "设置时间" : "结算",
      status: "等待确认",
      chainId: current.chainId,
      sale: target.sale,
    });
    notice.value = "交易已提交，正在等待链上确认。";
    const receipt = await tx.wait(1, 120000);
    if (!receipt || receipt.status !== 1) throw new Error("交易未确认或执行失败，请通过交易哈希核查。");
    const confirmed = transactions.value.find((item) => item.hash === submittedHash);
    if (confirmed) confirmed.status = "已确认";
    notice.value = "交易已确认。";
    if (version === contextVersion) await refresh();
  } catch (reason) {
    const submitted = transactions.value.find((item) => item.hash === submittedHash);
    if (submitted) submitted.status = "未确认或失败，请核查";
    error.value = reason instanceof Error ? reason.message : "链上操作失败。";
  } finally {
    walletConfirmation.value = null;
    busy.value = false;
  }
}
async function reload() {
  error.value = "";
  invalidate();
  loading.value = true;
  try {
    const response = await fetch("/api/public/runtime-contracts", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("无法读取生效合约绑定。");
    const runtime: unknown = await response.json();
    if (!runtime || typeof runtime !== "object" || !("state" in runtime)) throw new Error("生效合约绑定数据无效。");
    const binding = runtime as {
      state: string;
      chainId?: number;
      deploymentId?: string;
      contracts?: Record<string, string>;
    };
    if (binding.state !== "bound") {
      chainId.value = null;
      deployments.value = [];
      selectedId.value = null;
      return;
    }
    if (!binding.chainId || !binding.deploymentId || !binding.contracts?.FairSaleV2 || !binding.contracts.ProjectToken)
      throw new Error("生效合约绑定不完整。");
    chainId.value = binding.chainId;
    deployments.value = [
      {
        id: binding.deploymentId,
        sale: binding.contracts.FairSaleV2,
        token: binding.contracts.ProjectToken,
        completedAt: "",
      },
    ];
    selectedId.value = binding.deploymentId;
  } catch (reason) {
    chainId.value = null;
    deployments.value = [];
    selectedId.value = null;
    error.value = reason instanceof Error ? reason.message : "无法读取生效合约绑定。";
  } finally {
    loading.value = false;
  }
  if (selected.value && wallet.value) await refresh();
}
onMounted(() => void reload());
</script>

<style lang="scss" scoped>
.presale-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel {
  border-radius: 16px;
  background: var(--admin-surface, #fff);
}
.heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
h2 {
  margin: 0 0 8px;
  font-size: 17px;
}
p {
  color: var(--admin-muted-text, #738096);
  line-height: 1.6;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.controls .q-select {
  min-width: min(420px, 100%);
}
.terms-grid,
.round-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.terms-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.round-grid .q-input {
  margin: 10px 0;
}
.error-banner {
  background: #fff0f1;
  color: #a92a3c;
}
.notice-banner {
  background: #e9fbf3;
  color: #13734b;
}
.transaction-history {
  padding: 16px;
}
.wallet-confirmation-card {
  width: min(480px, calc(100vw - 32px));
  border-radius: 16px;
}
.confirmation-details {
  display: grid;
  gap: 8px;
  padding-top: 0;
  color: var(--admin-muted-text, #738096);
}
code {
  overflow-wrap: anywhere;
}
@media (max-width: 800px) {
  .terms-grid,
  .round-grid {
    grid-template-columns: 1fr;
  }
  .controls .q-select {
    width: 100%;
  }
}
</style>
