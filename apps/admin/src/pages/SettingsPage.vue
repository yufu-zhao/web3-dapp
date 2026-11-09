<template>
  <section class="settings-layout">
    <aside class="settings-sidebar" aria-label="设置分类">
      <div class="settings-nav-heading">设置分类</div>
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="category-button"
        :class="{ 'category-button--active': activeCategory === category.id }"
        :aria-current="activeCategory === category.id ? 'page' : undefined"
        @click="activeCategory = category.id"
      >
        <q-icon :name="category.icon" size="18px" />
        <span>{{ category.label }}</span>
      </button>
    </aside>

    <main class="settings-content">
      <q-banner v-if="pageError" rounded class="error-banner">
        <template #avatar><q-icon name="error_outline" /></template>
        {{ pageError }}
        <template #action>
          <q-btn flat dense label="重试" @click="loadSettings" />
        </template>
      </q-banner>
      <q-banner v-if="successMessage" rounded class="success-banner">
        <template #avatar>
          <q-icon name="check_circle" />
        </template>
        {{ successMessage }}
      </q-banner>

      <div v-if="loading" class="settings-loading">
        <q-spinner-dots color="primary" size="34px" />
        <span>正在读取系统配置</span>
      </div>

      <template v-else-if="settings">
        <q-form
          v-if="activeCategory === 'basic'"
          class="settings-form"
          @submit.prevent="saveSettings"
        >
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

        <q-form
          v-else
          class="settings-form"
          @submit.prevent="saveThemeSettings"
        >
          <section class="settings-card">
            <header class="settings-heading">
              <span class="settings-icon"><q-icon name="palette" /></span>
              <div>
                <h2>用户端配色</h2>
                <p>设置用户页面的品牌强调色、背景、卡片和文字颜色。</p>
              </div>
            </header>
            <div class="theme-editor-grid">
              <div class="theme-color-grid">
                <label
                  v-for="field in userColorFields"
                  :key="field.key"
                  class="theme-color-field"
                  :for="`user-color-${field.key}`"
                >
                  <span>{{ field.label }}</span>
                  <span class="theme-color-control">
                    <!-- prettier-ignore -->
                    <input
                      :id="`user-color-${field.key}`"
                      v-model="form.themePalettes.user[field.key]"
                      type="color"
                      :disabled="!canWrite"
                    >
                    <code>{{ form.themePalettes.user[field.key] }}</code>
                  </span>
                  <small>{{ field.description }}</small>
                </label>
              </div>
              <div
                class="theme-preview user-theme-preview"
                :style="{
                  backgroundColor: form.themePalettes.user.background,
                  color: form.themePalettes.user.text,
                }"
              >
                <span class="preview-caption">用户端预览</span>
                <div
                  class="preview-surface"
                  :style="{
                    backgroundColor: form.themePalettes.user.surface,
                    borderColor: `color-mix(in srgb, ${form.themePalettes.user.text} 16%, transparent)`,
                  }"
                >
                  <strong>品牌标题</strong>
                  <span :style="{ color: form.themePalettes.user.mutedText }">
                    辅助说明文字
                  </span>
                  <button
                    type="button"
                    class="preview-primary"
                    :style="{
                      backgroundColor: form.themePalettes.user.accent,
                      color: userOnPrimary,
                    }"
                  >
                    主要操作
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-card">
            <header class="settings-heading">
              <span class="settings-icon">
                <q-icon name="dashboard_customize" />
              </span>
              <div>
                <h2>管理后台配色</h2>
                <p>设置后台主色、工作区、内容卡片、文字和分隔边框。</p>
              </div>
            </header>
            <div class="theme-editor-grid">
              <div class="theme-color-grid">
                <label
                  v-for="field in adminColorFields"
                  :key="field.key"
                  class="theme-color-field"
                  :for="`admin-color-${field.key}`"
                >
                  <span>{{ field.label }}</span>
                  <span class="theme-color-control">
                    <!-- prettier-ignore -->
                    <input
                      :id="`admin-color-${field.key}`"
                      v-model="form.themePalettes.admin[field.key]"
                      type="color"
                      :disabled="!canWrite"
                    >
                    <code>{{ form.themePalettes.admin[field.key] }}</code>
                  </span>
                  <small>{{ field.description }}</small>
                </label>
              </div>
              <div
                class="theme-preview admin-theme-preview"
                :style="{
                  backgroundColor: form.themePalettes.admin.background,
                  color: form.themePalettes.admin.text,
                }"
              >
                <span class="preview-caption">管理后台预览</span>
                <div
                  class="preview-surface"
                  :style="{
                    backgroundColor: form.themePalettes.admin.surface,
                    borderColor: form.themePalettes.admin.border,
                  }"
                >
                  <strong>工作区卡片</strong>
                  <span :style="{ color: form.themePalettes.admin.mutedText }">
                    表格和表单辅助文字
                  </span>
                  <button
                    type="button"
                    class="preview-primary"
                    :style="{
                      backgroundColor: form.themePalettes.admin.primary,
                      color: adminOnPrimary,
                    }"
                  >
                    主要操作
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div v-if="canWrite" class="settings-actions">
            <q-btn
              color="primary"
              unelevated
              icon="save"
              label="保存主题设置"
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
    </main>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  applyThemePalette,
  DEFAULT_THEME_PALETTES,
  type AdminThemePalette,
  type ThemePalettes,
  type UserThemePalette,
} from "@chainforge/shared-types";
import { adminRequest, type AdminSettings } from "../services/admin-api";
import { canAccess } from "../services/admin-session";

