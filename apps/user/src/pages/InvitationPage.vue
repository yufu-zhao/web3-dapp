<template>
  <section class="invitation-page">
    <h1>{{ t("referral_register_title") }}</h1>
    <p>{{ t("referral_register_hint") }}</p>
    <p v-if="!wallet" class="wallet-hint" role="status">{{
      t("referral_connect_wallet_hint")
    }}</p>
    <label
      >{{ t("referral_invite_code")
      }}<input v-model.trim="code" autocomplete="off"
    /></label>
    <button
      class="button primary"
      :disabled="busy || !wallet || !code"
      @click="registerWithCode"
      >{{
        busy ? t("text_e58e6fdcab54") : t("referral_register_button")
      }}</button
    >
    <p v-if="displayError" role="alert">{{ displayError }}</p>
  </section>
</template>
<script setup lang="ts">
// 注册页面只收集邀请码，钱包验证和用户创建由共享布局统一处理。
import { computed, inject, ref, watch, type Ref } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useWalletConnection } from "@chainforge/wallet-connect";
import {
  getRememberedInvitationCode,
  readInvitationCode,
  rememberInvitationCode
} from "../composables/invitation-code";
const { t } = useI18n();
const route = useRoute();
const { wallet } = useWalletConnection();
const code = ref(
  readInvitationCode(route.query.code ?? route.query.invite) ||
    getRememberedInvitationCode()
);
const error = ref("");
const busy = ref(false);
const registrationError = inject<Ref<string>>("registrationError");
const displayError = computed(
  () => error.value || registrationError?.value || ""
);
const register = inject<(invitationCode: string) => Promise<void>>(
  "registerCurrentWallet"
);
watch(
  () => route.query.code,
  value => {
    const nextCode = readInvitationCode(value ?? route.query.invite);
    if (nextCode) code.value = nextCode;
  }
);
watch(code, value => rememberInvitationCode(value), { immediate: true });
async function registerWithCode() {
  if (!register) return;
  busy.value = true;
  error.value = "";
  try {
    await register(code.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("registration_failed");
  } finally {
    busy.value = false;
  }
}
</script>
<style lang="scss" scoped>
.invitation-page {
  max-width: 520px;
  margin: 7vh auto;
  padding: 28px;
  border: 1px solid color-mix(in srgb, var(--user-text) 18%, transparent);
  border-radius: 18px;
  background: var(--user-surface);
}
.invitation-page h1 {
  margin: 18px 0 8px;
  font-size: 1.65rem;
  line-height: 1.3;
}
.invitation-page label {
  display: grid;
  gap: 8px;
  margin: 22px 0;
}
.invitation-page input {
  min-height: 48px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--user-text) 18%, transparent);
  border-radius: 10px;
  background: var(--user-background);
  color: var(--user-text);
}
.wallet-hint {
  color: var(--user-muted-text);
}
</style>
