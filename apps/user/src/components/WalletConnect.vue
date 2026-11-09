<template>
  <div class="user-wallet-connect">
    <appkit-button
      v-if="walletKitReady"
      label="连接钱包"
      loadinglabel="正在连接钱包…"
      namespace="eip155"
      size="md"
      balance="hide"
    />
    <q-banner v-else dense rounded class="wallet-config-error">
      钱包连接尚未配置，请在根目录 .env 设置 WALLETCONNECT_PROJECT_ID。
    </q-banner>
  </div>
</template>

<script setup lang="ts">
import { walletKitReady } from "@chainforge/wallet-connect";
</script>

<style lang="scss" scoped>
.user-wallet-connect {
  display: flex;
  align-items: center;
}

.wallet-config-error {
  max-width: 420px;
  background: #fff7df;
  color: #735719;
  font-size: 12px;
}
</style>
