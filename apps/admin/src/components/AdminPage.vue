<template>
  <q-page class="content-page">
    <div class="content-topline">
      <div>
        <p class="breadcrumb">管理后台 <span>/</span> {{ pageTitle }}</p>
        <h1>{{ pageTitle }}</h1>
        <div class="text-caption q-mt-sm text-grey-8">这里显示菜单的描述</div>
      </div>
    </div>
    <slot></slot>
  </q-page>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const pageTitle = computed(() =>
  typeof route.meta.title === "string" ? route.meta.title : "管理后台"
);
</script>

<style scoped lang="scss">
.content-topline {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 24px;
}
.content-topline h1 {
  margin: 0;
  color: var(--admin-text);
  font-size: clamp(24px, 3vw, 30px);
  font-weight: 400;
}
.breadcrumb {
  margin: 0 0 8px;
  color: var(--admin-muted-text);
  font-size: 12px;
}

.breadcrumb span {
  margin: 0 6px;
  color: #c3cad4;
}
</style>
