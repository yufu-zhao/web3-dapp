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
  background: color-mix(
    in srgb,
    var(--admin-primary, #ffc832) 18%,
    transparent
  );
  color: var(--admin-primary, #ffd867);
}
</style>
