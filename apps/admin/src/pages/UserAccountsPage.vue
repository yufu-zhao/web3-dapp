<template>
  <section class="user-accounts-page">
    <header class="page-heading">
      <div>
        <h2>用户管理</h2>
        <p>管理用户资料、账户状态与邀请关系。</p>
      </div>
      <q-chip icon="people" color="primary" text-color="white">
        共 {{ pagination.rowsNumber }} 个用户
      </q-chip>
    </header>

    <q-card flat bordered class="accounts-card">
      <div class="table-toolbar">
        <q-input
          v-model="searchInput"
          outlined
          dense
          clearable
          class="account-search"
          placeholder="搜索名称、钱包、邀请码、备注或 IP"
          aria-label="搜索用户账号"
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
        <q-btn
          flat
          round
          icon="refresh"
          aria-label="刷新用户列表"
          :loading="loading"
          @click="loadAccounts"
          ><q-tooltip>刷新</q-tooltip></q-btn
        >
      </div>

      <q-banner v-if="!migrationReady" rounded class="migration-notice">
        <template #avatar><q-icon name="info" /></template>
        用户资料与状态字段尚未初始化。应用待执行的数据库迁移后即可管理。
      </q-banner>

      <q-table
        v-else
        flat
        hide-pagination
        :rows="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :rows-per-page-options="[0]"
      >
        <template #body-cell-name="slotProps">
          <q-td :props="slotProps">
            <div class="user-name-cell">
              <q-avatar
                size="32px"
                color="blue-grey-1"
                text-color="blue-grey-8"
              >
                <img
                  v-if="slotProps.row.avatarUrl"
                  :src="slotProps.row.avatarUrl"
                  alt=""
                />
                <q-icon v-else name="person" />
              </q-avatar>
              <span>{{ slotProps.value || "未设置名称" }}</span>
            </div>
          </q-td>
        </template>
        <template #body-cell-walletAddress="slotProps">
          <q-td :props="slotProps" class="address-cell"
            ><code>{{ slotProps.value }}</code></q-td
          >
        </template>
        <template #body-cell-invitationCode="slotProps">
          <q-td :props="slotProps">
            <q-badge color="blue-grey-1" text-color="blue-grey-9">{{
              slotProps.value
            }}</q-badge>
          </q-td>
        </template>
        <template #body-cell-inviterWalletAddress="slotProps">
          <q-td :props="slotProps" class="address-cell">
            <code v-if="slotProps.value">{{ slotProps.value }}</code>
            <span v-else class="muted-value">直接注册</span>
          </q-td>
        </template>
        <template #body-cell-invitedCount="slotProps">
          <q-td :props="slotProps" class="count-cell">{{
            slotProps.value
          }}</q-td>
        </template>
        <template #body-cell-createdAt="slotProps">
          <q-td :props="slotProps">{{ formatDate(slotProps.value) }}</q-td>
        </template>
        <template #body-cell-registrationIp="slotProps">
          <q-td :props="slotProps">{{ slotProps.value || "—" }}</q-td>
        </template>
        <template #body-cell-lastLoginIp="slotProps">
          <q-td :props="slotProps">{{ slotProps.value || "—" }}</q-td>
        </template>
        <template #body-cell-isActive="slotProps">
          <q-td :props="slotProps">
            <q-toggle
              :model-value="slotProps.row.isActive !== false"
              :disable="
                !canUpdateAccounts || savingStatusId === slotProps.row.id
              "
              color="positive"
              checked-icon="check"
              unchecked-icon="block"
              @update:model-value="confirmStatusChange(slotProps.row, $event)"
            />
            <span
              :class="
                slotProps.row.isActive !== false
                  ? 'status-active'
                  : 'status-disabled'
              "
            >
              {{ slotProps.row.isActive !== false ? "正常" : "已禁用" }}
            </span>
          </q-td>
        </template>
        <template #body-cell-actions="slotProps">
          <q-td :props="slotProps" class="actions-cell">
            <q-btn
              flat
              round
              dense
              icon="visibility"
              aria-label="查看用户详情"
              @click="openDetails(slotProps.row)"
            >
              <q-tooltip>详情</q-tooltip>
            </q-btn>
            <q-btn
              v-if="canUpdateAccounts"
              flat
              round
              dense
              icon="edit"
              aria-label="编辑用户资料"
              @click="openEditor(slotProps.row)"
            >
              <q-tooltip>编辑</q-tooltip>
            </q-btn>
          </q-td>
        </template>
        <template #no-data>
          <div class="empty-state">
            <q-icon :name="loadError ? 'cloud_off' : 'group_off'" size="30px" />
            <span>{{
              loadError
                ? "用户列表读取失败，请点击刷新重试。"
                : searchInput
                  ? "没有匹配的用户账号。"
                  : "暂无已注册用户。"
            }}</span>
          </div>
        </template>
      </q-table>

      <footer v-if="migrationReady" class="table-pagination">
        <span
          >共 {{ pagination.rowsNumber }} 条<template
            v-if="pagination.rowsNumber"
          >
            · 第 {{ (pagination.page - 1) * pagination.rowsPerPage + 1 }}–{{
              Math.min(
                pagination.page * pagination.rowsPerPage,
                pagination.rowsNumber
              )
            }}
            条</template
          ></span
        >
        <q-select
          :model-value="pagination.rowsPerPage"
          dense
          outlined
          options-dense
          label="每页"
          :options="[10, 20, 50]"
          class="page-size-select"
          @update:model-value="changePageSize"
        />
        <q-pagination
          :model-value="pagination.page"
          color="primary"
          :max="pageCount"
          :max-pages="5"
          direction-links
          boundary-links
          :disable="loading || pagination.rowsNumber === 0"
          @update:model-value="changePage"
        />
      </footer>
    </q-card>

    <q-dialog v-model="editDialogOpen">
      <q-card class="edit-account-card">
        <q-card-section>
          <div class="dialog-title">编辑用户资料</div>
          <div class="dialog-subtitle"
            >钱包地址：{{ editingAccount?.walletAddress }}</div
          >
        </q-card-section>
        <q-separator />
        <q-card-section class="edit-account-fields">
          <q-input
            v-model="editForm.name"
            outlined
            label="名称"
            maxlength="128"
          />
          <q-input
            v-model="editForm.avatarUrl"
            outlined
            label="头像 URL"
            maxlength="2048"
            hint="请输入 HTTP 或 HTTPS 图片地址"
          />
          <q-input
            v-model="editForm.remark"
            outlined
            type="textarea"
            label="备注"
            maxlength="2000"
            autogrow
          />
        </q-card-section>
        <q-separator />
        <q-card-section class="dialog-actions">
          <q-btn flat label="取消" v-close-popup />
          <q-btn
            unelevated
            color="primary"
            label="保存"
            :loading="savingProfile"
            @click="saveProfile"
          />
        </q-card-section>
      </q-card>
    </q-dialog>

    <UserAccountDetailsDialog
      v-model="detailsDialogOpen"
      :account="selectedAccount"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Dialog, Notify } from "quasar";
