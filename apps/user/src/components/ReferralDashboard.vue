<template>
  <section class="referral-dashboard">
    <div v-if="!wallet?.address" class="panel empty">
      <span class="empty-icon"><q-icon name="wallet" /></span>
      <h3>{{ t("referral_connect_wallet") }}</h3>
      <p>{{ t("referral_connect_wallet_hint") }}</p>
    </div>
    <div v-if="loading" class="panel">{{ t("trading_loading") }}</div>
    <div v-else-if="error && wallet?.address" class="panel error"
      >{{ error }}
      <button @click="load">{{ t("trading_refresh") }}</button></div
    >
    <template v-else-if="data">
      <section class="panel referral-card">
        <h2>{{ t("referral_invite_title") }}</h2>
        <img v-if="qr" :src="qr" :alt="t('referral_qr_alt')" />
        <div class="copy-row"
          ><code>{{ data.invitationCode }}</code
          ><button @click="copy(data.invitationCode)">{{
            t("referral_copy_code")
          }}</button></div
        >
        <div class="copy-row"
          ><input readonly :value="link" /><button @click="copy(link)">{{
            t("referral_copy_link")
          }}</button></div
        >
      </section>
      <section class="panel referral-card">
        <h2>{{ t("referral_direct_title") }} ({{ data.directCount }})</h2>
        <p v-if="!data.direct.length">{{ t("referral_direct_empty") }}</p>
        <ul v-else
          ><li v-for="user in data.direct" :key="user.wallet_address"
            ><span>{{ shorten(user.wallet_address) }}</span
            ><time>{{ new Date(user.created_at).toLocaleString() }}</time></li
          ></ul
        >
      </section>
    </template>
  </section>
</template>
<script setup lang="ts">
// 推广数据只从账户关系接口读取，不根据浏览器地址生成虚构的邀请码。
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Notify } from "quasar";
import QRCode from "qrcode";
import { useWalletConnection } from "@chainforge/wallet-connect";
const { t } = useI18n();
const { wallet } = useWalletConnection();
const data = ref<{
  invitationCode: string;
  directCount: number;
  direct: { wallet_address: string; created_at: string }[];
} | null>(null);
const qr = ref("");
const loading = ref(false);
const error = ref("");
const link = computed(
  () =>
    `${location.origin}/invite?code=${encodeURIComponent(data.value?.invitationCode ?? "")}`
);
watch(
  () => wallet.value?.address,
  () => void load()
);
onMounted(() => void load());
async function load() {
  const address = wallet.value?.address;
  if (!address) {
    data.value = null;
    qr.value = "";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const response = await fetch(`/api/public/users/${address}/referrals`, {
      cache: "no-store"
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.message || t("referral_load_failed"));
    data.value = body;
    qr.value = await QRCode.toDataURL(link.value, { width: 220, margin: 1 });
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : t("referral_load_failed");
  } finally {
    loading.value = false;
  }
}
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    Notify.create({ type: "positive", message: t("referral_copied") });
  } catch {
    Notify.create({ type: "negative", message: t("referral_copy_failed") });
  }
}
function shorten(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
</script>
<style lang="scss" scoped>
.referral-dashboard {
  display: grid;
  gap: 16px;
}
.referral-card {
  padding: 22px;
}
.referral-card h2 {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.4;
}
.referral-card img {
  display: block;
  width: 220px;
  height: 220px;
  margin: 14px auto;
}
.copy-row {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}
.copy-row input,
.copy-row code {
  min-width: 0;
  flex: 1;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--user-text) 18%, transparent);
  border-radius: 9px;
  background: var(--user-background);
  color: var(--user-text);
  overflow-wrap: anywhere;
}
.copy-row input {
  font-size: 0.82rem;
  text-overflow: ellipsis;
}
.copy-row button {
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--user-accent) 55%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--user-accent) 14%, var(--user-surface));
  color: var(--user-accent);
  white-space: nowrap;
}
.referral-card ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.referral-card li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid color-mix(in srgb, var(--user-text) 18%, transparent);
}
.referral-card time {
  color: var(--user-muted-text);
}
@media (max-width: 600px) {
  .referral-card {
    padding: 16px;
  }
  .referral-card h2 {
    font-size: 1.05rem;
  }
  .referral-card img {
    width: min(190px, 72vw);
    height: auto;
  }
  .referral-card li {
    flex-direction: column;
  }
  .copy-row {
    flex-direction: column;
  }
}
</style>
