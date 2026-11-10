<template>
  <button
    class="wallet-connect-button"
    :class="[`wallet-connect-button--${size}`, { 'is-connected': connected }]"
    type="button"
    :disabled="disabled || connecting"
    :aria-busy="connecting"
    @click="openWalletView"
  >
    <img v-if="connected && walletInfo?.icon" class="wallet-connect-button__icon" :src="walletInfo.icon" alt="" />
    <span v-if="connecting" class="wallet-connect-button__spinner" aria-hidden="true" />
    <span>{{ buttonLabel }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAppKit, useAppKitAccount, useWalletInfo } from "@reown/appkit/vue";

const props = withDefaults(
  defineProps<{
    label?: string;
    loadingLabel?: string;
    size?: "sm" | "md" | "lg";
    disabled?: boolean;
  }>(),
  {
    label: "连接钱包",
    loadingLabel: "正在连接钱包…",
    size: "md",
    disabled: false,
  },
);

const account = useAppKitAccount({ namespace: "eip155" });
const { open } = useAppKit();
const { walletInfo } = useWalletInfo("eip155");
const connected = computed(() => account.value.isConnected && !!account.value.address);
const connecting = computed(() => account.value.status === "connecting");
const buttonLabel = computed(() => {
  if (connecting.value) return props.loadingLabel;
  if (!connected.value) return props.label;
  const address = account.value.address ?? "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
});

/** 使用 AppKit 自带的连接/账户视图，按钮外观由各前端自行主题化。 */
async function openWalletView() {
  await open({ view: connected.value ? "Account" : "Connect" });
}
</script>

<style scoped>
.wallet-connect-button {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid var(--wallet-connect-border, #d8dee8);
  border-radius: var(--wallet-connect-radius, 10px);
  background: var(--wallet-connect-background, #fff);
  color: var(--wallet-connect-color, #202c40);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}

.wallet-connect-button:hover:not(:disabled) {
  border-color: var(--wallet-connect-hover-border, #aeb9c9);
  background: var(--wallet-connect-hover-background, #f7f9fc);
}

.wallet-connect-button:focus-visible {
  outline: 2px solid var(--wallet-connect-focus, #5277d7);
  outline-offset: 2px;
}

.wallet-connect-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.wallet-connect-button--sm {
  min-height: 32px;
  padding: 0 12px;
  font-size: 12px;
}

.wallet-connect-button--lg {
  min-height: 48px;
  padding: 0 20px;
  font-size: 16px;
}

.wallet-connect-button__icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.wallet-connect-button__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: wallet-connect-spin 700ms linear infinite;
}

@keyframes wallet-connect-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
