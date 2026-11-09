<template>
  <section class="workspace-section">
    <q-banner v-if="successMessage" rounded class="success-banner">
      <template #avatar><q-icon name="check_circle" /></template>
      {{ successMessage }}
    </q-banner>
    <q-banner v-if="roleError || settingsError" rounded class="warning-banner">
      <template #avatar><q-icon name="info_outline" /></template>
      {{ roleError || settingsError }}
    </q-banner>

    <AdminDataTable
      title="管理员账号"
      description="管理后台登录账号、所属角色和账号状态。"
      :rows="state.rows"
      :columns="columns"
      :loading="state.loading"
      :error="state.error"
      :total-rows="state.total"
      :page="state.page"
      :page-size="state.pageSize"
      :search="state.search"
      :allow-create="canCreate"
      :empty-label="state.search ? '没有匹配的管理员' : '尚未创建管理员账号'"
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
            label="账号状态"
            :options="statusOptions"
          />
          <q-select
            v-model="roleFilter"
            outlined
            dense
            clearable
            emit-value
            map-options
            label="所属角色"
            :options="roleOptions"
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
            aria-label="编辑管理员"
            @click="openEdit(row as unknown as AdminUser)"
          />
          <q-btn
            v-if="canDelete"
            flat
            dense
            color="negative"
            icon="delete_outline"
            aria-label="删除管理员"
            @click="confirmDelete(row as unknown as AdminUser)"
          />
        </div>
        <span v-else class="readonly-label">只读</span>
      </template>
    </AdminDataTable>

    <q-dialog v-model="formOpen" persistent>
      <q-card class="form-dialog">
        <q-form @submit.prevent="saveUser">
          <q-card-section class="dialog-heading">
            <div>
              <p class="dialog-kicker">ADMIN ACCOUNT</p>
              <h2>{{ editingId ? "编辑管理员" : "新建管理员" }}</h2>
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
              v-model.trim="form.username"
              outlined
              dense
              label="登录账号"
              maxlength="64"
              :rules="[(value) => Boolean(value) || '请输入登录账号']"
            />
            <q-input
              v-model="form.password"
              outlined
              dense
              type="password"
              autocomplete="new-password"
              :label="editingId ? '重设密码（留空表示不修改）' : '初始密码'"
              :rules="[validatePassword]"
              :hint="passwordHint"
              lazy-rules="ondemand"
            />
            <q-select
              v-model="form.roleId"
              outlined
              dense
              emit-value
              map-options
              label="所属角色"
              :options="roleOptions"
              :rules="[(value) => Boolean(value) || '请选择角色']"
            />
            <q-toggle
              v-model="form.isActive"
              color="positive"
              label="启用账号"
            />
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
          <h2>删除管理员账号？</h2>
          <p>将删除账号「{{ selectedUser?.username }}」。此操作无法撤销。</p>
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
            @click="deleteUser"
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
  adminRequest,
  createRecord,
  deleteRecord,
  getPage,
  updateRecord,
  type AdminPasswordPolicy,
  type AdminRole,
  type AdminSettings,
  type AdminUser,
} from "../services/admin-api";
import { useAdminPage } from "../services/use-admin-page";
import { canAccess } from "../services/admin-session";

defineOptions({ name: "AdministratorsPage" });

const { state, load, setSearch, setPage, setPageSize } =
  useAdminPage<AdminUser>("users");
const canCreate = computed(() => canAccess("admins:create"));
const canUpdate = computed(() => canAccess("admins:update"));
const canDelete = computed(() => canAccess("admins:delete"));
const roleOptions = ref<Array<{ label: string; value: string }>>([]);
const passwordPolicy = ref<AdminPasswordPolicy>({
  minimumLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
});
const roleError = ref("");
const settingsError = ref("");
const successMessage = ref("");
const formOpen = ref(false);
const deleteOpen = ref(false);
const saving = ref(false);
const deleting = ref(false);
const editingId = ref<string | null>(null);
const selectedUser = ref<AdminUser | null>(null);
const formError = ref("");
const deleteError = ref("");
const activeFilter = ref<boolean | null>(null);
const roleFilter = ref<string | null>(null);
const statusOptions = [
  { label: "已启用", value: true },
  { label: "已停用", value: false },
];
const form = ref({ username: "", password: "", roleId: "", isActive: true });
const passwordHint = computed(
  () =>
    `密码至少 ${passwordPolicy.value.minimumLength} 位，并符合已启用的字符要求。`,
);

const columns: AdminTableColumn[] = [
  { name: "username", label: "管理员账号", field: "username", align: "left" },
  { name: "roleName", label: "所属角色", field: "roleName" },
  {
    name: "isActive",
    label: "状态",
    field: "isActive",
    format: (value) => (value ? "启用" : "停用"),
  },
  {
    name: "lastLoginAt",
    label: "最近登录",
    field: "lastLoginAt",
    format: formatDate,
  },
  {
    name: "createdAt",
    label: "创建时间",
    field: "createdAt",
    format: formatDate,
  },
  { name: "actions", label: "操作", field: "id", align: "right" },
];

