<template>
  <div class="record-page">
    <router-link to="/trade">{{ t("trading_back_to_trade") }}</router-link>
    <h1>{{ t("trading_record_details") }}</h1>
    <p v-if="!wallet">{{ t("trading_connect_wallet") }}</p>
    <p v-else-if="loading">{{ t("trading_loading") }}</p>
    <p v-else-if="error" role="alert"
      >{{ error }} <button @click="load">{{ t("trading_refresh") }}</button></p
    >
    <p v-else-if="!record">{{ t("trading_record_missing") }}</p>
    <section v-else class="panel record-detail">
      <p>{{ t("trading_buy_status") }}: {{ status }}</p>
      <p>{{ t("trading_amount") }}: {{ amount }} {{ symbol }}</p>
      <p
        >{{ t("trading_record_time") }}:
        {{ new Date(record.created_at).toLocaleString() }}</p
      >
      <p v-if="record.approval_tx_hash"
        >{{ t("trading_approval_hash") }}
        <span>{{ record.approval_tx_hash }}</span></p
      >
      <p v-if="record.swap_tx_hash"
        >{{ t("trading_swap_hash") }} <span>{{ record.swap_tx_hash }}</span></p
      >
      <p v-if="record.error_code"
        >{{ t("trading_error_code") }}: {{ record.error_code }}</p
      >
      <div v-if="record.error_message"
        ><h2>{{ t("trading_error_details") }}</h2
        ><pre>{{ record.error_message }}</pre>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useWalletConnection } from "@chainforge/wallet-connect";
import { formatUnits } from "ethers";

interface RecordItem {
  id: string;
  amount_in: string;
  status: string;
  created_at: string;
  approval_tx_hash: string | null;
  swap_tx_hash: string | null;
  error_code: string | null;
  error_message: string | null;
}
const { t } = useI18n();
const { wallet } = useWalletConnection();
const route = useRoute();
const record = ref<RecordItem | null>(null);
const loading = ref(false);
const error = ref("");
const decimals = ref<number | null>(null);
const symbol = ref("");
const amount = computed(() =>
  record.value && decimals.value !== null
    ? formatUnits(BigInt(record.value.amount_in), decimals.value)
    : "—"
);
const status = computed(
  () =>
    (
      {
        awaiting_approval: t("trading_buy_awaiting_approval"),
        approval_pending: t("trading_buy_approval_pending"),
        approval_confirmed: t("trading_buy_approval_confirmed"),
        swap_pending: t("trading_buy_swap_pending"),
        succeeded: t("trading_buy_succeeded"),
        failed: t("trading_status_failed"),
        cancelled: t("trading_status_cancelled")
      } as Record<string, string>
    )[record.value?.status ?? ""] ?? "—"
);
async function load() {
  const address = wallet.value?.address;
  record.value = null;
  if (!address) return;
  loading.value = true;
  error.value = "";
  try {
    // 只加载当前连接钱包的记录，避免展示其他账户的数据。
    const [recordsResponse, marketResponse] = await Promise.all([
      fetch(`/api/public/limit-orders/market-buys/${address}`),
      fetch("/api/public/limit-orders/market")
    ]);
    if (!recordsResponse.ok || !marketResponse.ok)
      throw new Error(t("trading_market_buys_error"));
    const records = (await recordsResponse.json()) as {
      attempts: RecordItem[];
    };
    const market = (await marketResponse.json()) as {
      paymentDecimals: number;
      paymentSymbol: string;
    };
    if (wallet.value?.address.toLowerCase() !== address.toLowerCase()) return;
    record.value =
      records.attempts.find(item => item.id === String(route.params.id)) ??
      null;
    decimals.value = market.paymentDecimals;
    symbol.value = market.paymentSymbol;
  } catch {
    error.value = t("trading_market_buys_error");
  } finally {
    loading.value = false;
  }
}
watch(
  () => [wallet.value?.address, route.params.id],
  () => {
    void load();
  },
  { immediate: true }
);
</script>
<style lang="scss" scoped>
.record-page {
  max-width: 900px;
  margin: 0 auto;
}
.record-detail {
  padding: 24px;
}
.record-detail p,
.record-detail pre {
  overflow-wrap: anywhere;
}
.record-detail pre {
  white-space: pre-wrap;
  max-height: 320px;
  overflow: auto;
}
</style>