import { canAccess } from "../services/admin-session";
import {
  adminRequest,
  type PageResult,
  type UserAccountRecord
} from "../services/admin-api";
import UserAccountDetailsDialog from "../components/UserAccountDetailsDialog.vue";

defineOptions({ name: "UserAccountsPage" });

const columns = [
  { name: "name", label: "用户", field: "name", align: "left" as const },
  {
    name: "walletAddress",
    label: "钱包地址",
    field: "walletAddress",
    align: "left" as const
  },
  {
    name: "invitationCode",
    label: "邀请码",
    field: "invitationCode",
    align: "left" as const
  },
  {
    name: "inviterWalletAddress",
    label: "邀请人钱包",
    field: "inviterWalletAddress",
    align: "left" as const
  },
  {
    name: "invitedCount",
    label: "邀请人数",
    field: "invitedCount",
    align: "right" as const
  },
  {
    name: "createdAt",
    label: "注册时间",
    field: "createdAt",
    align: "left" as const
  },
  {
    name: "registrationIp",
    label: "注册 IP",
    field: "registrationIp",
    align: "left" as const
  },
  {
    name: "lastLoginIp",
    label: "最近登录 IP",
    field: "lastLoginIp",
    align: "left" as const
  },
  {
    name: "isActive",
    label: "状态",
    field: "isActive",
    align: "left" as const
  },
  { name: "actions", label: "操作", field: "id", align: "right" as const }
];

const rows = ref<UserAccountRecord[]>([]);
const searchInput = ref("");
const loading = ref(false);
const loadError = ref(false);
const migrationReady = ref(true);
const canUpdateAccounts = computed(() => canAccess("user_accounts:update"));
const savingStatusId = ref("");
const savingProfile = ref(false);
const editDialogOpen = ref(false);
const detailsDialogOpen = ref(false);
const editingAccount = ref<UserAccountRecord | null>(null);
const selectedAccount = ref<UserAccountRecord | null>(null);
const editForm = ref({ name: "", avatarUrl: "", remark: "" });
const pagination = ref({
  page: 1,
  rowsPerPage: 10,
  rowsNumber: 0,
  sortBy: "createdAt",
  descending: true
});
const pageCount = computed(() =>
  Math.max(
    1,
    Math.ceil(pagination.value.rowsNumber / pagination.value.rowsPerPage)
  )
);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadAccounts() {
  loading.value = true;
  loadError.value = false;
  const params = new URLSearchParams({
    page: String(pagination.value.page),
    pageSize: String(pagination.value.rowsPerPage),
    search: searchInput.value.trim()
  });
  try {
    const result = await adminRequest<PageResult<UserAccountRecord>>(
      `/user-accounts?${params.toString()}`
    );
    rows.value = result.items;
    pagination.value.rowsNumber = result.total;
    migrationReady.value = true;
  } catch (error) {
    rows.value = [];
    pagination.value.rowsNumber = 0;
    loadError.value = true;
    const message =
      error instanceof Error ? error.message : "读取用户列表失败。";
    migrationReady.value = !message.includes("等待数据库迁移");
    Notify.create({ type: "negative", message, position: "top" });
  } finally {
    loading.value = false;
  }
}

