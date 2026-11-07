<template>
  <section class="workspace-section">
    <q-banner v-if="successMessage" rounded class="success-banner">
      <template #avatar><q-icon name="check_circle" /></template
      >{{ successMessage }}
    </q-banner>
    <q-banner v-if="optionsError" rounded class="warning-banner">
      <template #avatar><q-icon name="info_outline" /></template
      >{{ optionsError }}
    </q-banner>
    <AdminDataTable
      title="系统菜单"
      description="维护侧栏导航的层级、路由和显示状态。"
      :rows="state.rows"
      :columns="columns"
      :loading="state.loading"
      :error="state.error"
      :total-rows="state.total"
      :page="state.page"
      :page-size="state.pageSize"
      :search="state.search"
      :allow-create="canWrite"
      :empty-label="state.search ? '没有匹配的菜单' : '暂无系统菜单'"
      @refresh="refresh"
      @create="openCreate"
      @search-change="setSearch"
      @page-change="setPage"
      @page-size-change="setPageSize"
    >
      <template #filters>
        <div class="filter-row">
          <q-select
            v-model="activeFilter"
            outlined
            dense
            clearable
            emit-value
            map-options
            label="启用状态"
            :options="statusOptions"
          />
          <q-select
            v-model="visibleFilter"
            outlined
            dense
            clearable
            emit-value
            map-options
            label="导航显示"
            :options="statusOptions"
          />
          <q-select
            v-model="parentFilter"
            outlined
            dense
            clearable
            emit-value
            map-options
            label="父级菜单"
            :options="parentOptions"
          />
          <q-btn
            color="primary"
            unelevated
            label="应用筛选"
            @click="applyFilters"
          />
          <q-btn flat label="清除" @click="resetFilters" />
        </div>
      </template>
      <template #actions="{ row }">
        <div v-if="canWrite" class="row-actions">
          <q-btn
            flat
            dense
            color="primary"
            icon="edit"
            aria-label="编辑菜单"
            @click="openEdit(row as unknown as AdminMenu)"
          />
          <q-btn
            flat
            dense
            color="negative"
            icon="delete_outline"
            aria-label="删除菜单"
            @click="confirmDelete(row as unknown as AdminMenu)"
          />
        </div>
        <span v-else class="readonly-label">只读</span>
      </template>
    </AdminDataTable>

    <q-dialog v-model="formOpen" persistent>
      <q-card class="form-dialog">
        <q-form @submit.prevent="saveMenu">
          <q-card-section class="dialog-heading">
            <div>
              <p class="dialog-kicker">NAVIGATION MENU</p>
              <h2>{{ editingId ? "编辑系统菜单" : "新建系统菜单" }}</h2>
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
              label="菜单名称"
              maxlength="128"
              :rules="[(value) => Boolean(value) || '请输入菜单名称']"
            />
            <q-input
              v-model.trim="form.code"
              outlined
              dense
              label="菜单编码"
              maxlength="96"
              :rules="[
                (value) =>
                  /^[a-z][a-z0-9-]{1,95}$/.test(value) ||
                  '使用小写字母、数字和连字符',
              ]"
            />
            <q-select
              v-model="form.parentId"
              outlined
              dense
              clearable
              emit-value
              map-options
              label="父级菜单"
              :options="parentOptions"
              hint="不选择父级时作为一级菜单显示"
            />
            <q-input
              v-model.trim="form.path"
              outlined
              dense
              label="路由路径"
              placeholder="例如 /roles；一级分组可留空"
              maxlength="255"
            />
            <div class="form-row">
              <q-input
                v-model.trim="form.icon"
                outlined
                dense
                label="图标名称"
                placeholder="例如 settings"
                maxlength="96"
              />
              <q-input
                v-model.number="form.sortOrder"
                outlined
                dense
                type="number"
                label="排序值"
                min="0"
              />
            </div>
            <div class="toggle-row">
              <q-toggle
                v-model="form.isVisible"
                color="primary"
                label="在导航显示"
              />
              <q-toggle
                v-model="form.isActive"
                color="positive"
                label="启用菜单"
              />
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
              text-color="dark"
              unelevated
              type="submit"
              label="保存"
              :loading="saving"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>

    <q-dialog v-model="deleteOpen" persistent>
      <q-card class="confirm-dialog">
        <q-card-section>
          <q-icon name="warning_amber" color="negative" size="28px" />
          <h2>删除菜单？</h2>
          <p>
            将删除「{{
              selectedMenu?.name
            }}」。若菜单仍有子级或被系统使用，服务端会阻止删除。
          </p>
          <q-banner v-if="deleteError" rounded class="dialog-error">
            {{ deleteError }}
          </q-banner>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            flat
            label="取消"
            :disable="deleting"
            @click="deleteOpen = false"
          />
          <q-btn
            color="negative"
            unelevated
            label="确认删除"
            :loading="deleting"
            @click="deleteMenu"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AdminDataTable, {
  type AdminTableColumn,
} from "../components/AdminDataTable.vue";
import {
  createRecord,
  deleteRecord,
  getPage,
  updateRecord,
  type AdminMenu,
} from "../services/admin-api";
import { useAdminPage } from "../services/use-admin-page";
import { canAccess } from "../services/admin-session";

const { state, load, setSearch, setPage, setPageSize } =
  useAdminPage<AdminMenu>("menus");
