<template>
  <section class="workspace-section">
    <q-banner v-if="successMessage" rounded class="success-banner">
      <template #avatar><q-icon name="check_circle" /></template>
      {{ successMessage }}
    </q-banner>

    <section class="data-card">
      <header class="table-toolbar">
        <div class="table-heading">
          <h2>权限菜单</h2>
          <span>{{ description }}</span>
        </div>
        <div class="table-tools">
          <q-input
            v-model="searchText"
            outlined
            dense
            clearable
            class="quick-search"
            placeholder="搜索名称、编码或路由"
            aria-label="搜索权限菜单"
          >
            <template #prepend><q-icon name="search" /></template>
          </q-input>
          <q-btn
            flat
            round
            icon="refresh"
            aria-label="刷新权限菜单"
            :loading="loading"
            @click="refresh"
          >
            <q-tooltip>刷新</q-tooltip>
          </q-btn>
        </div>
      </header>

      <q-banner v-if="error" dense rounded class="table-error">
        <template #avatar><q-icon name="error_outline" /></template>
        {{ error }}
        <template #action>
          <q-btn flat dense label="重试" @click="refresh" />
        </template>
      </q-banner>

      <q-table
        class="admin-table permission-menu-table"
        flat
        row-key="id"
        :rows="visibleRows"
        :columns="columns"
        :loading="loading"
        :pagination="{ rowsPerPage: 0 }"
        :rows-per-page-options="[0]"
        hide-bottom
      >
        <template #body-cell-name="slotProps">
          <q-td :props="slotProps">
            <div
              class="menu-name-cell"
              :style="{ paddingLeft: `${slotProps.row.depth * 22}px` }"
            >
              <button
                v-if="slotProps.row.hasChildren"
                type="button"
                class="tree-toggle"
                :aria-label="
                  expandedIds.has(slotProps.row.id) ? '折叠目录' : '展开目录'
                "
                @click="toggleExpanded(slotProps.row.id)"
              >
                <q-icon
                  :name="
                    expandedIds.has(slotProps.row.id)
                      ? 'expand_more'
                      : 'chevron_right'
                  "
                  size="18px"
                />
              </button>
              <span v-else class="tree-spacer" />
              <q-icon
                :name="typeIcon(slotProps.row.type)"
                class="menu-type-icon"
              />
              <span class="menu-name">{{ slotProps.row.name }}</span>
            </div>
          </q-td>
        </template>
        <template #body-cell-type="slotProps">
          <q-td :props="slotProps">
            <span class="type-badge" :class="`type-${slotProps.row.type}`">
              {{ typeLabel(slotProps.row.type) }}
            </span>
          </q-td>
        </template>
        <template #body-cell-permissionCode="slotProps">
          <q-td :props="slotProps">
            <code v-if="slotProps.row.permissionCode">{{
              slotProps.row.permissionCode
            }}</code>
            <span v-else class="muted-value">—</span>
          </q-td>
        </template>
        <template #body-cell-path="slotProps">
          <q-td :props="slotProps">
            <code v-if="slotProps.row.path">{{ slotProps.row.path }}</code>
            <span v-else class="muted-value">—</span>
          </q-td>
        </template>
        <template #body-cell-status="slotProps">
          <q-td :props="slotProps">
            <span v-if="isButtonRow(slotProps.row)">授权项</span>
            <span
              v-else
              class="status-label"
              :class="slotProps.row.isActive ? 'is-active' : 'is-inactive'"
            >
              {{ slotProps.row.isActive ? "启用" : "停用" }}
              <span v-if="!slotProps.row.isVisible">· 导航隐藏</span>
            </span>
          </q-td>
        </template>
        <template #body-cell-actions="slotProps">
          <q-td :props="slotProps" class="text-right">
            <q-btn
              v-if="slotProps.row.type !== 'button' && canUpdate"
              flat
              dense
              color="primary"
              icon="edit"
              aria-label="编辑菜单项"
              @click="openEdit(slotProps.row)"
            />
            <span v-else class="muted-value">
              {{ slotProps.row.type === "button" ? "不可编辑" : "只读" }}
            </span>
          </q-td>
        </template>
        <template #no-data>
          <div class="empty-state">
            <q-icon
              :name="error ? 'cloud_off' : 'inbox'"
              size="28px"
              class="q-mr-sm"
            />
            <span>{{
              error
                ? "暂时无法读取权限菜单"
                : searchText
                  ? "没有匹配的权限菜单"
                  : "暂无权限菜单"
            }}</span>
          </div>
        </template>
      </q-table>
    </section>

    <q-dialog v-model="formOpen" persistent>
      <q-card class="form-dialog">
        <q-form @submit.prevent="saveMenu">
          <q-card-section class="dialog-heading">
            <div>
              <p class="dialog-kicker">PERMISSION MENU</p>
              <h2>
                编辑{{
                  editingMenu?.type === "directory" ? "菜单目录" : "页面菜单"
                }}
              </h2>
            </div>
            <q-btn
              flat
              round
              dense
              icon="close"
              aria-label="关闭"
              @click="formOpen = false"
            />
          </q-card-section>
          <q-card-section class="dialog-fields">
            <q-input
              v-model.trim="form.name"
              outlined
              dense
              label="名称"
              maxlength="128"
              :rules="[(value) => Boolean(value) || '请输入名称']"
            />
            <q-select
              v-model="form.parentId"
              outlined
              dense
              clearable
              emit-value
              map-options
              label="上级目录"
              :options="parentOptions"
              hint="留空时作为顶层节点显示"
            />
            <q-input
              v-if="editingMenu?.type === 'menu'"
              v-model.trim="form.path"
              outlined
              dense
              label="路由路径"
              placeholder="例如 /roles"
              maxlength="255"
            />
            <IconPicker v-model="form.icon" />
            <q-input
              v-model.number="form.sortOrder"
              outlined
              dense
              type="number"
              label="排序值"
              min="0"
            />
            <div class="toggle-row">
              <q-toggle
                v-model="form.isVisible"
                color="primary"
                label="在导航显示"
              />
              <q-toggle v-model="form.isActive" color="positive" label="启用" />
            </div>
            <q-banner v-if="formError" rounded class="dialog-error">
              {{ formError }}
            </q-banner>
          </q-card-section>
          <q-card-actions align="right" class="dialog-actions">
            <q-btn
              flat
              label="取消"
              :disable="saving"
              @click="formOpen = false"
            />
            <q-btn
              color="primary"
              unelevated
              type="submit"
              label="保存"
              :loading="saving"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { QTableColumn } from "quasar";
