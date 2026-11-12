<template>
  <div class="invitation-shell">
    <header class="invitation-header">
      <router-link to="/invite" aria-label="ChainForge">
        <BrandLogo :height="36" />
      </router-link>
      <div class="invitation-header-actions">
        <q-btn
          v-if="availableUserLanguages.length > 1"
          flat
          round
          dense
          icon="language"
          aria-label="切换语言"
        >
          <q-menu>
            <q-list dense>
              <q-item
                v-for="language in availableUserLanguages"
                :key="language.locale"
                v-close-popup
                clickable
                @click="void selectLanguage(language.locale)"
              >
                <q-item-section>{{ language.name }}</q-item-section>
                <q-item-section side>{{ language.locale }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
        <WalletConnect v-if="walletKitReady" />
        <span v-else>{{ t("text_fa29a60e22c1") }}</span>
      </div>
    </header>
    <main class="invitation-content"><router-view /></main>
  </div>
</template>

<script setup lang="ts">
import { BrandLogo } from "@chainforge/brand-ui";
import WalletConnect from "../components/WalletConnect.vue";
import { provideUserPageState } from "../composables/user-page-state";

// 邀请注册独立于主站栏目导航，保留品牌、语言和钱包连接入口。
const { t, availableUserLanguages, selectLanguage, walletKitReady } =
  provideUserPageState();
</script>

<style lang="scss" scoped>
.invitation-shell {
  min-height: 100vh;
  background:
    radial-gradient(
      ellipse at 50% -15%,
      rgb(205 164 77 / 14%),
      transparent 55%
    ),
    var(--user-background);
  color: var(--user-text);
}

.invitation-header {
  display: flex;
  min-height: 76px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px clamp(18px, 5vw, 72px);
  border-bottom: 1px solid color-mix(in srgb, var(--user-text) 12%, transparent);
}

.invitation-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.invitation-content {
  width: min(100% - 32px, 900px);
  margin: 0 auto;
  padding: clamp(28px, 8vh, 80px) 0;
}
</style>
