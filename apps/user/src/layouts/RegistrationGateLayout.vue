<template>
  <section v-if="accountDisabled" class="disabled-account" role="alert">
    <div class="disabled-icon"><q-icon name="block" size="32px" /></div>
    <h1>{{ t("user_account_disabled_title") }}</h1>
    <p>{{ t("user_account_disabled_message") }}</p>
  </section>
  <template v-else>
    <p v-if="registrationError && route.path !== '/invite'" role="alert">
      {{ registrationError }}
    </p>
    <router-view v-if="gateReady" />
  </template>
</template>

<script setup lang="ts">
import { loadPublicInstallationConfig } from "@chainforge/shared-types";
import { useWalletConnection } from "@chainforge/wallet-connect";
import { onMounted, provide, ref, watch } from "vue";
import { useRoute, useRouter, type RouteLocationNormalized } from "vue-router";
import {
  clearRememberedInvitationCode,
  getRememberedInvitationCode,
  readInvitationCode,
  rememberInvitationCode
} from "../composables/invitation-code";
import { useI18n } from "vue-i18n";

// 根布局负责全站注册门禁，确保主页面和独立邀请页共用同一钱包状态。
const { wallet } = useWalletConnection();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const registrationError = ref("");
const gateReady = ref(false);
const accountDisabled = ref(false);
let registrationBusy = false;
let checking = false;
let lastCheckedAddress = "";
// 配置载入前按默认强制邀请处理，成功读取后再采用安装实例的明确设置。
let invitationRequired = true;
const configReady = loadPublicInstallationConfig()
  .then(config => {
    invitationRequired = Boolean(
      config.userAccess?.requireInvitationForRegistration
    );
  })
  .catch(() => {
    // 配置不可用时保持关闭式门禁，避免绕过服务端当前的注册策略。
    registrationError.value = t("registration_lookup_failed");
  });

router.beforeEach(async to => {
  await configReady;
  const code = routeInvitationCode(to);
  if (code) rememberInvitationCode(code);
  // 邀请落地页是无钱包状态下唯一放行的公开路由。
  if (!wallet.value) {
    if (!invitationRequired) return true;
    if (to.path === "/invite") return true;
    return {
      path: "/invite",
      query: { code: getRememberedInvitationCode() || undefined }
    };
  }

  const currentAddress = wallet.value.address;
  try {
    const response = await fetch(`/api/public/users/${currentAddress}`);
    if (!response.ok) throw new Error(t("registration_lookup_failed"));
    const result = (await response.json()) as {
      exists: boolean;
      account?: { isActive?: boolean } | null;
    };
    accountDisabled.value = result.exists && result.account?.isActive === false;
    if (accountDisabled.value) return true;
    if (result.exists) {
      if (to.path === "/invite") return safeNext(to);
      return true;
    }
    if (!invitationRequired) return true;
    if (to.path === "/invite") return true;
    return {
      path: "/invite",
      query: {
        code: getRememberedInvitationCode() || undefined,
        next: to.fullPath
      }
    };
  } catch (error) {
    registrationError.value =
      error instanceof Error ? error.message : t("registration_lookup_failed");
    if (to.path === "/invite") return true;
    return {
      path: "/invite",
      query: {
        code: getRememberedInvitationCode() || undefined,
        next: to.fullPath
      }
    };
  }
});

watch(
  () => wallet.value?.address,
  address => {
    if (!address) {
      lastCheckedAddress = "";
      accountDisabled.value = false;
      if (invitationRequired) void enforceConnectedWallet();
      return;
    }
    if (lastCheckedAddress === address || checking) return;
    lastCheckedAddress = address;
    accountDisabled.value = false;
    gateReady.value = false;
    void enforceConnectedWallet();
  }
);

onMounted(() => {
  const initialCode = routeInvitationCode(route);
  if (initialCode) rememberInvitationCode(initialCode);
  void enforceConnectedWallet();
});