import IconPicker from "../components/IconPicker.vue";
import { getPage, updateRecord, type AdminMenu } from "../services/admin-api";
import { canAccess } from "../services/admin-session";

defineOptions({ name: "MenusPage" });

interface PermissionMenuRow extends AdminMenu {
  depth: number;
  hasChildren: boolean;
}

const canUpdate = computed(() => canAccess("menus:update"));
const description = "菜单目录、页面和操作权限由系统维护，支持调整层级。";
const items = ref<AdminMenu[]>([]);
const expandedIds = ref(new Set<string>());
const searchText = ref("");
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const successMessage = ref("");
const formError = ref("");
const formOpen = ref(false);
const editingMenu = ref<AdminMenu | null>(null);
const parentOptions = ref<Array<{ label: string; value: string }>>([]);
const form = ref({
  name: "",
  path: "",
  icon: "",
  parentId: null as string | null,
  sortOrder: 0,
  isVisible: true,
  isActive: true,
});

const columns: QTableColumn[] = [
  { name: "name", label: "名称", field: "name", align: "left" },
  { name: "type", label: "类型", field: "type", align: "left" },
  {
    name: "permissionCode",
    label: "权限编码",
    field: "permissionCode",
    align: "left",
  },
  { name: "path", label: "路由", field: "path", align: "left" },
  { name: "status", label: "状态", field: "isActive", align: "left" },
  { name: "actions", label: "操作", field: "id", align: "right" },
];

const visibleRows = computed(() => {
  const byParent = new Map<string | null, AdminMenu[]>();
  for (const item of items.value) {
    const siblings = byParent.get(item.parentId) ?? [];
    siblings.push(item);
    byParent.set(item.parentId, siblings);
  }
  const query = searchText.value.trim().toLocaleLowerCase();
  const rows: PermissionMenuRow[] = [];

  // 搜索时保留匹配项的祖先路径，并展开命中分支，方便辨认权限所属页面。
  const visit = (
    node: AdminMenu,
    depth: number,
    forceInclude = false,
  ): boolean => {
    const children = byParent.get(node.id) ?? [];
    const selfMatches = matchesSearch(node, query);
    const childMatches = children.filter((child) =>
      visitMatches(child, byParent, query),
    );
    const matches =
      !query || forceInclude || selfMatches || childMatches.length > 0;
    if (!matches) return false;
    rows.push({ ...node, depth, hasChildren: children.length > 0 });
    if (!query && !expandedIds.value.has(node.id)) return true;
    const descendants =
      query && !forceInclude && !selfMatches ? childMatches : children;
    for (const child of descendants) {
      visit(child, depth + 1, forceInclude || selfMatches);
    }
    return true;
  };
  for (const root of byParent.get(null) ?? []) visit(root, 0);
  return rows;
});

function matchesSearch(menu: AdminMenu, query: string) {
  if (!query) return true;
  return [menu.name, menu.code, menu.path, menu.permissionCode ?? ""].some(
    (value) => value.toLocaleLowerCase().includes(query),
  );
}

function visitMatches(
  menu: AdminMenu,
  byParent: Map<string | null, AdminMenu[]>,
  query: string,
): boolean {
  return (
    matchesSearch(menu, query) ||
    (byParent.get(menu.id) ?? []).some((child) =>
      visitMatches(child, byParent, query),
    )
  );
}

