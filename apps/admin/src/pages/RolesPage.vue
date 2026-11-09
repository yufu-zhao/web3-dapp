<template>
  <section class="workspace-section">
    <q-banner v-if="successMessage" rounded class="success-banner">
      <template #avatar><q-icon name="check_circle" /></template>
      {{ successMessage }}
    </q-banner>
    <q-banner v-if="permissionError" rounded class="warning-banner">
      <template #avatar><q-icon name="info_outline" /></template>
      {{ permissionError }}
    </q-banner>
    <AdminDataTable
      title="角色与权限"
      description="为管理员账号分配可访问的管理模块。"
      :rows="state.rows"
      :columns="columns"
      :loading="state.loading"
      :error="state.error"
      :total-rows="state.total"
      :page="state.page"
      :page-size="state.pageSize"
      :search="state.search"
      :allow-create="canCreate"
      :empty-label="
        state.search ? '没有匹配的角色' : '暂无角色，请新建一个角色'
      "
      @refresh="load"
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
            label="角色状态"
            :options="statusOptions"
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
        <div v-if="canUpdate || canDelete" class="row-actions">
          <q-btn
            v-if="canUpdate"
            flat
            dense
            color="primary"
            icon="edit"
            aria-label="编辑角色"
            @click="openEdit(row as unknown as AdminRole)"
          />
          <q-btn
            v-if="canDelete"
            flat
            dense
            color="negative"
            icon="delete_outline"
            aria-label="删除角色"
            :disable="(row as unknown as AdminRole).code === 'super_admin'"
            @click="confirmDelete(row as unknown as AdminRole)"
          />
        </div>
        <span v-else class="readonly-label">只读</span>
      </template>
    </AdminDataTable>

    <q-dialog v-model="formOpen" persistent>
      <q-card class="form-dialog">
        <q-form class="dialog-form" @submit.prevent="saveRole">
          <q-card-section class="dialog-heading">
            <div>
              <p class="dialog-kicker">ROLE PERMISSIONS</p>
              <h2>{{ editingId ? "编辑角色" : "新建角色" }}</h2>
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
              v-model.trim="form.code"
              outlined
              dense
              label="角色编码"
              maxlength="64"
              :disable="form.code === 'super_admin'"
              :rules="[
                (value) =>
                  /^[a-z][a-z0-9_-]{1,63}$/.test(value) ||
                  '使用小写字母、数字、下划线或连字符',
              ]"
            />
            <q-input
              v-model.trim="form.name"
              outlined
              dense
              label="角色名称"
              maxlength="128"
              :disable="form.code === 'super_admin'"
              :rules="[(value) => Boolean(value) || '请输入角色名称']"
            />
            <q-input
              v-model.trim="form.description"
              outlined
              dense
              type="textarea"
              autogrow
              label="说明"
              maxlength="500"
              :disable="form.code === 'super_admin'"
            />
            <div class="permissions-section">
              <div class="permissions-heading">
                <strong>模块权限</strong>
                <span>{{ form.permissions.length }} 项已选择</span>
              </div>
              <q-banner
                v-if="form.code === 'super_admin'"
                dense
                rounded
                class="super-admin-note"
              >
                超级管理员保留全部权限，不能通过此表单更改。
              </q-banner>
              <q-tree
                v-model:ticked="form.permissions"
                :nodes="treeNodes"
                node-key="key"
                tick-strategy="strict"
                default-expand-all
                color="primary"
                no-nodes-label="暂无权限"
              />
            </div>
            <q-toggle
              v-model="form.isActive"
              color="positive"
              label="启用角色"
              :disable="form.code === 'super_admin'"
            />
            <q-banner v-if="formError" rounded class="dialog-error">
              {{ formError }}
            </q-banner>
          </q-card-section>
          <q-card-section class="dialog-actions">
            <q-btn
              v-if="form.code !== 'super_admin'"
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
          </q-card-section>
        </q-form>
      </q-card>
    </q-dialog>

    <q-dialog v-model="deleteOpen" persistent>
      <q-card class="confirm-dialog">
        <q-card-section>
          <q-icon name="warning_amber" color="negative" size="28px" />
          <h2>删除角色？</h2>
          <p>
            将删除角色「{{
              selectedRole?.name
            }}」。若仍有管理员使用此角色，系统会阻止删除。
          </p>
          <q-banner v-if="deleteError" rounded class="dialog-error">
            {{ deleteError }}
          </q-banner>
        </q-card-section>
        <q-card-section class="dialog-actions">
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
            @click="deleteRole"
          />
        </q-card-section>
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
  getPermissionTree,
  createRecord,
  deleteRecord,
  updateRecord,
  type AdminMenu,
  type AdminRole,
} from "../services/admin-api";
import { useAdminPage } from "../services/use-admin-page";
import { adminSession, canAccess } from "../services/admin-session";