async function enforceConnectedWallet() {
  if (checking) return;
  checking = true;
  try {
    await configReady;
    if (invitationRequired && !wallet.value && route.path !== "/invite") {
      await router.replace({
        path: "/invite",
        query: { code: getRememberedInvitationCode() || undefined }
      });
      return;
    }
    if (wallet.value) {
      const response = await fetch(`/api/public/users/${wallet.value.address}`);
      if (!response.ok) throw new Error(t("registration_lookup_failed"));
      const result = (await response.json()) as {
        exists: boolean;
        account?: { isActive?: boolean } | null;
      };
      accountDisabled.value =
        result.exists && result.account?.isActive === false;
      if (accountDisabled.value) return;
      if (result.exists && route.path === "/invite") {
        await router.replace(safeNext(route));
        return;
      }
      if (!result.exists && invitationRequired && route.path !== "/invite") {
        await router.replace({
          path: "/invite",
          query: {
            code: getRememberedInvitationCode() || undefined,
            next: route.fullPath
          }
        });
        return;
      }
      if (!result.exists && !invitationRequired) {
        await registerCurrentWallet(getRememberedInvitationCode());
        return;
      }
    }
  } catch (error) {
    registrationError.value =
      error instanceof Error ? error.message : t("registration_lookup_failed");
    if (invitationRequired && route.path !== "/invite") {
      await router.replace({
        path: "/invite",
        query: {
          code: getRememberedInvitationCode() || undefined,
          next: route.fullPath
        }
      });
    }
  } finally {
    gateReady.value = true;
    checking = false;
  }
}

function routeInvitationCode(to: RouteLocationNormalized): string {
  return (
    readInvitationCode(to.query.code) ||
    readInvitationCode(to.query.invite) ||
    readInvitationCode(to.query.ref)
  );
}

function safeNext(to: RouteLocationNormalized) {
  const target = to.query.next;
  if (
    typeof target === "string" &&
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.startsWith("/invite")
  ) {
    clearRememberedInvitationCode();
    return target;
  }
  clearRememberedInvitationCode();
  return "/mine";
}

async function registerCurrentWallet(invitationCode: string) {
  const current = wallet.value;
  if (!current || registrationBusy) return;
  registrationBusy = true;
  registrationError.value = "";
  const code =
    rememberInvitationCode(invitationCode) || getRememberedInvitationCode();
  try {
    const challengeResponse = await fetch(
      "/api/public/users/registration-challenge",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: current.address })
      }
    );
    const challenge = (await challengeResponse.json()) as {
      exists?: boolean;
      isActive?: boolean;
      message?: string | string[];
    };
    if (!challengeResponse.ok)
      throw new Error(
        Array.isArray(challenge.message)
          ? challenge.message.join(" ")
          : challenge.message || t("registration_lookup_failed")
      );
    if (challenge.exists) {
      accountDisabled.value = challenge.isActive === false;
      clearRememberedInvitationCode();
      if (!accountDisabled.value) await router.replace(safeNext(route));
      return;
    }
    if (typeof challenge.message !== "string" || !challenge.message)
      throw new Error(t("registration_lookup_failed"));
    const provider = new (await import("ethers")).BrowserProvider(
      current.provider as never
    );
    const signature = await (
      await provider.getSigner(current.address)
    ).signMessage(challenge.message);
    const response = await fetch("/api/public/users/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: current.address,
        message: challenge.message,
        signature,
        invitationCode: code
      })
    });
    const result = (await response.json()) as { message?: string };
    if (!response.ok)
      throw new Error(result.message || t("registration_failed"));
    clearRememberedInvitationCode();
    await router.replace(safeNext(route));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t("registration_failed");
    registrationError.value = message;
    throw error;
  } finally {
    registrationBusy = false;
  }
}

provide("registerCurrentWallet", registerCurrentWallet);
provide("registrationError", registrationError);
</script>

<style lang="scss" scoped>
.disabled-account {
  display: grid;
  min-height: 100vh;
  align-content: center;
  justify-items: center;
  padding: 32px 20px;
  background: var(--user-background);
  color: var(--user-text);
  text-align: center;
}

.disabled-icon {
  display: grid;
  width: 68px;
  height: 68px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--user-accent) 45%, transparent);
  border-radius: 50%;
  color: var(--user-accent);
}

.disabled-account h1 {
  margin: 22px 0 8px;
  font-size: 22px;
}

.disabled-account p {
  max-width: 420px;
  color: var(--user-muted-text);
  line-height: 1.7;
}
</style>
