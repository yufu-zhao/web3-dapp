<template>
  <section class="settings-section">
    <q-banner v-if="pageError" rounded class="error-banner">
      <template #avatar><q-icon name="error_outline" /></template>
      {{ pageError }}
      <template #action>
        <q-btn flat dense label="重试" @click="loadSettings" />
      </template>
    </q-banner>
    <q-banner v-if="successMessage" rounded class="success-banner">
      <template #avatar><q-icon name="check_circle" /></template
      >{{ successMessage }}
    </q-banner>

    <div v-if="loading" class="settings-loading">
      <q-spinner-dots color="primary" size="34px" />
      <span>正在读取系统配置</span>
    </div>

    <template v-else-if="settings">
      <q-form class="settings-form" @submit.prevent="saveSettings">
        <section class="settings-card">
          <header class="settings-heading">
            <span class="settings-icon"><q-icon name="badge" /></span>
            <div>
              <h2>系统身份</h2>
              <p>前端展示使用的项目与代币名称。</p>
            </div>
          </header>
          <div class="settings-grid">
            <q-input
              v-model.trim="form.systemName"
              outlined
              dense
              label="系统名称"
              maxlength="80"
              :readonly="!canWrite"
              :rules="[(value) => Boolean(value) || '系统名称不能为空']"
            />
            <q-input
              v-model.trim="form.tokenName"
              outlined
              dense
              label="主代币名称"
              maxlength="80"
              :readonly="!canWrite"
              :rules="[(value) => Boolean(value) || '代币名称不能为空']"
            />
            <q-input
              v-model.trim="form.tokenSymbol"
              outlined
              dense
              label="主代币简称"
              maxlength="16"
              :readonly="!canWrite"
              :rules="[
                (value) =>
                  /^[\p{L}\p{N}._-]{1,16}$/u.test(value) ||
                  '使用 1 至 16 位字母、数字、点、下划线或连字符',
              ]"
            />
            <q-input
              :model-value="settings.installationChainId ?? '尚未锁定'"
              outlined
              dense
              label="安装链 ID"
              readonly
              hint="由安装器在完整部署后锁定"
            />
          </div>
        </section>

        <section class="settings-card">
          <header class="settings-heading">
            <span class="settings-icon"><q-icon name="hub" /></span>
            <div>
              <h2>连接服务</h2>
              <p>配置钱包连接服务使用的公开项目标识。</p>
            </div>
          </header>
          <q-input
            v-model.trim="form.projectId"
            outlined
            dense
            label="WalletConnect Project ID"
            placeholder="留空时隐藏 WalletConnect 入口"
            maxlength="128"
            :readonly="!canWrite"
          />
        </section>

        <section class="settings-card">
          <header class="settings-heading">
            <span class="settings-icon"><q-icon name="password" /></span>
            <div>
              <h2>管理员密码策略</h2>
              <p>新建管理员和重设密码时会按此策略校验。</p>
            </div>
          </header>
          <div class="policy-length">
            <q-input
              v-model.number="form.passwordPolicy.minimumLength"
              outlined
              dense
              type="number"
              label="最小长度"
              min="8"
              max="128"
              :readonly="!canWrite"
              :rules="[
                (value) =>
                  (Number.isInteger(value) && value >= 8 && value <= 128) ||
                  '长度须为 8 到 128 位整数',
              ]"
            />
            <span>字符</span>
          </div>
          <div class="policy-options">
            <q-checkbox
              v-model="form.passwordPolicy.requireUppercase"
              label="包含大写字母"
              :disable="!canWrite"
            />
            <q-checkbox
              v-model="form.passwordPolicy.requireLowercase"
              label="包含小写字母"
              :disable="!canWrite"
            />
            <q-checkbox
              v-model="form.passwordPolicy.requireNumber"
              label="包含数字"
              :disable="!canWrite"
            />
            <q-checkbox
              v-model="form.passwordPolicy.requireSymbol"
              label="包含特殊字符"
              :disable="!canWrite"
            />
          </div>
        </section>

        <div v-if="canWrite" class="settings-actions">
          <q-btn
            color="primary"
            text-color="dark"
            unelevated
            icon="save"
            label="保存设置"
            type="submit"
            :loading="saving"
          />
        </div>
        <q-banner v-else rounded class="readonly-banner">
          <template #avatar><q-icon name="visibility" /></template>
          当前角色只有查看系统设置的权限。
        </q-banner>
      </q-form>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { adminRequest, type AdminSettings } from "../services/admin-api";
import { canAccess } from "../services/admin-session";

const canWrite = computed(() => canAccess("settings:write"));
const loading = ref(true);
const saving = ref(false);
const pageError = ref("");
const successMessage = ref("");
const settings = ref<AdminSettings | null>(null);
const form = ref({
  systemName: "",
  tokenName: "",
  tokenSymbol: "",
  projectId: "",
  passwordPolicy: {
    minimumLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSymbol: true,
  },
});

async function loadSettings() {
  loading.value = true;
  pageError.value = "";
  try {
    const response = await adminRequest<{ settings: AdminSettings }>(
      "/settings",
    );
    settings.value = response.settings;
    form.value = {
      systemName: response.settings.systemName,
      tokenName: response.settings.tokenName,
      tokenSymbol: response.settings.tokenSymbol,
      projectId: response.settings.projectId ?? "",
      passwordPolicy: { ...response.settings.passwordPolicy },
    };
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : "无法读取系统设置。";
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  if (!canWrite.value) return;
  saving.value = true;
  pageError.value = "";
  successMessage.value = "";
  try {
    const response = await adminRequest<{ settings: AdminSettings }>(
      "/settings",
      {
        method: "PATCH",
        body: JSON.stringify({
          systemName: form.value.systemName,
          tokenName: form.value.tokenName,
          tokenSymbol: form.value.tokenSymbol,
          projectId: form.value.projectId || null,
          passwordPolicy: form.value.passwordPolicy,
        }),
      },
    );
    settings.value = response.settings;
    successMessage.value = "系统设置已保存。";
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : "保存系统设置失败。";
  } finally {
    saving.value = false;
  }
}

onMounted(() => void loadSettings());
</script>

<style lang="scss" scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-card {
  padding: 24px;
  border: 1px solid #e3e8ef;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(23, 43, 77, 0.05);
}

.settings-heading {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 22px;
}

.settings-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 12px;
  background: #fff5d6;
  color: #9e7400;
  font-size: 21px;
  place-items: center;
}

.settings-heading h2 {
  margin: 0;
  color: #17243b;
  font-size: 16px;
}

.settings-heading p {
  margin: 4px 0 0;
  color: #8490a2;
  font-size: 11px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.policy-length {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 280px;
}

.policy-length .q-field {
  flex: 1;
}

.policy-length > span {
  color: #738096;
  font-size: 12px;
}

.policy-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-top: 10px;
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
}

.error-banner {
  background: #fff0f1;
  color: #a92a3c;
}

.success-banner {
  background: #e9fbf3;
  color: #13734b;
}

.readonly-banner {
  background: #eef3f8;
  color: #526177;
}

.settings-loading {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #7d899b;
}

@media (max-width: 640px) {
  .settings-card {
    padding: 18px 16px;
  }

  .settings-grid {
    grid-template-columns: 1fr;
  }

  .settings-heading p {
    line-height: 1.6;
  }

  .policy-options {
    flex-direction: column;
  }
}
</style>