defineOptions({ name: "SettingsPage" });

const canWrite = computed(() => canAccess("settings:update"));
const loading = ref(true);
const saving = ref(false);
const pageError = ref("");
const successMessage = ref("");
const settings = ref<AdminSettings | null>(null);
type SettingsCategory = "basic" | "theme";
const activeCategory = ref<SettingsCategory>("basic");
const categories: Array<{
  id: SettingsCategory;
  label: string;
  icon: string;
}> = [
  { id: "basic", label: "基础设置", icon: "tune" },
  { id: "theme", label: "主题设置", icon: "palette" },
];
const userColorFields: Array<{
  key: keyof UserThemePalette;
  label: string;
  description: string;
}> = [
  { key: "accent", label: "强调色", description: "按钮、链接和品牌重点" },
  { key: "background", label: "页面背景", description: "用户端页面的整体背景" },
  { key: "surface", label: "内容卡片", description: "主要内容区域的底色" },
  { key: "text", label: "正文文字", description: "标题和主要信息文字" },
  { key: "mutedText", label: "辅助文字", description: "说明和次要信息文字" },
];
const adminColorFields: Array<{
  key: keyof AdminThemePalette;
  label: string;
  description: string;
}> = [
  { key: "primary", label: "后台主色", description: "按钮、当前项和操作图标" },
  {
    key: "background",
    label: "工作区背景",
    description: "页面内容区的整体底色",
  },
  {
    key: "surface",
    label: "卡片与顶栏",
    description: "数据卡片和顶部导航底色",
  },
  { key: "text", label: "正文文字", description: "标题和主要信息文字" },
  { key: "mutedText", label: "辅助文字", description: "描述、提示和次要文字" },
  { key: "border", label: "分隔边框", description: "卡片、表格和表单边线" },
];
interface SettingsForm {
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
  passwordPolicy: AdminSettings["passwordPolicy"];
  themePalettes: ThemePalettes;
}

const form = ref<SettingsForm>({
  systemName: "",
  tokenName: "",
  tokenSymbol: "",
  passwordPolicy: {
    minimumLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSymbol: true,
  },
  themePalettes: structuredClone(DEFAULT_THEME_PALETTES),
});
function contrastText(color: string) {
  const channels =
    color
      .slice(1)
      .match(/.{2}/g)
      ?.map((part) => parseInt(part, 16) / 255) ?? [];
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const luminance =
    (linear[0] ?? 0) * 0.2126 +
    (linear[1] ?? 0) * 0.7152 +
    (linear[2] ?? 0) * 0.0722;
  return luminance > 0.45 ? "#17243b" : "#ffffff";
}
const userOnPrimary = computed(() =>
  contrastText(form.value.themePalettes.user.accent),
);
const adminOnPrimary = computed(() =>
  contrastText(form.value.themePalettes.admin.primary),
);

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
      passwordPolicy: { ...response.settings.passwordPolicy },
      themePalettes: structuredClone(response.settings.themePalettes),
    };
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : "无法读取系统设置。";
  } finally {
    loading.value = false;
  }
}

