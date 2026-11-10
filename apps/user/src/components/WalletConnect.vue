<template>
  <div class="user-wallet-connect">
    <WalletConnectButton
      v-if="walletKitReady"
      :label="t('text_26ee90b0ba52')"
      :loading-label="t('text_e58e6fdcab54')"
      size="md"
    />
    <q-banner v-else dense rounded class="wallet-config-error">
      {{ t("text_dfdc8c69a25b") }}
    </q-banner>
    <div v-if="networkMessage" class="network-notice" role="status">
      <span>{{ networkMessage }}</span>
      <button
        v-if="canRetry"
        type="button"
        :disabled="switching"
        @click="switchNetwork"
      >
        {{ t("text_54dfe35e3c1d") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();
import { computed, onMounted, ref, watch } from "vue";
import {
  WalletConnectButton,
  walletKitReady,
  useWalletConnection,
} from "@chainforge/wallet-connect";
import { loadPublicInstallationConfig } from "@chainforge/shared-types";

const { wallet } = useWalletConnection();
const targetChain = ref<number | null>(null);
const configError = ref("");
const switchError = ref("");
const switching = ref(false);
let attempted = false;
let connectionVersion = 0;
const canRetry = computed(() =>
  Boolean(
    wallet.value &&
    targetChain.value &&
    wallet.value.chainId !== targetChain.value,
  ),
);
const networkMessage = computed(() => {
  if (configError.value) return configError.value;
  if (switching.value) return t("text_6da33793a675");
  if (canRetry.value)
    return (
      switchError.value ||
      t("text_bcc87d162a38", { chainId: targetChain.value })
    );
  return "";
});

// 仅在首次连接或恢复连接时自动请求一次，后续网络变化由用户手动处理，避免打断交易。
watch(
  () => (wallet.value ? `${wallet.value.address.toLowerCase()}` : ""),
  (address, previous) => {
    if (address !== previous) {
      connectionVersion++;
      attempted = false;
      switchError.value = "";
    }
    void autoSwitch();
  },
  { immediate: true },
);
watch(
  () => wallet.value?.chainId,
  () => {
    if (!canRetry.value) switchError.value = "";
  },
);
async function autoSwitch() {
  if (!wallet.value || !targetChain.value || attempted) return;
  attempted = true;
  if (wallet.value.chainId !== targetChain.value) await switchNetwork();
}
async function switchNetwork() {
  const current = wallet.value;
  const chainId = targetChain.value;
  if (!current || !chainId || switching.value || current.chainId === chainId)
    return;
  const version = connectionVersion;
  switching.value = true;
  switchError.value = "";
  try {
    await current.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    });
    const actual = await current.provider.request({ method: "eth_chainId" });
    if (version !== connectionVersion) return;
    if (Number(actual) !== chainId) throw new Error(t("text_491b0f740980"));
  } catch (error) {
    if (version !== connectionVersion) return;
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? Number(error.code)
        : null;
    switchError.value =
      code === 4902
        ? t("text_39b5a58423f2", { chainId: chainId })
        : t("text_f9db67cd4997", { chainId: chainId });
  } finally {
    switching.value = false;
  }
}
onMounted(async () => {
  try {
    const config = await loadPublicInstallationConfig();
    if (config.installationStatus === "ready" && config.chainId)
      targetChain.value = config.chainId;
    else configError.value = t("text_bfb486a3682f");
    await autoSwitch();
  } catch {
    configError.value = t("text_e2858e4b8ede");
  }
});
</script>

<style lang="scss" scoped>
.user-wallet-connect {
  display: flex;
  align-items: center;
  position: relative;
}
.wallet-config-error {
  max-width: 420px;
  background: #fff7df;
  color: #735719;
  font-size: 12px;
}
.network-notice {
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  width: 260px;
  padding: 12px;
  border: 1px solid #856a27;
  border-radius: 9px;
  background: var(--user-surface);
  color: var(--user-text);
  font-size: 12px;
  line-height: 1.5;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}
.network-notice button {
  margin-top: 8px;
  border: 0;
  background: transparent;
  color: var(--user-accent);
  cursor: pointer;
}
</style>
