<template>
  <section class="panel presale-account">
    <div class="account-title q-pb-lg">
      <div>
        <span class="account-eyebrow">MY PARTICIPATION</span>
        <div class="flex items-center q-gutter-x-md">
          <h2>{{ t("text_e100b15bcdac") }}</h2>
          <template v-if="snapshot">
            <q-badge v-if="snapshot.entered" color="positive">{{
              t("text_aebf00357b7b")
            }}</q-badge>
            <q-badge v-else color="grey-8">{{
              t("text_99a0ecb2bfe0")
            }}</q-badge>
          </template>
        </div>
        <!-- <p>{{ t('text_e70ae709c5ce') }}</p> -->
      </div>
      <span class="account-icon"><q-icon name="account_balance_wallet" /></span>
    </div>
    <p v-if="!wallet">{{ t("text_3eb11ed33a29") }}</p>
    <p v-else-if="loading">{{ t("text_3e2ac4e40080") }}</p>
    <template v-else-if="snapshot">
      <!-- <p>钱包：{{ wallet.address }} · 网络：{{ snapshot.chainId }}</p> -->
      <p v-if="snapshot.entered">
        {{
          t("text_70b167117882", {
            round: snapshot.round,
            status: snapshot.finalized
              ? t("text_374d13aec7f1")
              : t("text_48e294edd68a"),
          })
        }}
      </p>
      <div class="row q-col-gutter-x-md q-col-gutter-y-md">
        <div class="col-12 col-md-4">
          <dl class="account-metrics">
            <div>
              <dt>{{ t("text_c939e5f40f59") }}</dt>
              <dd>
                {{ displayAmount(snapshot.balance) }}
                <span>{{ snapshot.paymentSymbol }}</span>
              </dd>
            </div>
            <div>
              <dt>{{ t("text_521e65ffc7d0") }}</dt>
              <dd>
                {{ displayAmount(snapshot.allowance) }}
                <span>{{ snapshot.paymentSymbol }}</span>
              </dd>
            </div>
          </dl>
        </div>

        <div class="col-12 col-md-4">
          <dl class="account-metrics">
            <div>
              <dt>{{ t("text_30d576474480") }}</dt>
              <dd>
                {{ displayAmount(snapshot.allocation) }}
                <span>{{ tokenSymbol }}</span>
              </dd>
            </div>
            <div>
              <dt>{{ t("text_54cd6730d6f4") }}</dt>
              <dd>
                {{ displayAmount(snapshot.claimable) }}
                <span>{{ tokenSymbol }}</span>
              </dd>
            </div>
          </dl>
        </div>
        <div class="col-12 col-md-4">
          <dl class="account-metrics">
            <div>
              <dt>{{ t("text_a7ed6176eb8b") }}</dt>
              <dd>
                {{
                  snapshot.refundClaimed
                    ? t("text_426e458a4124")
                    : displayAmount(snapshot.refund)
                }}
                <span v-if="!snapshot.refundClaimed">{{
                  snapshot.paymentSymbol
                }}</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <p v-if="snapshot.open && !snapshot.entered">
        {{
          t("text_3070e857fcba", {
            amount: snapshot.ticket,
            symbol: snapshot.paymentSymbol,
            round: snapshot.currentRound + 1,
            price: snapshot.price,
          })
        }}
      </p>
      <div class="presale-actions">
        <button
          v-if="mockEnabled && snapshot.chainId !== 56"
          class="button secondary"
          :disabled="busy || Boolean(pending)"
          @click="mockDialog = true"
        >
          {{ t("text_2a41af87a3b0") }}
        </button>
        <button
          v-if="snapshot.open && !snapshot.entered"
          class="button primary"
          :disabled="busy || Boolean(pending)"
          @click="openConfirmation"
        >
          {{ t("text_d6f1a2bc053e") }}
        </button>
        <button
          v-if="
            snapshot.entered &&
            snapshot.finalized &&
            !snapshot.refundClaimed &&
            snapshot.hasRefund
          "
          class="button secondary"
          :disabled="busy || Boolean(pending)"
          @click="write('claimRefund')"
        >
          {{ t("text_6eb6ad14265a") }}
        </button>
        <button
          v-if="snapshot.hasClaimable"
          class="button secondary"
          :disabled="busy || Boolean(pending)"
          @click="write('claim')"
        >
          {{ t("text_479a8d2dd797") }}
        </button>
        <button class="button secondary" :disabled="busy" @click="refresh">
          {{ t("text_802a407c7743") }}
        </button>
      </div>
    </template>
    <p v-if="pending">
      {{ t("text_cff945cbaf57", { kind: translateKind(pending.kind) })
      }}<TransactionLink :hash="pending.hash" :chain-id="pending.chainId" />{{
        t("text_8b2fcf7a94c7")
      }}
    </p>
    <button
      v-if="pending && !busy"
      class="button secondary"
      @click="checkPending"
    >
      {{ t("text_20214c2ee8c8") }}
    </button>
    <button
      v-if="syncHash && !busy"
      class="button secondary"
      @click="report(syncHash)"
    >
      {{ t("text_27681bf81853") }}
    </button>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="lastTransaction">
      {{ t("text_4632c95071d5")
      }}<TransactionLink
        :hash="lastTransaction.hash"
        :chain-id="lastTransaction.chainId"
      />
    </p>
    <q-dialog v-model="mockDialog" :persistent="busy"
      ><q-card class="confirm-card"
        ><div class="confirm-heading">
          <h2>{{ t("text_9ec2865fb6cb") }}</h2>
        </div>
        <p class="confirm-intro">
          {{ t("text_21b8af1750f1") }}
        </p>
        <dl class="confirm-details">
          <div>
            <dt>{{ t("text_ae206f36e7e1") }}</dt>
            <dd class="confirm-address">{{ wallet?.address }}</dd>
          </div>
          <div>
            <dt>{{ t("text_97b31b5d63f5") }}</dt>
            <dd>Chain ID {{ snapshot?.chainId }}</dd>
          </div>
          <div>
            <dt>{{ t("text_1c871c22a867") }}</dt>
            <dd>{{ snapshot?.paymentSymbol }}</dd>
          </div>
        </dl>
        <label class="mock-label" for="mock-amount">{{
          t("text_e30ee2ef4a62")
        }}</label
        ><input
          id="mock-amount"
          v-model.trim="mockAmount"
          class="mock-input"
          type="text"
          inputmode="decimal"
          :placeholder="t('text_ec6ac20e4abe')"
        />
        <p v-if="mockError" class="notice" role="alert">{{ mockError }}</p>
        <div class="confirm-actions">
          <button
            class="button secondary"
            :disabled="busy"
            @click="mockDialog = false"
          >
            {{ t("text_2cd0f3be8738") }}</button
          ><button
            class="button primary"
            :disabled="busy || Boolean(pending)"
            @click="mintMock"
          >
            {{ busy ? t("text_40206076cfa7") : t("text_c3041b501978") }}
          </button>
        </div></q-card
      ></q-dialog
    >
    <q-dialog v-model="confirmationOpen" :persistent="busy">
      <q-card class="confirm-card">
        <div class="confirm-heading">
          <div>
            <span class="account-eyebrow">PRIVATE SALE</span>
            <h2>{{ t("text_e284b32ff4d5") }}</h2>
          </div>
          <button
            v-if="!busy"
            type="button"
            class="dialog-close"
            :aria-label="t('text_3fd47edce45b')"
            @click="confirmationOpen = false"
          >
            <q-icon name="close" />
          </button>
        </div>
        <p class="confirm-intro">{{ t("text_3ea276d52299") }}</p>
        <dl v-if="reviewedSnapshot" class="confirm-details">
          <div>
            <dt>{{ t("text_4aaeb48743e5") }}</dt>
            <dd>
              {{
                t("text_60b8db6ee8cd", {
                  round: reviewedSnapshot.currentRound + 1,
                })
              }}
            </dd>
          </div>
          <div>
            <dt>{{ t("text_6c140b391347") }}</dt>
            <dd>
              {{ reviewedSnapshot.ticket }} {{ reviewedSnapshot.paymentSymbol }}
            </dd>
          </div>
          <div>
            <dt>{{ t("text_5a0451b56e01") }}</dt>
            <dd>
              {{ reviewedSnapshot.price }}
              {{ reviewedSnapshot.paymentSymbol }} / {{ tokenSymbol }}
            </dd>
          </div>
          <div>
            <dt>{{ t("text_b5adee6cb38e") }}</dt>
            <dd class="confirm-address">{{ reviewedAddress }}</dd>
          </div>
          <div>
            <dt>{{ t("text_97b31b5d63f5") }}</dt>
            <dd>Chain ID {{ reviewedSnapshot.chainId }}</dd>
          </div>
        </dl>
        <div class="confirm-steps">
          <div class="confirm-step">
            <span class="step-number">1</span>
            <div>
              <strong>{{ t("text_68496c86e24b") }}</strong
              ><small>{{ translateStatus(approvalStatus) }}</small
              ><TransactionLink
                v-if="approvalTx"
                :hash="approvalTx.hash"
                :chain-id="approvalTx.chainId"
              />
            </div>
          </div>
          <div class="confirm-step">
            <span class="step-number">2</span>
            <div>
              <strong>{{ t("text_d6f1a2bc053e") }}</strong
              ><small>{{ translateStatus(commitStatus) }}</small
              ><TransactionLink
                v-if="commitTx"
                :hash="commitTx.hash"
                :chain-id="commitTx.chainId"
              />
            </div>
          </div>
        </div>
        <p v-if="dialogError" class="notice" role="status">{{ dialogError }}</p>
        <div class="confirm-actions">
          <button
            class="button secondary"
            :disabled="busy"
            @click="confirmationOpen = false"
          >
            {{
              commitStatus === "已完成"
                ? t("text_3fd47edce45b")
                : t("text_2cd0f3be8738")
            }}</button
          ><button
            v-if="commitStatus !== '已完成'"
            class="button primary"
            :disabled="busy || Boolean(pending)"
            @click="commit"
          >
            {{ busy ? t("text_40206076cfa7") : t("text_2ea8720ffaae") }}
          </button>
        </div>
      </q-card>
    </q-dialog>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();