function typeLabel(type: AdminMenu["type"]) {
  return { directory: "菜单目录", menu: "页面菜单", button: "页面按钮" }[type];
}

function typeIcon(type: AdminMenu["type"]) {
  return { directory: "folder", menu: "web", button: "lock_outline" }[type];
}

function isButtonRow(row: PermissionMenuRow) {
  return row.type === "button";
}

function toggleExpanded(id: string) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const result = await getPage<AdminMenu>("menus", 1, 100, "");
    items.value = result.items;
    expandedIds.value = new Set(
      result.items
        .filter((item) =>
          result.items.some((child) => child.parentId === item.id),
        )
        .map((item) => item.id),
    );
  } catch (reason) {
    error.value =
      reason instanceof Error ? reason.message : "无法读取权限菜单。";
  } finally {
    loading.value = false;
  }
}

function openEdit(menu: AdminMenu) {
  if (menu.type === "button" || !canUpdate.value) return;
  editingMenu.value = menu;
  form.value = {
    name: menu.name,
    path: menu.path,
    icon: menu.icon,
    parentId: menu.parentId,
    sortOrder: menu.sortOrder,
    isVisible: menu.isVisible,
    isActive: menu.isActive,
  };
  const descendantIds = new Set<string>();
  const addDescendants = (parentId: string) => {
    for (const child of items.value.filter(
      (item) => item.parentId === parentId,
    )) {
      descendantIds.add(child.id);
      addDescendants(child.id);
    }
  };
  addDescendants(menu.id);
  parentOptions.value = items.value
    .filter(
      (item) =>
        item.type === "directory" &&
        item.id !== menu.id &&
        !descendantIds.has(item.id),
    )
    .map((item) => ({ label: item.name, value: item.id }));
  formError.value = "";
  successMessage.value = "";
  formOpen.value = true;
}

async function saveMenu() {
  if (!canUpdate.value || !editingMenu.value) return;
  saving.value = true;
  formError.value = "";
  successMessage.value = "";
  try {
    await updateRecord("menus", editingMenu.value.id, {
      ...form.value,
      name: form.value.name.trim(),
      path: form.value.path.trim(),
      icon: form.value.icon.trim(),
    });
    formOpen.value = false;
    successMessage.value = "权限菜单已保存。";
    await refresh();
  } catch (reason) {
    formError.value =
      reason instanceof Error ? reason.message : "保存权限菜单失败。";
  } finally {
    saving.value = false;
  }
}

onMounted(() => void refresh());
</script>

<style lang="scss" scoped>
.workspace-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.success-banner {
  background: #e9fbf3;
  color: #13734b;
}

.data-card {
  overflow: hidden;
  border: 1px solid #e7ecf3;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 12px 36px rgb(33 49 77 / 5%);
}

.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
}

.table-heading {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.table-heading h2 {
  margin: 0;
  color: #1e2b42;
  font-size: 16px;
}

.table-heading span,
.muted-value {
  color: #8995a7;
  font-size: 11px;
}

.table-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quick-search {
  width: min(300px, 35vw);
}

.menu-name-cell {
  display: flex;
  min-height: 36px;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}

.tree-toggle,
.tree-spacer {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
}

.tree-toggle {
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #738096;
  cursor: pointer;
}

.tree-toggle:hover {
  background: #eef2f7;
  color: #26344b;
}

.menu-type-icon {
  color: #77869b;
  font-size: 17px;
}

.menu-name {
  color: #26344b;
  font-size: 12px;
  font-weight: 600;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 5px;
  padding: 4px 7px;
  font-size: 10px;
  white-space: nowrap;
}

.type-directory {
  background: #eef2f9;
  color: #4d607a;
}

.type-menu {
  background: #edf6ff;
  color: #326b9d;
}

.type-button {
  background: #f2f0ff;
  color: #6955a6;
}

code {
  color: #66758c;
  font-size: 10px;
}

.status-label {
  font-size: 11px;
}

.is-active {
  color: #18835e;
}

.is-inactive {
  color: #aa5360;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 32px 16px;
  color: #8b97a8;
  font-size: 12px;
}

.form-dialog {
  width: min(100vw - 32px, 560px);
  max-width: 560px;
  border-radius: 18px;
}

.dialog-heading {
  display: flex;
  justify-content: space-between;
}

.dialog-kicker {
  margin: 0 0 6px;
  color: #919db0;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.dialog-heading h2 {
  margin: 0;
  color: #17243b;
  font-size: 20px;
}

.dialog-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toggle-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
}

.dialog-error,
.table-error {
  background: #fff0f1;
  color: #a92a3c;
}

@media (max-width: 700px) {
  .table-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .table-tools,
  .quick-search {
    width: 100%;
  }

  .permission-menu-table {
    overflow-x: auto;
  }
}
</style>