const passwordRequirements = computed(
  () =>
    [
      [passwordPolicy.value.requireUppercase, /[A-Z]/, "大写字母"],
      [passwordPolicy.value.requireLowercase, /[a-z]/, "小写字母"],
      [passwordPolicy.value.requireNumber, /[0-9]/, "数字"],
      [passwordPolicy.value.requireSymbol, /[^A-Za-z0-9]/, "特殊字符"],
    ] as Array<[boolean, RegExp, string]>,
);

function validatePassword(value: string) {
  if (!value && editingId.value) return true;
  if (!value) return "请输入初始密码";
  if (value.length < passwordPolicy.value.minimumLength)
    return `密码至少需要 ${passwordPolicy.value.minimumLength} 位`;
  const missing = passwordRequirements.value
    .filter(([required, pattern]) => required && !pattern.test(value))
    .map(([, , label]) => label);
  return missing.length ? `还需包含：${missing.join("、")}` : true;
}

function formatDate(value: unknown) {
  if (!value) return "从未登录";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
}

async function loadOptions() {
  roleError.value = "";
  settingsError.value = "";
  const [roles, settings] = await Promise.allSettled([
    getPage<AdminRole>("roles", 1, 100, ""),
    adminRequest<{ settings: AdminSettings }>("/settings"),
  ]);
  if (roles.status === "fulfilled") {
    roleOptions.value = roles.value.items.map((role) => ({
      label: role.name,
      value: role.id,
    }));
  } else {
    roleError.value =
      roles.reason instanceof Error
        ? roles.reason.message
        : "无法读取角色列表。";
  }
  if (settings.status === "fulfilled") {
    passwordPolicy.value = settings.value.settings.passwordPolicy;
  } else {
    settingsError.value =
      settings.reason instanceof Error
        ? settings.reason.message
        : "无法读取密码策略。";
  }
}

function applyFilters() {
  state.filters = {};
  if (activeFilter.value !== null) state.filters.isActive = activeFilter.value;
  if (roleFilter.value) state.filters.roleId = roleFilter.value;
  state.page = 1;
  void load();
}

function resetFilters() {
  activeFilter.value = null;
  roleFilter.value = null;
  state.filters = {};
  state.page = 1;
  void load();
}

function openCreate() {
  editingId.value = null;
  form.value = { username: "", password: "", roleId: "", isActive: true };
  formError.value = "";
  successMessage.value = "";
  formOpen.value = true;
}

function openEdit(user: AdminUser) {
  editingId.value = user.id;
  form.value = {
    username: user.username,
    password: "",
    roleId: user.roleId,
    isActive: user.isActive,
  };
  formError.value = "";
  successMessage.value = "";
  formOpen.value = true;
}

async function saveUser() {
  const canSave = editingId.value ? canUpdate.value : canCreate.value;
  if (!canSave || validatePassword(form.value.password) !== true) return;
  saving.value = true;
  formError.value = "";
  successMessage.value = "";
  const payload: Record<string, unknown> = {
    username: form.value.username,
    roleId: form.value.roleId,
    isActive: form.value.isActive,
  };
  if (form.value.password) payload.password = form.value.password;
  try {
    if (editingId.value) {
      await updateRecord("users", editingId.value, payload);
      successMessage.value = "管理员信息已保存。";
    } else {
      await createRecord("users", payload);
      successMessage.value = "管理员账号已创建。";
    }
    formOpen.value = false;
    await load();
  } catch (error) {
    formError.value =
      error instanceof Error ? error.message : "保存管理员信息失败。";
  } finally {
    saving.value = false;
  }
}

function confirmDelete(user: AdminUser) {
  selectedUser.value = user;
  deleteError.value = "";
  successMessage.value = "";
  deleteOpen.value = true;
}

async function deleteUser() {
  if (!canDelete.value || !selectedUser.value) return;
  deleting.value = true;
  deleteError.value = "";
  try {
    await deleteRecord("users", selectedUser.value.id);
    deleteOpen.value = false;
    successMessage.value = "管理员账号已删除。";
    await load();
  } catch (error) {
    deleteError.value =
      error instanceof Error ? error.message : "删除管理员失败。";
  } finally {
    deleting.value = false;
  }
}

onMounted(async () => {
  await Promise.all([load(), loadOptions()]);
});
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
  width: min(100vw - 32px, 520px);
  max-width: 520px;
  border-radius: 18px;
}

.dialog-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 10px;
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

.confirm-dialog {
  padding: 6px;
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
