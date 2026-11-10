<template>
  <nav class="mobile-service-grid" :aria-label="t('text_eefb2470b9a8')">
    <RouterLink
      v-for="feature in features"
      :key="feature.key"
      :to="feature.key === 'overview' ? '/mine' : `/mine/${feature.key}`"
      class="feature-card panel"
    >
      <span class="icon-box"><q-icon :name="feature.icon" /></span>
      <span
        ><strong>{{ feature.title }}</strong></span
      >
      <q-icon class="arrow" name="chevron_right" />
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();
defineProps<{
  features: Array<{ key: string; title: string; icon: string }>;
}>();
</script>

<style lang="scss" scoped>
.mobile-service-grid {
  display: none;
}

@media (max-width: 760px) {
  .mobile-service-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
}
</style>
