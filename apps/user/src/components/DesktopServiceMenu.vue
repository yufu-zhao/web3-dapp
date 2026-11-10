<template>
  <nav class="service-menu panel" :aria-label="t('text_eefb2470b9a8')">
    <RouterLink
      v-for="feature in features"
      :key="feature.key"
      :to="feature.key === 'overview' ? '/mine' : `/mine/${feature.key}`"
      :class="{ selected: activeKey === feature.key }"
    >
      <q-icon :name="feature.icon" />
      <span>{{ feature.title }}</span>
      <q-icon name="chevron_right" class="service-arrow" />
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();
defineProps<{
  features: Array<{ key: string; title: string; icon: string }>;
  activeKey: string;
}>();
</script>

<style lang="scss" scoped>
.service-menu {
  display: grid;
  gap: 4px;
  padding: 10px;
}

.service-menu a {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 9px;
  color: var(--user-muted-text);
  font-size: 13px;
}

.service-menu a.selected,
.service-menu a:hover {
  background: rgba(255, 200, 50, 0.1);
  color: var(--user-accent);
}

.service-arrow {
  margin-left: auto;
}
</style>
