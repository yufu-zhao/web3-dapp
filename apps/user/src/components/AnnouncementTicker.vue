<template>
  <section
    v-if="activeItem"
    class="announcement-ticker panel"
    :aria-label="t('text_d29a8a2a1b33')"
    :style="tickerStyle"
  >
    <span class="ticker-label">{{ t("text_069c0ecbf898") }}</span>
    <Transition name="ticker-flip" mode="out-in">
      <RouterLink
        :key="activeItem.id"
        class="ticker-item"
        to="/mine/announcements"
      >
        <span class="ticker-title">{{ activeItem.title }}</span>
        <span class="ticker-summary">{{ activeItem.summary }}</span>
      </RouterLink>
    </Transition>
  </section>
  <section
    v-else
    class="announcement-ticker empty-ticker panel"
    :aria-label="t('text_d29a8a2a1b33')"
    :style="tickerStyle"
  >
    <span class="ticker-label">{{ t("text_069c0ecbf898") }}</span>
    <span>{{ t("text_6d9a7758610a") }}</span>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

export interface AnnouncementSummary {
  id: string;
  title: string;
  summary: string;
  contentType?: "article" | "video";
  body?: string;
  mediaUrl?: string;
}

const props = withDefaults(
  defineProps<{
    items?: AnnouncementSummary[];
    interval?: number;
    scrollDurationMs?: number;
    itemDelayMs?: number;
    fontSizePx?: number;
  }>(),
  {
    items: () => [],
    interval: 12000,
    scrollDurationMs: 12000,
    itemDelayMs: 500,
    fontSizePx: 14,
  },
);
const activeIndex = ref(0);
const activeItem = computed(() => props.items[activeIndex.value]);
const tickerStyle = computed(() => ({
  "--ticker-scroll-duration": `${props.scrollDurationMs}ms`,
  "--ticker-font-size": `${props.fontSizePx}px`,
}));
let timer: ReturnType<typeof setInterval> | undefined;

function startTicker() {
  if (timer) clearInterval(timer);
  if (props.items.length < 2) return;
  timer = setInterval(
    () => {
      activeIndex.value = (activeIndex.value + 1) % props.items.length;
    },
    Math.max(1000, props.interval + props.itemDelayMs),
  );
}

watch(() => props.items.length, startTicker);
onMounted(startTicker);
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<style lang="scss" scoped>
.announcement-ticker {
  display: flex;
  min-height: 60px;
  align-items: center;
  gap: 18px;
  margin-top: 16px;
  padding: 12px 20px;
  overflow: hidden;
}

.ticker-label {
  flex: 0 0 auto;
  color: var(--user-accent);
  font-weight: 750;
}

.ticker-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
  overflow: hidden;
  white-space: nowrap;
  animation: ticker-scroll var(--ticker-scroll-duration, 12s) linear infinite;
}

.ticker-flip-enter-active,
.ticker-flip-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.ticker-flip-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.ticker-flip-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

.ticker-title {
  flex: 0 0 auto;
  font-size: var(--ticker-font-size, 14px);
  font-weight: 650;
}

.ticker-summary {
  min-width: 0;
  overflow: hidden;
  color: var(--user-muted-text);
  text-overflow: ellipsis;
}

.empty-ticker {
  color: var(--user-muted-text);
}

@keyframes ticker-scroll {
  0%,
  8% {
    transform: translateX(100%);
  }
  92%,
  100% {
    transform: translateX(-100%);
  }
}

@media (max-width: 760px) {
  .announcement-ticker {
    gap: 12px;
    padding: 12px 14px;
  }

  .ticker-item {
    display: block;
  }
}
</style>
