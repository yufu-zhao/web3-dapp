<template>
  <CarouselHero :items="carouselItems" :is-mobile="isMobile" />
  <AnnouncementTicker
    :items="announcementItems"
    :scroll-duration-ms="tickerSettings.scrollDurationMs"
    :item-delay-ms="tickerSettings.itemDelayMs"
    :font-size-px="tickerSettings.fontSizePx"
  />
  <section class="identity-bar panel" aria-live="polite">
    <div>
      <span class="label">{{ t("text_dc41c0013b97") }}</span>
      <strong>{{ systemName }}</strong>
    </div>
    <div>
      <span class="label">{{ t("text_fa6de2cda687") }}</span>
      <strong>
        {{ tokenName }}
        <span class="muted">{{ tokenSymbol }}</span>
      </strong>
    </div>
    <div>
      <span class="label">{{ t("text_872428a7210d") }}</span>
      <strong>{{ chainLabel }}</strong>
    </div>
    <div class="install-status">
      <span
        :class="['status-dot', { error: configError, waiting: !identity }]"
      ></span>
      <span>{{ statusMessage }}</span>
      <button v-if="configError" class="text-button" @click="loadConfig">
        {{ t("text_b8784c8dd563") }}
      </button>
    </div>
  </section>
  <section class="section">
    <div class="section-heading">
      <div>
        <span class="eyebrow">EXPLORE</span>
        <h2>{{ t("text_b85dacc64f51") }}</h2>
        <p>{{ t("text_1e54c3a69cb6") }}</p>
      </div>
    </div>
    <div class="explore-grid">
      <router-link
        v-for="card in explore"
        :key="card.path"
        :to="card.path"
        class="explore-card panel"
      >
        <span class="icon-box"><q-icon :name="card.icon" /></span>
        <span>
          <strong>{{ card.title }}</strong>
          <small>{{ card.description }}</small>
        </span>
        <q-icon class="arrow" name="north_east" />
      </router-link>
    </div>
  </section>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { userPageStateKey } from "../composables/user-page-state";
import AnnouncementTicker from "../components/AnnouncementTicker.vue";
import CarouselHero from "../components/CarouselHero.vue";
const {
  t,
  carouselItems,
  announcementItems,
  isMobile,
  tickerSettings,
  identity,
  configError,
  loadConfig,
  systemName,
  tokenName,
  tokenSymbol,
  chainLabel,
  statusMessage,
  explore
} = inject(userPageStateKey)!;
</script>
