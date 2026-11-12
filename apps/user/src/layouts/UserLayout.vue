<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <router-link to="/" class="brand" :aria-label="t('text_d66f4359dae3')">
          <BrandLogo :height="34" />
        </router-link>
        <nav class="desktop-nav" :aria-label="t('text_9bae68040509')">
          <router-link
            v-for="item in navigation"
            :key="item.path"
            :to="item.path"
            :class="{ active: activeSection === item.path }"
          >
            {{ item.label }}
          </router-link>
        </nav>
        <div class="wallet">
          <q-btn
            v-if="availableUserLanguages.length > 1"
            flat
            round
            dense
            icon="language"
            aria-label="切换语言"
          >
            <q-menu class="language-menu">
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
      </div>
    </header>

    <main class="content">
      <router-view />
    </main>

    <nav class="mobile-nav" :aria-label="t('text_6bb29f763d65')">
      <router-link
        v-for="item in navigation"
        :key="item.path"
        :to="item.path"
        :class="{ active: activeSection === item.path }"
      >
        <q-icon :name="item.icon" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { BrandLogo } from "@chainforge/brand-ui";
import WalletConnect from "../components/WalletConnect.vue";
import { provideUserPageState } from "../composables/user-page-state";

// 路由布局负责共享导航与页面状态，子页面只关注各自内容。
const {
  t,
  navigation,
  activeSection,
  availableUserLanguages,
  selectLanguage,
  walletKitReady
} = provideUserPageState();
</script>
