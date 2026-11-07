<template>
  <template v-for="item in items" :key="item.id">
    <q-expansion-item
      v-if="item.children?.length"
      :label="item.name"
      :icon="item.icon || 'folder'"
      dense
      expand-separator
      class="menu-branch"
    >
      <div class="nested-menu">
        <AdminMenuBranch :items="item.children" />
      </div>
    </q-expansion-item>
    <q-item
      v-else-if="item.path"
      v-ripple
      clickable
      :to="item.path"
      active-class="menu-item-active"
      class="menu-leaf"
    >
      <q-item-section avatar>
        <q-icon :name="item.icon || 'circle'" />
      </q-item-section>
      <q-item-section>{{ item.name }}</q-item-section>
    </q-item>
  </template>
</template>

<script setup lang="ts">
import type { AdminMenu } from "../services/admin-api";

defineProps<{ items: AdminMenu[] }>();
</script>

<style lang="scss" scoped>
.menu-branch,
.menu-leaf {
  color: #c3ccdb;
}

.nested-menu {
  padding-left: 14px;
}

.menu-item-active {
  border-radius: 10px;
  background: rgba(255, 200, 50, 0.14);
  color: #ffd867;
}
</style>
