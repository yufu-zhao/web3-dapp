<template>
  <div class="admin-wallet-connect">
    <appkit-button
      v-if="walletKitReady"
      label="连接钱包"
      loadinglabel="正在连接钱包…"
      namespace="eip155"
      size="md"
      balance="hide"
    />
    <q-banner v-else dense rounded class="wallet-config-error">
      钱包连接尚未配置，请检查 WALLETCONNECT_PROJECT_ID。
    </q-banner>
    <q-dialog v-model="changePending" persistent>
      <q-card class="wallet-change-card">
        <q-card-section>
          <div class="wallet-picker-title">检测到钱包账户或网络切换</div>
          <p class="wallet-change-copy">
            页面仍使用原连接信息。确认同步后才会更新当前钱包状态。
          </p>
        </q-card-section>
        <q-card-section class="wallet-change-comparison">
          <div class="wallet-change-value">
            <small>页面当前</small><strong>{{ wallet?.address }}</strong
            ><span>Chain {{ wallet?.chainId }}</span>
          </div>
          <q-icon name="arrow_downward" color="grey-6" />
          <div class="wallet-change-value wallet-change-next">
            <small>钱包检测到</small
            ><strong>{{ pendingWallet?.address }}</strong
            ><span>Chain {{ pendingWallet?.chainId }}</span>
          </div>
        </q-card-section>
        <q-banner v-if="changeError" class="wallet-error" rounded>
          {{ changeError }}
        </q-banner>
        <q-card-section class="wallet-change-copy wallet-change-hint">
          如果这是临时切换，切回页面当前显示的账户和网络后，此提示会自动关闭。
        </q-card-section>
        <q-card-actions align="right" class="wallet-change-actions">
          <q-btn
            flat
            color="grey-8"
            label="断开钱包"
            :disable="syncingWalletChange"
            @click="disconnect"
          />
          <q-btn
            color="primary"
            unelevated
            label="确认同步切换"
            :loading="syncingWalletChange"
            @click="syncWalletChange"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { toRef } from "vue";
import {
  useWalletConnection,
  walletKitReady,
  type ConnectedWallet,
} from "@chainforge/wallet-connect";

const props = withDefaults(defineProps<{ confirmChanges?: boolean }>(), {
  confirmChanges: true,
});
const emit = defineEmits<{
  connected: [wallet: ConnectedWallet];
  changed: [wallet: ConnectedWallet];
  changePending: [pending: boolean];
  disconnected: [];
}>();
const {
  wallet,
  pendingWallet,
  changePending,
  syncingWalletChange,
  changeError,
  syncWalletChange,
  disconnect,
} = useWalletConnection({
  confirmChanges: toRef(props, "confirmChanges"),
  events: {
    connected: (value) => emit("connected", value),
    changed: (value) => emit("changed", value),
    changePending: (value) => emit("changePending", value),
    disconnected: () => emit("disconnected"),
  },
});
</script>

<style lang="scss" scoped>
.admin-wallet-connect {
  display: flex;
  align-items: center;
}
.wallet-change-card {
  width: min(calc(100vw - 32px), 460px);
  border-radius: 18px;
}
.wallet-picker-title {
  color: #202c40;
  font-size: 18px;
  font-weight: 700;
}
.wallet-change-copy {
  margin: 8px 0 0;
  color: #687386;
  font-size: 13px;
  line-height: 1.6;
}
.wallet-change-comparison {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding-top: 4px;
}
.wallet-change-value {
  display: grid;
  width: 100%;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid #e3e8ef;
  border-radius: 12px;
  overflow-wrap: anywhere;
}
.wallet-change-value small {
  color: #687386;
  font-size: 11px;
}
.wallet-change-value strong {
  color: #202c40;
  font-size: 14px;
}
.wallet-change-value span {
  color: #64748b;
  font-size: 12px;
}
.wallet-change-next {
  border-color: #f4d274;
  background: #fffbeb;
}
.wallet-change-hint {
  margin: 0;
  padding-top: 8px;
}
.wallet-change-actions {
  gap: 8px;
}
.wallet-error {
  margin: 0 24px;
  background: #fff0ef;
  color: #9b302c;
}
.wallet-config-error {
  max-width: 420px;
  background: #fff7df;
  color: #735719;
  font-size: 12px;
}
</style>