function openDetails(account: UserAccountRecord) {
  selectedAccount.value = account;
  detailsDialogOpen.value = true;
}

function openEditor(account: UserAccountRecord) {
  editingAccount.value = account;
  editForm.value = {
    name: account.name ?? "",
    avatarUrl: account.avatarUrl ?? "",
    remark: account.remark ?? ""
  };
  editDialogOpen.value = true;
}

async function saveProfile() {
  const account = editingAccount.value;
  if (!account) return;
  savingProfile.value = true;
  try {
    await adminRequest(`/user-accounts/${account.id}`, {
      method: "PATCH",
      body: JSON.stringify(editForm.value)
    });
    editDialogOpen.value = false;
    Notify.create({
      type: "positive",
      message: "用户资料已保存。",
      position: "top"
    });
    await loadAccounts();
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "保存用户资料失败。",
      position: "top"
    });
  } finally {
    savingProfile.value = false;
  }
}

function confirmStatusChange(account: UserAccountRecord, isActive: boolean) {
  if (isActive === account.isActive || savingStatusId.value) return;
  const verb = isActive ? "启用" : "禁用";
  Dialog.create({
    title: `${verb}用户账户？`,
    message: `${account.name || account.walletAddress} ${isActive ? "将恢复访问用户端" : "将无法继续进入用户端"}。`,
    cancel: { flat: true, label: "取消" },
    ok: {
      unelevated: true,
      color: isActive ? "positive" : "negative",
      label: verb
    },
    persistent: true
  }).onOk(() => void updateAccountStatus(account, isActive));
}

// 用户状态变更在服务端成功后再刷新列表，避免界面先于实际状态变化。
async function updateAccountStatus(
  account: UserAccountRecord,
  isActive: boolean
) {
  savingStatusId.value = account.id;
  try {
    await adminRequest(`/user-accounts/${account.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive })
    });
    Notify.create({
      type: "positive",
      message: `用户账户已${isActive ? "启用" : "禁用"}。`,
      position: "top"
    });
    await loadAccounts();
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "更新用户状态失败。",
      position: "top"
    });
  } finally {
    savingStatusId.value = "";
  }
}

function changePage(page: number) {
  pagination.value.page = page;
  void loadAccounts();
}

function changePageSize(rowsPerPage: number) {
  pagination.value.page = 1;
  pagination.value.rowsPerPage = rowsPerPage;
  void loadAccounts();
}

watch(searchInput, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    pagination.value.page = 1;
    void loadAccounts();
  }, 300);
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
}

onMounted(() => void loadAccounts());
onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer);
});
</script>

<style lang="scss" scoped>
.user-accounts-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.page-heading h2 {
  margin: 0;
  color: var(--admin-text);
  font-size: 20px;
}
.page-heading p {
  margin: 5px 0 0;
  color: var(--admin-muted-text);
  font-size: 13px;
}
.accounts-card {
  overflow: hidden;
  border-color: var(--admin-border);
  border-radius: 16px;
  background: var(--admin-surface);
}
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px;
}
.table-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 12px 16px;
  color: var(--admin-muted-text);
  font-size: 12px;
}
.page-size-select {
  width: 92px;
}
.account-search {
  width: min(100%, 460px);
}
.user-name-cell {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 130px;
}
.address-cell code {
  overflow-wrap: anywhere;
  color: var(--admin-text);
  font-size: 12px;
}
.muted-value {
  color: var(--admin-muted-text);
}
.count-cell {
  font-variant-numeric: tabular-nums;
}
.status-active,
.status-disabled {
  font-size: 12px;
  white-space: nowrap;
}
.status-active {
  color: var(--q-positive);
}
.status-disabled {
  color: var(--q-negative);
}
.actions-cell {
  white-space: nowrap;
}
.empty-state {
  display: flex;
  min-height: 120px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--admin-muted-text);
}
.migration-notice {
  margin: 16px;
  background: #eef5ff;
  color: #315f99;
}
.edit-account-card {
  width: min(520px, 94vw);
  border-radius: 18px;
  background: var(--admin-surface);
  color: var(--admin-text);
}
.dialog-title {
  font-size: 18px;
  font-weight: 700;
}
.dialog-subtitle {
  margin-top: 6px;
  overflow-wrap: anywhere;
  color: var(--admin-muted-text);
  font-size: 12px;
}
.edit-account-fields {
  display: grid;
  gap: 14px;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
@media (max-width: 720px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .table-toolbar {
    justify-content: stretch;
  }
  .table-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
  .account-search {
    width: 100%;
  }
}
</style>
