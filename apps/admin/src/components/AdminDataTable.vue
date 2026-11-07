<template>
  <section class="data-card">
    <header class="table-toolbar">
      <div class="table-heading">
        <h2>{{ title }}</h2>
        <span v-if="description">{{ description }}</span>
      </div>
      <div class="table-tools">
        <q-input
          v-model="searchText"
          outlined
          dense
          clearable
          class="quick-search"
          :placeholder="searchPlaceholder"
          aria-label="快捷搜索"
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
        <q-btn
          flat
          round
          icon="refresh"
          aria-label="刷新数据"
          :loading="loading"
          @click="$emit('refresh')"
        >
          <q-tooltip>刷新</q-tooltip>
        </q-btn>
        <q-btn
          v-if="allowCreate"
          color="primary"
          unelevated
          icon="add"
          label="新建"
          @click="$emit('create')"
        />
        <slot name="toolbar" />
      </div>
    </header>

    <q-expansion-item
      v-if="$slots.filters"
      v-model="filtersOpen"
      dense
      header-class="filter-toggle"
      icon="tune"
      label="高级搜索"
    >
      <div class="filter-content">
        <slot name="filters" :refresh="() => $emit('refresh')" />
      </div>
    </q-expansion-item>

    <q-banner v-if="error" dense rounded class="table-error">
      <template #avatar><q-icon name="error_outline" /></template>
      {{ error }}
      <template #action>
        <q-btn flat dense label="重试" @click="$emit('refresh')" />
      </template>
    </q-banner>

    <q-table
      v-model:pagination="pagination"
      class="admin-table"
      flat
      :rows="rows"
      :columns="columns"
      :row-key="rowKey"
      :loading="loading"
      :rows-per-page-options="rowsPerPageOptions"
      :hide-pagination="totalRows === 0 && !loading"
      @request="onRequest"
    >
      <template #body-cell="slotProps">
        <slot :name="`cell-${slotProps.col.name}`" v-bind="slotProps">
          <q-td :props="slotProps">{{ slotProps.value }}</q-td>
        </slot>
      </template>
      <template #body-cell-actions="slotProps">
        <slot name="actions" :row="slotProps.row">
          <div class="row-actions">
            <q-btn
              flat
              dense
              color="primary"
              icon="edit"
              aria-label="编辑"
              @click="$emit('edit', slotProps.row)"
            />
            <q-btn
              flat
              dense
              color="negative"
              icon="delete_outline"
              aria-label="删除"
              @click="$emit('delete', slotProps.row)"
            />
          </div>
        </slot>
      </template>
      <template #no-data>
        <div class="empty-state">
          <q-icon
            :name="error ? 'cloud_off' : 'inbox'"
            size="28px"
            class="q-mr-sm"
          />
          <span>{{ error ? "暂时无法读取数据" : emptyLabel }}</span>
        </div>
      </template>
    </q-table>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

export interface AdminTableColumn {
  name: string;
  label: string;
  field: string | ((row: Record<string, unknown>) => unknown);
  align?: "left" | "center" | "right";
  sortable?: boolean;
  format?: (value: unknown, row: Record<string, unknown>) => string;
}

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    rows: Record<string, unknown>[];
    columns: AdminTableColumn[];
    rowKey?: string;
    loading?: boolean;
    error?: string;
    totalRows?: number;
    page?: number;
    pageSize?: number;
    search?: string;
    searchPlaceholder?: string;
    rowsPerPageOptions?: number[];
    emptyLabel?: string;
    allowCreate?: boolean;
  }>(),
  {
    description: "",
    rowKey: "id",
    loading: false,
    error: "",
    totalRows: 0,
    page: 1,
    pageSize: 10,
    search: "",
    searchPlaceholder: "搜索名称、编码或账号",
    rowsPerPageOptions: () => [10, 20, 50],
    emptyLabel: "暂无数据",
    allowCreate: false,
  },
);

const emit = defineEmits<{
  (event: "refresh"): void;
  (event: "create"): void;
  (event: "edit", row: Record<string, unknown>): void;
  (event: "delete", row: Record<string, unknown>): void;
  (event: "search-change", value: string): void;
  (event: "page-change", value: number): void;
  (event: "page-size-change", value: number): void;
}>();

const filtersOpen = ref(false);
const searchText = ref<string | null>(props.search);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => props.search,
  (value) => {
    searchText.value = value;
  },
);

// 快捷搜索防抖，避免每敲一个字都请求服务端。
watch(searchText, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(
    // Quasar 的 clearable 输入框清空时会发出 null，统一按空搜索处理。
    () => emit("search-change", (value ?? "").trim()),
    300,
  );
});

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

const pagination = computed({
  get: () => ({
    page: props.page,
    rowsPerPage: props.pageSize,
    rowsNumber: props.totalRows,
    sortBy: null,
    descending: false,
  }),
  set: (value: { page: number; rowsPerPage: number }) => {
    if (value.page !== props.page) emit("page-change", value.page);
    if (value.rowsPerPage !== props.pageSize)
      emit("page-size-change", value.rowsPerPage);
  },
});

function onRequest(event: {
  pagination: { page: number; rowsPerPage: number };
}) {
  if (event.pagination.page !== props.page)
    emit("page-change", event.pagination.page);
  if (event.pagination.rowsPerPage !== props.pageSize)
    emit("page-size-change", event.pagination.rowsPerPage);
}
</script>

<style lang="scss" scoped>
.data-card {
  overflow: hidden;
  border: 1px solid #e3e8ef;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(23, 43, 77, 0.05);
}

.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px;
}

.table-heading h2 {
  margin: 0;
  color: #14213d;
  font-size: 17px;
  font-weight: 700;
}

.table-heading span {
  display: block;
  margin-top: 5px;
  color: #79869b;
  font-size: 12px;
}

.table-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.quick-search {
  width: min(100%, 260px);
}

.filter-toggle {
  color: #53627a;
  font-size: 13px;
}

.filter-content {
  padding: 0 22px 18px;
}

.table-error {
  margin: 0 18px 12px;
  background: #fff0f1;
  color: #a92a3c;
}

.admin-table {
  border-top: 1px solid #edf0f5;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  padding: 20px;
  color: #8994a5;
}

@media (max-width: 700px) {
  .table-toolbar {
    align-items: stretch;
    flex-direction: column;
    padding: 18px 16px;
  }

  .table-tools {
    flex-wrap: wrap;
  }

  .quick-search {
    flex: 1 1 180px;
    width: auto;
  }

  .filter-content {
    padding-inline: 16px;
  }
}
</style>