const canWrite = computed(() => canAccess("menus:write"));
const parentOptions = ref<Array<{ label: string; value: string }>>([]);
const optionsError = ref("");
const successMessage = ref("");
const formOpen = ref(false);
const deleteOpen = ref(false);
const saving = ref(false);
const deleting = ref(false);
const editingId = ref<string | null>(null);
const selectedMenu = ref<AdminMenu | null>(null);
const formError = ref("");
const deleteError = ref("");
const activeFilter = ref<boolean | null>(null);
const visibleFilter = ref<boolean | null>(null);
const parentFilter = ref<string | null>(null);
const statusOptions = [
  { label: "是", value: true },
  { label: "否", value: false },
];
const form = ref({
  code: "",
  name: "",
  path: "",
  icon: "folder",
  parentId: null as string | null,
  sortOrder: 10,
  isVisible: true,
  isActive: true,
});

const columns: AdminTableColumn[] = [
  { name: "name", label: "菜单名称", field: "name", align: "left" },
  { name: "code", label: "菜单编码", field: "code" },
  {
    name: "parentId",
    label: "层级",
    field: (row) => (row.parentId ? "二级菜单" : "一级菜单"),
  },
  { name: "path", label: "路由路径", field: "path" },
  { name: "sortOrder", label: "排序", field: "sortOrder", align: "right" },
  {
    name: "isVisible",
    label: "导航显示",
    field: "isVisible",
    format: (value) => (value ? "显示" : "隐藏"),
  },
  {
    name: "isActive",
    label: "状态",
    field: "isActive",
    format: (value) => (value ? "启用" : "停用"),
  },
  { name: "actions", label: "操作", field: "id", align: "right" },
];

async function loadParentOptions() {
  optionsError.value = "";
  try {
    const result = await getPage<AdminMenu>("menus", 1, 100, "");
    parentOptions.value = result.items
      .filter((menu) => !menu.parentId && menu.id !== editingId.value)
      .map((menu) => ({ label: menu.name, value: menu.id }));
  } catch (error) {
    optionsError.value =
      error instanceof Error ? error.message : "无法读取父级菜单选项。";
  }
}

async function refresh() {
  await Promise.all([load(), loadParentOptions()]);
}

function applyFilters() {
  state.filters = {};
  if (activeFilter.value !== null) state.filters.isActive = activeFilter.value;
  if (visibleFilter.value !== null)
    state.filters.isVisible = visibleFilter.value;
  if (parentFilter.value) state.filters.parentId = parentFilter.value;
  state.page = 1;
  void load();
}

function resetFilters() {
  activeFilter.value = null;
  visibleFilter.value = null;
  parentFilter.value = null;
  state.filters = {};
  state.page = 1;
  void load();
}

function openCreate() {
  editingId.value = null;
  form.value = {
    code: "",
    name: "",
    path: "",
    icon: "folder",
    parentId: null,
    sortOrder: 10,
    isVisible: true,
    isActive: true,
  };
  formError.value = "";
  successMessage.value = "";
  void loadParentOptions();
  formOpen.value = true;
}

function openEdit(menu: AdminMenu) {
  editingId.value = menu.id;
  form.value = {
    code: menu.code,
    name: menu.name,
    path: menu.path,
    icon: menu.icon,
    parentId: menu.parentId,
    sortOrder: menu.sortOrder,
    isVisible: menu.isVisible,
    isActive: menu.isActive,
  };
  formError.value = "";
  successMessage.value = "";
  void loadParentOptions();
  formOpen.value = true;
}

async function saveMenu() {
  if (!canWrite.value) return;
  saving.value = true;
  formError.value = "";
  successMessage.value = "";
  try {
    const payload = {
      ...form.value,
      code: form.value.code.trim(),
      name: form.value.name.trim(),
      path: form.value.path.trim(),
      icon: form.value.icon.trim(),
    };
    if (editingId.value) {
      await updateRecord("menus", editingId.value, payload);
      successMessage.value = "菜单信息已保存。";
    } else {
      await createRecord("menus", payload);
      successMessage.value = "菜单已创建。";
    }
    formOpen.value = false;
    await refresh();
  } catch (error) {
    formError.value = error instanceof Error ? error.message : "保存菜单失败。";
  } finally {
    saving.value = false;
  }
}

function confirmDelete(menu: AdminMenu) {
  selectedMenu.value = menu;
  deleteError.value = "";
  deleteOpen.value = true;
}

async function deleteMenu() {
  if (!canWrite.value || !selectedMenu.value) return;
  deleting.value = true;
  deleteError.value = "";
  try {
    await deleteRecord("menus", selectedMenu.value.id);
    deleteOpen.value = false;
    successMessage.value = "菜单已删除。";
    await refresh();
  } catch (error) {
    deleteError.value =
      error instanceof Error ? error.message : "删除菜单失败。";
  } finally {
    deleting.value = false;
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

.warning-banner {
  background: #fff8df;
  color: #785c0d;
}

.filter-row,
.form-row,
.toggle-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.filter-row > * {
  min-width: 135px;
}

.form-row > * {
  flex: 1 1 150px;
}

.toggle-row {
  justify-content: space-between;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.readonly-label {
  color: #9ba5b5;
  font-size: 11px;
}

.form-dialog,
.confirm-dialog {
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

.dialog-heading h2,
.confirm-dialog h2 {
  margin: 0;
  color: #17243b;
  font-size: 20px;
}

.dialog-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dialog-error {
  background: #fff0f1;
  color: #a92a3c;
}

.confirm-dialog h2 {
  margin-top: 12px;
}

.confirm-dialog p {
  color: #758198;
  line-height: 1.7;
}

@media (max-width: 600px) {
  .filter-row > * {
    flex: 1 1 100%;
    min-width: 0;
  }
}
</style>