import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import {
  useWalletConnection,
  type ConnectedWallet,
} from "@chainforge/wallet-connect";
import { onMounted, ref, watch } from "vue";
import { Notify } from "quasar";
import TransactionLink from "./TransactionLink.vue";

defineProps<{ tokenSymbol: string }>();
const emit = defineEmits<{ updated: [] }>();
const statusKeys: Record<string, string> = {
  待确认: "text_a8b0bd9c65f7",
  等待授权完成: "text_d0ed839a8655",
  "授权额度充足，无需重复授权": "text_a9683339e4de",
  需要钱包确认授权: "text_2ba955df13ff",
  等待确认认购: "text_3879c39dc3f4",
  "已提交，等待链上确认": "text_d65e19ca2331",
  已完成: "text_f28461bb49c8",
  请在钱包中确认授权: "text_a3321f43b3b3",
  请在钱包中确认认购: "text_c8754e21ae7a",
};
const kindKeys: Record<string, string> = {
  授权: "text_6cf2531ab111",
  认购: "text_b6cf7c6414ef",
  领取测试币: "text_2a41af87a3b0",
  领取代币: "text_479a8d2dd797",
  领取退款: "text_6eb6ad14265a",
};
function translateStatus(value: string) {
  return statusKeys[value] ? t(statusKeys[value]!) : value;
}
function translateKind(value: string) {
  return kindKeys[value] ? t(kindKeys[value]!) : value;
}
const { wallet } = useWalletConnection();
const saleAbi = [
  "function token() view returns(address)",
  "function paymentToken() view returns(address)",
  "function activeModule() view returns(bool)",
  "function cursor() view returns(uint8)",
  "function roundStartTimes(uint256) view returns(uint256)",
  "function rounds(uint256) view returns(uint256 endTime,uint256 offered,uint256 participants,uint256 allocated,uint256 share,uint256 extraWeiParticipants,uint256 acceptedPayment,bool finalized)",
  "function price(uint8) view returns(uint256)",
  "function ticket() view returns(uint256)",
  "function termsHash(uint8) view returns(bytes32)",
  "function entries(address) view returns(uint8 roundPlusOne,uint256 index,bool refundClaimed)",
  "function allocationOf(address) view returns(uint256 amount,uint256 cost,uint256 refund)",
  "function claimable(address) view returns(uint256)",
  "function commitWithTerms(uint8,bytes32)",
  "function claimRefund()",
  "function claim()",
];
const ercAbi = [
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function approve(address,uint256) returns(bool)",
];
type Binding = { chainId: number; sale: string; token: string };
type Snapshot = {
  chainId: number;
  entered: boolean;
  round: number;
  finalized: boolean;
  refundClaimed: boolean;
  allocation: string;
  refund: string;
  claimable: string;
  hasRefund: boolean;
  hasClaimable: boolean;
  balance: string;
  allowance: string;
  paymentSymbol: string;
  ticket: string;
  price: string;
  currentRound: number;
  open: boolean;
  terms: string;
  ticketRaw: bigint;
  allowanceRaw: bigint;
};
type Pending = { hash: string; kind: string; chainId: number; address: string };
const snapshot = ref<Snapshot | null>(null);
const pending = ref<Pending | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const message = ref("");
const confirmationOpen = ref(false);
const mockEnabled = ref(false);
const mockDialog = ref(false);
const mockAmount = ref("");
const mockError = ref("");
async function readMockEnabled() {
  const response = await fetch("/api/public/mockusdt-config", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(t("text_286d44ae2748"));
  const config = await response.json();
  return config.enabled === true;
}
onMounted(async () => {
  try {
    mockEnabled.value = await readMockEnabled();
  } catch {
    mockEnabled.value = false;
  }
});
const reviewedSnapshot = ref<Snapshot | null>(null);
const reviewedAddress = ref("");
const approvalStatus = ref("待确认");
const commitStatus = ref("等待授权完成");
const dialogError = ref("");
const approvalTx = ref<{ hash: string; chainId: number } | null>(null);
const commitTx = ref<{ hash: string; chainId: number } | null>(null);
const lastTransaction = ref<{ hash: string; chainId: number } | null>(null);
function openConfirmation() {
  if (!snapshot.value || !wallet.value) return;
  reviewedSnapshot.value = { ...snapshot.value };
  reviewedAddress.value = wallet.value.address;
  approvalStatus.value =
    snapshot.value.allowanceRaw >= snapshot.value.ticketRaw
      ? "授权额度充足，无需重复授权"
      : "需要钱包确认授权";
  commitStatus.value =
    snapshot.value.allowanceRaw >= snapshot.value.ticketRaw
      ? "等待确认认购"
      : "等待授权完成";
  approvalTx.value = null;
  commitTx.value = null;
  dialogError.value = "";
  confirmationOpen.value = true;
}
const storageKey = "chainforge:presale-pending";
const syncKey = "chainforge:presale-sync-hash";
const syncHash = ref(localStorage.getItem(syncKey) || "");
let revision = 0;
let walletEpoch = 0;
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) pending.value = JSON.parse(saved) as Pending;
} catch {
  /* 损坏的缓存不影响只读查询。 */
}
// 保留一位小数时截断，避免将余额或可领取数量显示得高于实际值。
function displayAmount(value: string) {
  const [integer = "0", fraction = ""] = value.split(".");
  if (
    BigInt(integer) === 0n &&
    fraction.slice(0, 1) === "0" &&
    /[1-9]/.test(fraction.slice(1))
  )
    return "<0.1";
  return `${integer}.${fraction.padEnd(1, "0").slice(0, 1)}`;
}
// 钱包错误可能包含完整 RPC 请求，仅识别稳定错误码及本地提示，不直接展示底层异常。
function notifyTransactionError(reason: unknown, fallback: string) {
  const item =
    reason && typeof reason === "object"
      ? (reason as {
          code?: unknown;
          info?: { error?: { code?: unknown } };
          message?: unknown;
        })
      : null;
  const code = item?.code ?? item?.info?.error?.code;
  let text = fallback;
  if (code === "ACTION_REJECTED" || code === 4001 || code === "4001")
    text = t("text_c65c7ec95ec4");
  else if (code === "INSUFFICIENT_FUNDS") text = t("text_d1e21548425a");
  else if (code === "TIMEOUT") text = t("text_0c7a52ca66b6");
  else if (
    typeof item?.message === "string" &&
    /^[\u4e00-\u9fff\dA-Za-z ，。、：]+$/.test(item.message) &&
    item.message.length < 90
  )
    text = item.message;
  Notify.create({
    type: "warning",
    message: text,
    position: "top",
    timeout: 4000,
  });
}
function savePending(value: Pending | null) {
  pending.value = value;
  if (value) localStorage.setItem(storageKey, JSON.stringify(value));
  else localStorage.removeItem(storageKey);
}
async function binding(): Promise<Binding> {
  const response = await fetch("/api/public/runtime-contracts", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(t("text_52f8b2fa8af6"));
  const data = await response.json();
  if (
    data.state !== "bound" ||
    !data.contracts?.FairSaleV2 ||
    !data.contracts?.ProjectToken
  )
    throw new Error(t("text_b9002e23e532"));
  return {
    chainId: data.chainId,
    sale: data.contracts.FairSaleV2,
    token: data.contracts.ProjectToken,
  };
}
// 每次写入前重新核对账户、网络和合约绑定，切换后不继续下一步。
async function context(expected: ConnectedWallet) {
  const target = await binding();
  const provider = new BrowserProvider(expected.provider as never);
  const [chain, accounts] = await Promise.all([
    provider.send("eth_chainId", []),
    provider.send("eth_accounts", []),
  ]);
  if (
    Number(chain) !== target.chainId ||
    !Array.isArray(accounts) ||
    String(accounts[0]).toLowerCase() !== expected.address.toLowerCase() ||
    wallet.value?.address.toLowerCase() !== expected.address.toLowerCase() ||
    wallet.value?.chainId !== target.chainId
  )
    throw new Error(t("text_8630d001179c", { chainId: target.chainId }));
  const sale = new Contract(target.sale, saleAbi, provider);
  const token = new Contract(
    target.token,
    ["function sale() view returns(address)"],
    provider,
  );
  const [saleToken, tokenSale, active] = await Promise.all([
    sale.getFunction("token")(),
    token.getFunction("sale")(),
    sale.getFunction("activeModule")(),
  ]);
  if (
    !active ||
    String(saleToken).toLowerCase() !== target.token.toLowerCase() ||
    String(tokenSale).toLowerCase() !== target.sale.toLowerCase()
  )
    throw new Error(t("text_8f19ba58c26d"));
  return { provider, sale, target };
}
async function refresh() {
  const current = wallet.value;
  const version = ++revision;
  snapshot.value = null;
  error.value = "";
  if (!current) return;
  loading.value = true;
  try {
    const { provider, sale, target } = await context(current);
    const [
      paymentAddress,
      entry,
      allocation,
      claimable,
      cursor,
      ticket,
      block,
    ] = await Promise.all([
      sale.getFunction("paymentToken")(),
      sale.getFunction("entries")(current.address),
      sale.getFunction("allocationOf")(current.address),
      sale.getFunction("claimable")(current.address),
      sale.getFunction("cursor")(),
      sale.getFunction("ticket")(),
      provider.getBlock("latest"),
    ]);
    const payment = new Contract(paymentAddress, ercAbi, provider);
    const [decimals, symbol, balance, allowance] = await Promise.all([
      payment.getFunction("decimals")(),
      payment.getFunction("symbol")(),
      payment.getFunction("balanceOf")(current.address),
      payment.getFunction("allowance")(current.address, target.sale),
    ]);
    const roundIndex = Number(cursor);
    const entered = Number(entry.roundPlusOne) > 0;
    const entryRound = entered ? Number(entry.roundPlusOne) - 1 : -1;
    const [entryData, roundData, start, price, terms] = await Promise.all([
      entered ? sale.getFunction("rounds")(entryRound) : null,
      roundIndex < 3 ? sale.getFunction("rounds")(roundIndex) : null,
      roundIndex < 3 ? sale.getFunction("roundStartTimes")(roundIndex) : 0n,
      roundIndex < 3 ? sale.getFunction("price")(roundIndex) : 0n,
      roundIndex < 3 ? sale.getFunction("termsHash")(roundIndex) : "",
    ]);
    if (!block) throw new Error(t("text_e1880ab0704b"));
    if (version !== revision) return;
    snapshot.value = {
      chainId: target.chainId,
      entered,
      round: entryRound + 1,
      finalized: Boolean(entryData?.finalized),
      refundClaimed: Boolean(entry.refundClaimed),
      allocation: formatUnits(allocation.amount, 18),
      refund: formatUnits(allocation.refund, decimals),
      claimable: formatUnits(claimable, 18),
      hasRefund: allocation.refund > 0n,
      hasClaimable: claimable > 0n,
      balance: formatUnits(balance, decimals),
      allowance: formatUnits(allowance, decimals),
      paymentSymbol: String(symbol),
      ticket: formatUnits(ticket, decimals),
      price: formatUnits(price, decimals),
      currentRound: roundIndex,
      open: Boolean(
        roundData &&
        start > 0n &&
        BigInt(block.timestamp) >= start &&
        BigInt(block.timestamp) < roundData.endTime &&
        !roundData.finalized,
      ),
      terms: String(terms),
      ticketRaw: ticket,
      allowanceRaw: allowance,
    };
  } catch (e) {
    if (version === revision)
      error.value = e instanceof Error ? e.message : t("text_777d2ec619e7");
  } finally {
    if (version === revision) loading.value = false;
  }
}
// 倒计时边界只刷新读取状态，钱包交易进行时不打断当前流程。
defineExpose({
  refreshAfterTransition: () => {
    if (!busy.value) void refresh();
  },
});
async function waitReceipt(provider: BrowserProvider, hash: string) {
  const receipt = await provider.waitForTransaction(hash, 1, 120000);
  if (!receipt) throw new Error(t("text_5715ca6bdc0f"));
  return receipt;
}
async function checkPending() {
  const p = pending.value;
  const current = wallet.value;
  if (!p || !current) return;
  if (
    current.address.toLowerCase() !== p.address.toLowerCase() ||
    current.chainId !== p.chainId
  ) {
    error.value = t("text_81b73db195ae");
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const { provider } = await context(current);
    const receipt = await provider.getTransactionReceipt(p.hash);
    if (!receipt) throw new Error(t("text_5140ac1b49ca"));
    if (receipt.status !== 1) {
      savePending(null);
      throw new Error(t("text_876e0778e352"));
    }
    if (p.kind === "认购") void report(p.hash);
    savePending(null);
    lastTransaction.value = { hash: p.hash, chainId: p.chainId };
    message.value = t("text_68c1eb2f473d");
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("text_1669a3295716");
  } finally {
    busy.value = false;
  }
}
async function report(hash: string) {
  syncHash.value = hash;
  localStorage.setItem(syncKey, hash);
  try {
    const response = await fetch("/api/public/presale-records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transactionHash: hash }),
    });
    if (response.ok) {
      syncHash.value = "";
      localStorage.removeItem(syncKey);
    }
    if (!response.ok) message.value = t("text_3127131cfa35");
  } catch {
    message.value = t("text_66ebf56899ed");
  }
}
async function submit(
  current: ConnectedWallet,
  kind: string,
  send: () => Promise<{ hash: string }>,
  provider: BrowserProvider,
) {
  const tx = await send();
  const link = { hash: tx.hash, chainId: current.chainId };
  lastTransaction.value = link;
  if (kind === "授权") {
    approvalTx.value = link;
    approvalStatus.value = "已提交，等待链上确认";
  }
  if (kind === "认购") {
    commitTx.value = link;
    commitStatus.value = "已提交，等待链上确认";
  }
  savePending({
    hash: tx.hash,
    kind,
    chainId: current.chainId,
    address: current.address,
  });
  const receipt = await waitReceipt(provider, tx.hash);
  if (receipt.status !== 1) {
    savePending(null);
    throw new Error(t("text_08d76e56edd6", { kind: translateKind(kind) }));
  }
  savePending(null);
  message.value = t("text_a3ae1ddbc0e4", { kind: translateKind(kind) });
  return tx.hash;
}
async function commit() {
  const current = wallet.value;
  const reviewed = reviewedSnapshot.value;
  if (!current || !reviewed || busy.value || pending.value) return;
  if (
    current.address.toLowerCase() !== reviewedAddress.value.toLowerCase() ||
    current.chainId !== reviewed.chainId
  ) {
    dialogError.value = t("text_b2c0fdb8a0fe");
    return;
  }
  busy.value = true;
  const initialEpoch = walletEpoch;
  error.value = "";
  message.value = "";
  dialogError.value = "";
  try {
    let ctx = await context(current);
    let signer = await ctx.provider.getSigner(current.address);
    const paymentAddress = await ctx.sale.getFunction("paymentToken")();
    let payment = new Contract(paymentAddress, ercAbi, signer);
    const [terms, ticket, entry, allowance] = await Promise.all([
      ctx.sale.getFunction("termsHash")(reviewed.currentRound),
      ctx.sale.getFunction("ticket")(),
      ctx.sale.getFunction("entries")(current.address),
      payment.getFunction("allowance")(current.address, ctx.target.sale),
    ]);
    if (
      terms !== reviewed.terms ||
      ticket !== reviewed.ticketRaw ||
      Number(entry.roundPlusOne) !== 0
    )
      throw new Error(t("text_1cf040985c90"));
    if (allowance < ticket) {
      approvalStatus.value = "请在钱包中确认授权";
      await submit(
        current,
        "授权",
        () => payment.getFunction("approve")(ctx.target.sale, ticket),
        ctx.provider,
      );
      approvalStatus.value = "已完成";
      if (walletEpoch !== initialEpoch) throw new Error(t("text_936052a10b26"));
      ctx = await context(current);
      signer = await ctx.provider.getSigner(current.address);
      payment = new Contract(paymentAddress, ercAbi, signer);
      if (
        (await payment.getFunction("allowance")(
          current.address,
          ctx.target.sale,
        )) < ticket
      )
        throw new Error(t("text_ba7228a6c553"));
    }
    if (allowance >= ticket)
      approvalStatus.value = "授权额度充足，无需重复授权";
    commitStatus.value = "请在钱包中确认认购";
    const freshTerms = await ctx.sale.getFunction("termsHash")(
      reviewed.currentRound,
    );
    if (freshTerms !== reviewed.terms) throw new Error(t("text_9e0c2d493024"));
    if (walletEpoch !== initialEpoch) throw new Error(t("text_936052a10b26"));
    await context(current);
    const connected = ctx.sale.connect(signer) as Contract;
    const hash = await submit(
      current,
      "认购",
      () =>
        connected.getFunction("commitWithTerms")(
          reviewed.currentRound,
          reviewed.terms,
        ),
      ctx.provider,
    );
    commitStatus.value = "已完成";
    void report(hash);
    await refresh();
    emit("updated");
  } catch (e) {
    dialogError.value = pending.value
      ? t("text_2828d2e06a69")
      : t("text_4591a7cae731");
    notifyTransactionError(e, dialogError.value);
    // 授权成功后即使认购取消，也要重新读取已授权额度。
    await refresh();
  } finally {
    busy.value = false;
  }
}
// 在签名前重新确认配置、绑定和钱包，数量以代币精度精确换算。
async function mintMock() {
  const current = wallet.value;
  if (!current || !snapshot.value || busy.value || pending.value) return;
  mockError.value = "";
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(mockAmount.value)) {
    mockError.value = t("text_32960f85c70d");
    return;
  }
  busy.value = true;
  const initialEpoch = walletEpoch;
  try {
    if (!(await readMockEnabled())) throw new Error(t("text_e672d1e7ae44"));
    const ctx = await context(current);
    if (ctx.target.chainId === 56) throw new Error(t("text_62e1a10bbda7"));
    const paymentAddress = await ctx.sale.getFunction("paymentToken")();
    const payment = new Contract(
      paymentAddress,
      [...ercAbi, "function mint(address,uint256)"],
      ctx.provider,
    );
    const decimals = Number(await payment.getFunction("decimals")());
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
      throw new Error(t("text_340178b42a3a"));
    let amount: bigint;
    try {
      amount = parseUnits(mockAmount.value, decimals);
    } catch {
      throw new Error(t("text_7e3801316862", { decimals }));
    }
    if (amount <= 0n || amount >= 2n ** 256n)
      throw new Error(t("text_81380efcbf27"));
    const signer = await ctx.provider.getSigner(current.address);
    if (walletEpoch !== initialEpoch) throw new Error(t("text_bbe558300e5c"));
    await context(current);
    const writable = payment.connect(signer) as Contract;
    await submit(
      current,
      "领取测试币",
      () => writable.getFunction("mint")(current.address, amount),
      ctx.provider,
    );
    mockDialog.value = false;
    mockAmount.value = "";
    await refresh();
  } catch (e) {
    mockError.value = pending.value
      ? t("text_2828d2e06a69")
      : t("text_1bb523044bd1");
    notifyTransactionError(e, mockError.value);
  } finally {
    busy.value = false;
  }
}
async function write(method: "claim" | "claimRefund") {
  const current = wallet.value;
  if (!current || busy.value || pending.value) return;
  busy.value = true;
  error.value = "";
  try {
    const ctx = await context(current);
    const signer = await ctx.provider.getSigner(current.address);
    const contract = ctx.sale.connect(signer) as Contract;
    await submit(
      current,
      method === "claim" ? "领取代币" : "领取退款",
      () => contract.getFunction(method)(),
      ctx.provider,
    );
    await refresh();
  } catch (e) {
    notifyTransactionError(
      e,
      pending.value ? t("text_fd02fb439e14") : t("text_49a60439db7d"),
    );
  } finally {
    busy.value = false;
  }
}
watch(
  () => [wallet.value?.address, wallet.value?.chainId],
  () => {
    walletEpoch++;
    void refresh();
  },
  { immediate: true, flush: "sync" },
);
</script>
<style scoped lang="scss">
.presale-account {
  padding: 28px;
  overflow-wrap: anywhere;
}
.account-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.account-title p {
  font-size: 12px;
  margin: 5px 0 0;
}
.account-eyebrow {
  color: var(--user-accent);
  font-size: 10px;
  letter-spacing: 0.14em;
  font-weight: 700;
}
.account-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  background: rgba(255, 200, 50, 0.1);
  color: var(--user-accent);
  font-size: 22px;
}
.account-metrics {
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.1);
  padding: 4px 16px;
  height: 100%;
}
.account-metrics > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.account-metrics > div:last-child {
  border-bottom: 0;
}
.account-metrics dt {
  flex: 0 0 90px;
  color: var(--user-muted-text);
  font-size: 13px;
}
.account-metrics dd {
  margin: 0;
  color: var(--user-text);
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.account-metrics dd span {
  color: var(--user-muted-text);
  font-size: 12px;
  font-weight: 400;
}
@media (max-width: 760px) {
  .presale-account {
    padding: 20px;
  }
}
.presale-account h2 {
  font-size: 20px;
}
.presale-account p {
  margin: 12px 0;
  color: var(--user-muted-text);
}
.presale-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.mock-label {
  display: block;
  margin: 18px 0 8px;
  color: var(--user-muted-text);
  font-size: 13px;
}
.mock-input {
  width: 100%;
  padding: 12px;
  color: var(--user-text);
  background: var(--user-background);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
}
.confirm-card {
  width: min(520px, calc(100vw - 32px));
  padding: 24px;
  color: var(--user-text);
  background: var(--user-surface);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
}
.confirm-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
}
.confirm-heading h2 {
  margin: 6px 0 0;
  font-size: 22px;
  line-height: 1.3;
  font-weight: 700;
}
.dialog-close {
  border: 0;
  background: transparent;
  color: var(--user-muted-text);
  font-size: 22px;
}
.confirm-intro {
  margin: 10px 0 20px;
  color: var(--user-muted-text);
  font-size: 13px;
}
.confirm-details {
  background: rgba(0, 0, 0, 0.12);
  border-radius: 10px;
  padding: 8px 14px;
}
.confirm-details > div {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
}
.confirm-details dt {
  color: var(--user-muted-text);
  flex-shrink: 0;
}
.confirm-details dd {
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}
.confirm-address {
  font-size: 12px;
}
.confirm-steps {
  display: grid;
  gap: 14px;
  margin: 20px 0;
}
.confirm-step {
  display: flex;
  gap: 12px;
  align-items: start;
}
.step-number {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: var(--user-on-primary);
  background: var(--user-accent);
  font-weight: 700;
  flex-shrink: 0;
}
.confirm-step strong,
.confirm-step small {
  display: block;
}
.confirm-step small {
  color: var(--user-muted-text);
  margin: 4px 0;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
