<template>
  <section v-if="activeItem" class="carousel-hero panel" :style="heroStyle">
    <RouterLink
      v-if="activeItem.linkType === 'route'"
      class="carousel-slide"
      :to="activeItem.linkTarget || '/'"
      :style="{ backgroundImage: `url('${imageUrl}')` }"
    >
      <span v-if="activeItem.title" class="carousel-title">{{
        activeItem.title
      }}</span>
    </RouterLink>
    <a
      v-else-if="activeItem.linkType === 'external'"
      class="carousel-slide"
      :href="activeItem.linkTarget || undefined"
      target="_blank"
      rel="noopener noreferrer"
      :style="{ backgroundImage: `url('${imageUrl}')` }"
    >
      <span v-if="activeItem.title" class="carousel-title">{{
        activeItem.title
      }}</span>
    </a>
    <div
      v-else
      class="carousel-slide"
      :style="{ backgroundImage: `url('${imageUrl}')` }"
    >
      <span v-if="activeItem.title" class="carousel-title">{{
        activeItem.title
      }}</span>
    </div>
  </section>
  <section
    v-else
    class="carousel-empty panel"
    :aria-label="t('text_ce515206a141')"
  >
    <span class="eyebrow">WELCOME</span>
    <h1>
      {{ t("text_39d34ebf25e0") }}<br /><em>{{ t("text_4baa5412f2b3") }}</em>
    </h1>
    <p>{{ t("text_47c9d350586d") }}</p>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

export interface CarouselItem {
  id: string;
  title?: string;
  desktopImageUrl: string;
  mobileImageUrl?: string | null;
  linkType: "route" | "external" | "none";
  linkTarget?: string | null;
  widthMode?: "default" | "full";
  desktopHeight?: number | null;
  mobileHeight?: number | null;
}

const props = withDefaults(
  defineProps<{
    items?: CarouselItem[];
    isMobile?: boolean;
  }>(),
  { items: () => [], isMobile: false },
);

const activeIndex = ref(0);
const activeItem = computed(() => props.items[activeIndex.value]);
let timer: ReturnType<typeof setInterval> | undefined;

function startCarousel() {
  if (timer) clearInterval(timer);
  activeIndex.value = 0;
  if (props.items.length < 2) return;
  timer = setInterval(() => {
    activeIndex.value = (activeIndex.value + 1) % props.items.length;
  }, 5000);
}

watch(() => props.items.length, startCarousel);
onMounted(startCarousel);
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

const imageUrl = computed(() => {
  if (!activeItem.value) return "";
  return props.isMobile
    ? activeItem.value.mobileImageUrl || activeItem.value.desktopImageUrl
    : activeItem.value.desktopImageUrl;
});
const heroStyle = computed(() => ({
  height: (
    props.isMobile
      ? activeItem.value?.mobileHeight
      : activeItem.value?.desktopHeight
  )
    ? `${props.isMobile ? activeItem.value?.mobileHeight : activeItem.value?.desktopHeight}px`
    : undefined,
  width: activeItem.value?.widthMode === "full" ? "100vw" : "100%",
  marginLeft:
    activeItem.value?.widthMode === "full" ? "calc(50% - 50vw)" : undefined,
  maxWidth: activeItem.value?.widthMode === "default" ? "1180px" : "none",
}));
</script>

<style lang="scss" scoped>
.carousel-hero,
.carousel-empty {
  min-height: 320px;
  overflow: hidden;
}

.carousel-slide {
  display: flex;
  min-height: inherit;
  height: 100%;
  align-items: end;
  padding: 36px;
  background-position: center;
  background-size: cover;
}

.carousel-title {
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(17, 24, 39, 0.72);
  color: #fff;
  font-size: 22px;
}

.carousel-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px;
  background:
    radial-gradient(
      circle at 75% 25%,
      rgba(255, 200, 50, 0.15),
      transparent 35%
    ),
    #111827;
}

.carousel-empty h1 {
  margin-top: 18px;
  font-size: clamp(36px, 4vw, 54px);
  line-height: 1.15;
}

.carousel-empty em {
  color: var(--user-accent);
  font-style: normal;
}

.carousel-empty p {
  margin-top: 14px;
  color: var(--user-muted-text);
}

@media (max-width: 760px) {
  .carousel-hero,
  .carousel-empty {
    min-height: 250px;
  }

  .carousel-empty {
    padding: 28px;
  }
}
</style>