defineOptions({ name: "RolesPage" });

const { state, load, setSearch, setPage, setPageSize } =
  useAdminPage<AdminRole>("roles");
const canCreate = computed(
  () => canAccess("roles:create") && permissionTreeLoaded.value,
);
const canUpdate = computed(
  () => canAccess("roles:update") && permissionTreeLoaded.value,
);
const canDelete = computed(() => canAccess("roles:delete"));
const successMessage = ref("");
const formOpen = ref(false);
const deleteOpen = ref(false);
const saving = ref(false);
const deleting = ref(false);
const editingId = ref<string | null>(null);
const selectedRole = ref<AdminRole | null>(null);
const formError = ref("");
const deleteError = ref("");
const permissionError = ref("");
const permissionTreeLoaded = ref(false);
const permissionTree = ref<AdminMenu[]>([]);
const activeFilter = ref<boolean | null>(null);
const statusOptions = [
  { label: "已启用", value: true },
  { label: "已停用", value: false },
];
const form = ref({
  code: "",
  name: "",
  description: "",
  permissions: [] as string[],
  isActive: true,
});
const permissionOptions = computed(() => {
  const options: Array<{ value: string; label: string; depth: number }> = [];
  const visit = (nodes: AdminMenu[], depth: number) => {
    for (const node of nodes) {
      if (node.permissionCode) {
        const kind = node.type === "button" ? "操作" : "访问页面";
        options.push({
          value: node.permissionCode,
          label: `${kind}：${node.name}`,
          depth,
        });
      }
      visit(node.children ?? [], depth + 1);
    }
  };
  visit(permissionTree.value, 0);
  return options;
});

// 保留不可授权的既有权限，避免编辑其他字段时意外移除。
const treeNodes = computed(() => {
  const own = adminSession.user?.permissions ?? [];
  const build = (nodes: AdminMenu[]): object[] =>
    nodes.map((node) => {
      const allowed =
        node.permissionCode &&
        (own.includes("*") || own.includes(node.permissionCode));
      return {
        key: node.permissionCode ?? `directory:${node.id}`,
        label:
          node.name +
          (node.permissionCode && !allowed ? "（超出自身权限）" : ""),
        icon: node.type === "button" ? "lock_outline" : node.icon || "folder",
        tickable: Boolean(
          node.permissionCode && (allowed || form.value.code === "super_admin"),
        ),
        disabled: form.value.code === "super_admin",
        children: build(node.children ?? []),
      };
    });
  return build(permissionTree.value);
});

const columns: AdminTableColumn[] = [
  { name: "name", label: "角色名称", field: "name", align: "left" },
  { name: "code", label: "角色编码", field: "code" },
  {
    name: "permissions",
    label: "权限范围",
    field: "permissions",
    format: (value) => {
      const permissions = Array.isArray(value) ? value : [];
      if (permissions.includes("*")) return "全部权限";
      return `${permissions.length} 项权限`;
    },
  },
  {
    name: "isActive",
    label: "状态",
    field: "isActive",
    format: (value) => (value ? "启用" : "停用"),
  },
  { name: "createdAt", label: "创建时间", field: "createdAt" },
  { name: "actions", label: "操作", field: "id", align: "right" },
];