async function saveThemeSettings() {
  if (!canWrite.value) return;
  saving.value = true;
  pageError.value = "";
  successMessage.value = "";
  try {
    const response = await adminRequest<{ settings: AdminSettings }>(
      "/settings",
      {
        method: "PATCH",
        body: JSON.stringify({ themePalettes: form.value.themePalettes }),
      },
    );
    settings.value = response.settings;
    form.value.themePalettes = structuredClone(response.settings.themePalettes);
    applyThemePalette("admin", response.settings.themePalettes);
    successMessage.value = "主题配色已保存并应用到管理后台。";
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : "保存主题设置失败。";
  } finally {
    saving.value = false;
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
.settings-layout {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  align-items: start;
  gap: 20px;
}

.settings-sidebar {
  position: sticky;
  top: 20px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px;
  border: 1px solid var(--admin-border);
  border-radius: 16px;
  background: var(--admin-surface);
}

.settings-nav-heading {
  padding: 4px 10px 10px;
  color: var(--admin-muted-text);
  font-size: 11px;
  font-weight: 700;
}

.category-button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--admin-muted-text);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
  transition:
    background-color 140ms ease,
    color 140ms ease;

  &:hover {
    background: color-mix(in srgb, var(--admin-primary) 12%, transparent);
    color: var(--admin-text);
  }

  &--active {
    background: color-mix(in srgb, var(--admin-primary) 18%, transparent);
    color: var(--admin-text);
    font-weight: 700;
  }

  &:focus-visible {
    outline: 2px solid var(--admin-primary);
    outline-offset: 2px;
  }
}

.settings-content {
  display: flex;
  min-width: 0;
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
  border: 1px solid var(--admin-border);
  border-radius: 16px;
  background: var(--admin-surface);
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
  background: color-mix(
    in srgb,
    var(--admin-primary) 22%,
    var(--admin-surface)
  );
  color: var(--admin-primary);
  font-size: 21px;
  place-items: center;
}

.settings-heading h2 {
  margin: 0;
  color: var(--admin-text);
  font-size: 16px;
}

.settings-heading p {
  margin: 4px 0 0;
  color: var(--admin-muted-text);
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
  color: var(--admin-muted-text);
  font-size: 12px;
}

.policy-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-top: 10px;
}

.theme-editor-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(220px, 0.82fr);
  align-items: center;
  gap: 24px;
}

.theme-color-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.theme-color-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  color: var(--admin-text);
  font-size: 12px;
  font-weight: 600;
}

.theme-color-control {
  display: flex;
  align-items: center;
  gap: 9px;

  input {
    width: 44px;
    height: 34px;
    padding: 2px;
    border: 1px solid var(--admin-border);
    border-radius: 7px;
    background: var(--admin-surface);
    cursor: pointer;

    &:disabled {
      cursor: default;
    }
  }

  code {
    color: var(--admin-muted-text);
    font-size: 11px;
    font-weight: 500;
  }
}

.theme-color-field small {
  color: var(--admin-muted-text);
  font-size: 10px;
  font-weight: 400;
}

.theme-preview {
  display: flex;
  min-height: 210px;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  padding: 20px;
  border: 1px solid var(--admin-border);
  border-radius: 14px;
}

.preview-caption {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.72;
}

.preview-surface {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 9px;
  padding: 16px;
  border: 1px solid;
  border-radius: 11px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);

  strong {
    font-size: 13px;
  }

  span {
    font-size: 11px;
  }
}

.preview-primary {
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
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
  color: var(--admin-muted-text);
}

@media (max-width: 960px) {
  .theme-editor-grid {
    grid-template-columns: 1fr;
  }

  .theme-preview {
    min-height: 180px;
  }
}

@media (max-width: 720px) {
  .settings-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  .settings-sidebar {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    padding: 8px;
  }

  .settings-nav-heading {
    display: none;
  }

  .category-button {
    flex: 0 0 auto;
    padding: 0 12px;
  }

  .settings-card {
    padding: 18px 16px;
  }

  .settings-grid,
  .theme-color-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-heading p {
    line-height: 1.6;
  }

  .policy-options {
    flex-direction: column;
  }
}
</style>
