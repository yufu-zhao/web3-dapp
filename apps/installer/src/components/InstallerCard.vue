<template>
  <q-card flat bordered :tag="tag" class="installer-card">
    <slot />
  </q-card>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ tag?: string }>(), { tag: "section" });
</script>

<style lang="scss" scoped>
// 安装器的配置与摘要卡片共用同一组表面样式。
.installer-card {
  min-width: 0;
  border: 1px solid #e8edf2;
  border-radius: 15px;
  background: #fff;
  box-shadow: none;
}
</style>