function applyFilters() {
  state.filters =
    activeFilter.value === null ? {} : { isActive: activeFilter.value };
  state.page = 1;
  void load();
}

function resetFilters() {
  activeFilter.value = null;
  state.filters = {};
  state.page = 1;
  void load();
}

function openCreate() {
  if (!canCreate.value || !permissionTreeLoaded.value) return;
  editingId.value = null;
  form.value = {
    code: "",
    name: "",
    description: "",
    permissions: [],
    isActive: true,
  };
  formError.value = "";
  successMessage.value = "";
  formOpen.value = true;
}

function openEdit(role: AdminRole) {
  editingId.value = role.id;
  form.value = {
    code: role.code,
    name: role.name,
    description: role.description,
    permissions: role.permissions.includes("*")
      ? permissionOptions.value.map((item) => item.value)
      : [...role.permissions],
    isActive: role.isActive,
  };
  formError.value = "";
  successMessage.value = "";
  formOpen.value = true;
}

async function saveRole() {
  const canSave = editingId.value ? canAccess("roles:update") : canCreate.value;
  if (!canSave || !permissionTreeLoaded.value) return;
  saving.value = true;
  formError.value = "";
  successMessage.value = "";
  try {
    const payload = {
      ...form.value,
      permissions:
        form.value.code === "super_admin" ? ["*"] : form.value.permissions,
    };
    if (editingId.value) {
      await updateRecord("roles", editingId.value, payload);
      successMessage.value = "角色信息已保存。";
    } else {
      await createRecord("roles", payload);
      successMessage.value = "角色已创建。";
    }
    formOpen.value = false;
    await load();
  } catch (error) {
    formError.value = error instanceof Error ? error.message : "保存角色失败。";
  } finally {
    saving.value = false;
  }
}

function confirmDelete(role: AdminRole) {
  selectedRole.value = role;
  deleteError.value = "";
  deleteOpen.value = true;
}

async function deleteRole() {
  if (!canDelete.value || !selectedRole.value) return;
  deleting.value = true;
  deleteError.value = "";
  try {
    await deleteRecord("roles", selectedRole.value.id);
    deleteOpen.value = false;
    successMessage.value = "角色已删除。";
    await load();
  } catch (error) {
    deleteError.value =
      error instanceof Error ? error.message : "删除角色失败。";
  } finally {
    deleting.value = false;
  }
}

async function loadPermissionOptions() {
  permissionError.value = "";
  try {
    permissionTree.value = await getPermissionTree();
    permissionTreeLoaded.value = true;
  } catch (error) {
    permissionError.value =
      error instanceof Error ? error.message : "无法读取角色权限菜单。";
  }
}

onMounted(() => void Promise.all([load(), loadPermissionOptions()]));
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

.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.filter-row > * {
  min-width: 150px;
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
  width: min(100vw - 32px, 540px);
  max-width: 540px;
  border-radius: 18px;
}

.form-dialog {
  max-height: min(90vh, 900px);
  overflow: hidden;
}
.dialog-form {
  display: flex;
  flex-direction: column;
  max-height: min(90vh, 900px);
}
.dialog-fields {
  overflow-y: auto;
  min-height: 0;
}
.dialog-heading,
.dialog-actions {
  flex: 0 0 auto;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid #e7ecf3;
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

.permissions-section {
  padding: 14px;
  border: 1px solid #e7ecf3;
  border-radius: 12px;
}

.permissions-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  color: #24334d;
  font-size: 12px;
}

.permissions-heading span {
  color: #8b97a8;
  font-size: 10px;
}

.permission-checkbox {
  display: block;
}

.super-admin-note {
  margin-bottom: 8px;
  background: #fff8df;
  color: #785c0d;
  font-size: 11px;
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
