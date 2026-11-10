<template>
  <section class="language-management">
    <q-banner v-if="errorMessage" rounded class="language-error">
      <template #avatar><q-icon name="error_outline" /></template>
      {{ errorMessage }}
      <template #action>
        <q-btn flat dense label="重试" @click="loadLanguages" />
      </template>
    </q-banner>

    <section class="settings-card">
      <header class="settings-heading">
        <span class="settings-icon"><q-icon name="translate" /></span>
        <div>
          <h2>用户端语言</h2>
          <p>管理可用语言、默认语言及每个语言的界面词条。</p>
        </div>
        <q-btn
          v-if="canWrite"
          color="primary"
          unelevated
          icon="add"
          label="新增语言"
          @click="openCreateDialog"
        />
      </header>

      <q-table
        flat
        bordered
        row-key="id"
        :rows="languages"
        :columns="languageColumns"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        no-data-label="暂无语言配置"
      >
        <template #body-cell-enabled="props">
          <q-td :props="props">
            <q-toggle
              :model-value="props.row.isEnabled"
              :disable="!canWrite || props.row.isDefault"
              color="positive"
              @update:model-value="setLanguageEnabled(props.row, $event)"
            />
          </q-td>
        </template>
        <template #body-cell-default="props">
          <q-td :props="props">
            <q-badge v-if="props.row.isDefault" color="primary" label="默认" />
            <q-btn
              v-else-if="canWrite"
              flat
              dense
              color="primary"
              label="设为默认"
              :disable="!props.row.isEnabled"
              @click="setDefaultLanguage(props.row)"
            />
            <span v-else>—</span>
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props" class="language-actions">
            <q-btn
              flat
              dense
              round
              color="primary"
              icon="translate"
              aria-label="编辑翻译词条"
              @click="openTranslations(props.row)"
            >
              <q-tooltip>编辑翻译词条</q-tooltip>
            </q-btn>
            <q-btn
              v-if="canWrite"
              flat
              dense
              round
              color="primary"
              icon="edit"
              aria-label="编辑语言名称"
              @click="openEditDialog(props.row)"
            >
              <q-tooltip>编辑语言名称</q-tooltip>
            </q-btn>
            <q-btn
              v-if="canWrite && !props.row.isDefault"
              flat
              dense
              round
              color="negative"
              icon="delete_outline"
              aria-label="删除语言"
              @click="pendingDeleteLanguage = props.row"
            >
              <q-tooltip>删除语言</q-tooltip>
            </q-btn>
          </q-td>
        </template>
        <template #loading>
          <q-inner-loading showing color="primary" />
        </template>
      </q-table>
      <q-banner rounded class="language-hint">
        用户端只有一种启用语言时会隐藏语言切换按钮。新增语言默认停用；复制当前默认语言的词条后，可先编辑翻译，再启用。
      </q-banner>
    </section>

    <section v-if="selectedLanguage" class="settings-card translation-card">
      <header class="settings-heading">
        <span class="settings-icon"><q-icon name="text_fields" /></span>
        <div>
          <h2>{{ selectedLanguage.name }}词条</h2>
          <p>
            {{ selectedLanguage.locale }} · {{ translationRows.length }} 条翻译
          </p>
        </div>
      </header>
      <div class="translation-toolbar">
        <div class="translation-filter-row">
          <q-input
            v-model.trim="translationSearch"
            outlined
            dense
            clearable
            debounce="200"
            label="搜索词条键或翻译文本"
            class="translation-search"
          >
            <template #prepend><q-icon name="search" /></template>
          </q-input>
          <q-toggle
            v-model="onlyPendingTranslations"
            label="只看待翻译"
            :disable="selectedLanguage.isDefault"
          />
        </div>
        <div class="translation-action-row">
          <div class="translation-ai-actions">
            <q-btn
              v-if="canWrite"
              flat
              color="primary"
              icon="playlist_add_check"
              label="选择待翻译项"
              :disable="
                selectedLanguage.isDefault || !pendingTranslationRows.length
              "
              @click="selectPendingTranslations"
            />
            <q-btn
              v-if="canWrite"
              color="primary"
              unelevated
              icon="auto_awesome"
              :disable="
                selectedLanguage.isDefault || !selectedTranslationRows.length
              "
              :loading="generatingTranslations"
              :label="
                generatingTranslations
                  ? aiTranslationProgress
                  : `AI 翻译选中 (${selectedTranslationRows.length})`
              "
              @click="generateAiTranslationPreview"
            />
          </div>
          <q-space />
          <div class="translation-edit-actions">
            <q-btn
              v-if="canWrite"
              flat
              color="primary"
              icon="add"
              label="新增词条"
              @click="translationDialog = true"
            />
            <q-btn
              v-if="canWrite"
              color="primary"
              unelevated
              icon="save"
              label="保存翻译"
              :loading="savingTranslations"
              @click="saveTranslations"
            />
          </div>
        </div>
      </div>
      <q-table
        flat
        bordered
        row-key="key"
        :rows="visibleTranslations"
        :columns="translationColumns"
        :loading="loadingTranslations"
        :pagination="{ rowsPerPage: 20 }"
        no-data-label="没有匹配的翻译词条"
        selection="multiple"
        :selected="selectedTranslationRows"
        @update:selected="selectedTranslationRows = [...$event]"
      >
        <template #body-cell-key="props">
          <q-td :props="props">
            <code>{{ props.row.key }}</code>
          </q-td>
        </template>
        <template #body-cell-value="props">
          <q-td :props="props">
            <q-input
              v-model="props.row.value"
              type="textarea"
              autogrow
              dense
              borderless
              :readonly="!canWrite"
              class="translation-value"
            >
              <q-tooltip
                v-if="!selectedLanguage.isDefault && props.row.sourceValue"
                class="translation-compare-tooltip"
                anchor="top middle"
                self="bottom middle"
              >
                <div class="translation-compare-item">
                  <strong>原文</strong>
                  <span>{{ props.row.sourceValue }}</span>
                </div>
                <div class="translation-compare-item">
                  <strong>译文</strong>
                  <span>{{ props.row.value || "（空）" }}</span>
                </div>
              </q-tooltip>
            </q-input>
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              v-if="canWrite"
              flat
              dense
              round
              color="negative"
              icon="delete_outline"
              aria-label="删除词条"
              @click="pendingDeleteKey = props.row.key"
            />
          </q-td>
        </template>
        <template #loading>
          <q-inner-loading showing color="primary" />
        </template>
      </q-table>
    </section>

    <q-dialog v-model="aiPreviewDialog" persistent>
      <q-card class="language-dialog translation-preview-dialog">
        <q-card-section>
          <div class="text-h6">AI 翻译预览</div>
          <div class="translation-preview-hint">
            {{ aiPreviewPartial ? "部分批次失败；" : "" }}已生成
            {{ aiPreviewRows.length }} 条译文。检查并修改后确认保存。
          </div>
        </q-card-section>
        <q-card-section class="translation-preview-content">
          <div
            v-for="item in aiPreviewRows"
            :key="item.key"
            class="translation-preview-row"
          >
            <div class="translation-preview-column">
              <div class="translation-preview-label">
                <code>{{ item.key }} · 原文</code>
              </div>
              <p>{{ item.sourceValue }}</p>
            </div>
            <div class="translation-preview-column">
              <div class="translation-preview-label"><span>译文</span></div>
              <q-input
                v-model="item.translatedValue"
                borderless
                dense
                type="textarea"
                autogrow
                class="translation-preview-input"
                aria-label="修改译文"
              />
            </div>
          </div>
        </q-card-section>
        <q-card-section class="dialog-actions">
          <q-btn
            flat
            label="取消"
            :disable="applyingAiTranslations"
            @click="aiPreviewDialog = false"
          />
          <q-btn
            color="primary"
            unelevated
            label="确认并保存译文"
            :loading="applyingAiTranslations"
            @click="saveAiPreviewTranslations"
          />
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog v-model="languageDialog">
      <q-card class="language-dialog">
        <q-card-section>
          <div class="text-h6">
            {{ editingLanguage ? "编辑语言名称" : "新增语言" }}
          </div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            v-model="languageDraft.locale"
            :options="languageOptions"
            use-input
            emit-value
            map-options
            fill-input
            hide-selected
            input-debounce="0"
            new-value-mode="add-unique"
            outlined
            dense
            label="语言代码"
            hint="可选择常用语言，或直接输入语言代码"
            @filter="filterLanguageOptions"
            @update:model-value="syncLanguageName"
          />
          <q-input
            v-model.trim="languageDraft.name"
            outlined
            dense
            label="显示名称"
            maxlength="64"
          />
        </q-card-section>
        <q-card-section class="dialog-actions">
          <q-btn flat label="取消" @click="languageDialog = false" />
          <q-btn
            color="primary"
            unelevated
            label="保存"
            :loading="savingLanguage"
            @click="saveLanguage"
          />
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog v-model="translationDialog">
      <q-card class="language-dialog">
        <q-card-section><div class="text-h6">新增翻译词条</div></q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input
            v-model.trim="translationDraft.key"
            outlined
            dense
            label="词条键"
            hint="使用字母、数字、下划线、点或连字符"
          />
          <q-input
            v-model="translationDraft.value"
            outlined
            type="textarea"
            autogrow
            label="翻译文本"
          />
        </q-card-section>
        <q-card-section class="dialog-actions">
          <q-btn flat label="取消" @click="translationDialog = false" />
          <q-btn
            color="primary"
            unelevated
            label="添加"
            @click="addTranslation"
          />
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog :model-value="Boolean(pendingDeleteLanguage)" persistent>
      <q-card class="language-dialog">
        <q-card-section class="text-h6">删除语言</q-card-section>
        <q-card-section>
          确认删除 {{ pendingDeleteLanguage?.name }} 及其全部翻译词条？
        </q-card-section>
        <q-card-section class="dialog-actions">
          <q-btn flat label="取消" @click="pendingDeleteLanguage = null" />
          <q-btn
            color="negative"
            unelevated
            label="删除"
            :loading="deletingLanguage"
            @click="deleteLanguage"
          />
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog :model-value="Boolean(pendingDeleteKey)" persistent>
      <q-card class="language-dialog">
        <q-card-section class="text-h6">删除词条</q-card-section>
        <q-card-section> 确认删除词条 {{ pendingDeleteKey }}？ </q-card-section>
        <q-card-section class="dialog-actions">
          <q-btn flat label="取消" @click="pendingDeleteKey = null" />
          <q-btn
            color="negative"
            unelevated
            label="删除"
            :loading="deletingTranslation"
            @click="deleteTranslation"
          />
        </q-card-section>
      </q-card>
    </q-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Notify } from "quasar";
import { adminRequest } from "../services/admin-api";
import { canAccess } from "../services/admin-session";

interface LanguageRow {
  id: string;
  locale: string;
  name: string;
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  translationCount: number;
}

interface TranslationRow {
  key: string;
  value: string;
  sourceValue: string | null;
}

interface AiPreviewRow {
  key: string;
  sourceValue: string;
  currentValue: string;
  translatedValue: string;
}

const canWrite = computed(() => canAccess("settings:update"));
const loading = ref(false);
const savingLanguage = ref(false);
const savingTranslations = ref(false);
const deletingLanguage = ref(false);
const deletingTranslation = ref(false);
const generatingTranslations = ref(false);
const applyingAiTranslations = ref(false);
const errorMessage = ref("");
const languages = ref<LanguageRow[]>([]);
const selectedLanguage = ref<LanguageRow | null>(null);
const translationRows = ref<TranslationRow[]>([]);
const selectedTranslationRows = ref<TranslationRow[]>([]);
const onlyPendingTranslations = ref(false);
const aiPreviewDialog = ref(false);
const aiPreviewRows = ref<AiPreviewRow[]>([]);
const aiPreviewPartial = ref(false);
const aiTranslationProgress = ref("");
const pendingTranslationRows = computed(() =>
  selectedLanguage.value?.isDefault
    ? []
    : translationRows.value.filter(isPendingTranslation),
);
const visibleTranslations = computed(() => {
  const search = translationSearch.value.toLowerCase();
  return translationRows.value.filter(
    (item) =>
      (!onlyPendingTranslations.value || isPendingTranslation(item)) &&
      (!search ||
        item.key.toLowerCase().includes(search) ||
        item.value.toLowerCase().includes(search)),
  );
});
const translationSearch = ref("");
const loadingTranslations = ref(false);
const languageDialog = ref(false);
const translationDialog = ref(false);
const editingLanguage = ref<LanguageRow | null>(null);
const pendingDeleteLanguage = ref<LanguageRow | null>(null);
const pendingDeleteKey = ref<string | null>(null);
const languageDraft = ref({ locale: "", name: "" });
const translationDraft = ref({ key: "", value: "" });
const commonLanguageOptions = [
  { label: "简体中文 · zh-CN", value: "zh-CN", name: "简体中文" },
  { label: "English · en-US", value: "en-US", name: "English" },
  { label: "日本語 · ja-JP", value: "ja-JP", name: "日本語" },
  { label: "한국어 · ko-KR", value: "ko-KR", name: "한국어" },
  { label: "Español · es-ES", value: "es-ES", name: "Español" },
  { label: "Français · fr-FR", value: "fr-FR", name: "Français" },
  { label: "Deutsch · de-DE", value: "de-DE", name: "Deutsch" },
  { label: "Português · pt-BR", value: "pt-BR", name: "Português" },
  { label: "Русский · ru-RU", value: "ru-RU", name: "Русский" },
  { label: "العربية · ar-SA", value: "ar-SA", name: "العربية" },
];
const languageOptions = ref([...commonLanguageOptions]);
const availableLanguageOptions = ref([...commonLanguageOptions]);
const languageColumns = [
  {
    name: "locale",
    label: "语言代码",
    field: "locale",
    align: "left" as const,
  },
  { name: "name", label: "显示名称", field: "name", align: "left" as const },
  {
    name: "enabled",
    label: "启用",
    field: "isEnabled",
    align: "center" as const,
  },
  {
    name: "default",
    label: "默认语言",
    field: "isDefault",
    align: "center" as const,
  },
  {
    name: "translationCount",
    label: "词条数",
    field: "translationCount",
    align: "right" as const,
  },
  { name: "actions", label: "操作", field: "id", align: "right" as const },
];
const translationColumns = [
  { name: "key", label: "词条键", field: "key", align: "left" as const },
  { name: "value", label: "翻译文本", field: "value", align: "left" as const },
  { name: "actions", label: "操作", field: "key", align: "right" as const },
];

async function loadLanguages() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await adminRequest<{ items: LanguageRow[] }>("/languages");
    languages.value = result.items;
    if (selectedLanguage.value) {
      selectedLanguage.value =
        result.items.find((item) => item.id === selectedLanguage.value?.id) ??
        null;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "读取语言目录失败。";
  } finally {
    loading.value = false;
  }
}

function openCreateDialog() {
  editingLanguage.value = null;
  languageDraft.value = { locale: "", name: "" };
  availableLanguageOptions.value = commonLanguageOptions.filter(
    (option) =>
      !languages.value.some((language) => language.locale === option.value),
  );
  languageOptions.value = [...availableLanguageOptions.value];
  languageDialog.value = true;
}

function openEditDialog(language: LanguageRow) {
  editingLanguage.value = language;
  languageDraft.value = { locale: language.locale, name: language.name };
  availableLanguageOptions.value = commonLanguageOptions.filter(
    (option) =>
      option.value === language.locale ||
      !languages.value.some((item) => item.locale === option.value),
  );
  languageOptions.value = [...availableLanguageOptions.value];
  languageDialog.value = true;
}

function filterLanguageOptions(
  value: string,
  update: (callback: () => void) => void,
) {
  update(() => {
    const query = value.trim().toLocaleLowerCase();
    languageOptions.value = availableLanguageOptions.value.filter(
      (option) =>
        option.value.toLocaleLowerCase().includes(query) ||
        option.name.toLocaleLowerCase().includes(query),
    );
  });
}

function syncLanguageName(locale: string) {
  const selected = commonLanguageOptions.find(
    (option) => option.value === locale,
  );
  if (selected) languageDraft.value.name = selected.name;
}

async function saveLanguage() {
  if (!canWrite.value) return;
  if (
    languages.value.some(
      (language) =>
        language.locale === languageDraft.value.locale &&
        language.id !== editingLanguage.value?.id,
    )
  ) {
    Notify.create({
      type: "negative",
      message: "该语言代码已存在，请选择其他语言。",
      position: "top",
    });
    return;
  }
  savingLanguage.value = true;
  try {
    if (editingLanguage.value) {
      await adminRequest(`/languages/${editingLanguage.value.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          locale: languageDraft.value.locale,
          name: languageDraft.value.name,
        }),
      });
    } else {
      const result = await adminRequest<{ language: LanguageRow }>(
        "/languages",
        {
          method: "POST",
          body: JSON.stringify(languageDraft.value),
        },
      );
      selectedLanguage.value = result.language;
    }
    languageDialog.value = false;
    await loadLanguages();
    if (selectedLanguage.value) await openTranslations(selectedLanguage.value);
    Notify.create({
      type: "positive",
      message: "语言已保存。",
      position: "top",
    });
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "保存语言失败。",
      position: "top",
    });
  } finally {
    savingLanguage.value = false;
  }
}

async function setLanguageEnabled(language: LanguageRow, isEnabled: boolean) {
  try {
    await adminRequest(`/languages/${language.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isEnabled }),
    });
    await loadLanguages();
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "更新语言状态失败。",
      position: "top",
    });
    await loadLanguages();
  }
}

async function setDefaultLanguage(language: LanguageRow) {
  try {
    await adminRequest(`/languages/${language.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isDefault: true }),
    });
    await loadLanguages();
    Notify.create({
      type: "positive",
      message: `${language.name}已设为默认语言。`,
      position: "top",
    });
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "设置默认语言失败。",
      position: "top",
    });
  }
}

async function deleteLanguage() {
  if (!pendingDeleteLanguage.value) return;
  deletingLanguage.value = true;
  try {
    await adminRequest(`/languages/${pendingDeleteLanguage.value.id}`, {
      method: "DELETE",
    });
    if (selectedLanguage.value?.id === pendingDeleteLanguage.value.id) {
      selectedLanguage.value = null;
      translationRows.value = [];
    }
    pendingDeleteLanguage.value = null;
    await loadLanguages();
    Notify.create({
      type: "positive",
      message: "语言已删除。",
      position: "top",
    });
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "删除语言失败。",
      position: "top",
    });
  } finally {
    deletingLanguage.value = false;
  }
}

async function openTranslations(language: LanguageRow) {
  selectedLanguage.value = language;
  loadingTranslations.value = true;
  translationSearch.value = "";
  try {
    const result = await adminRequest<{ items: TranslationRow[] }>(
      `/languages/${language.id}/translations`,
    );
    translationRows.value = result.items.map((item) => ({ ...item }));
    selectedTranslationRows.value = [];
    onlyPendingTranslations.value = false;
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "读取翻译词条失败。",
      position: "top",
    });
  } finally {
    loadingTranslations.value = false;
  }
}

function addTranslation() {
  const key = translationDraft.value.key.trim();
  if (!key || translationRows.value.some((item) => item.key === key)) {
    Notify.create({
      type: "negative",
      message: key ? "词条键已存在。" : "请输入词条键。",
      position: "top",
    });
    return;
  }
  translationRows.value.push({
    key,
    value: translationDraft.value.value,
    sourceValue: null,
  });
  translationDraft.value = { key: "", value: "" };
  translationDialog.value = false;
}

function isPendingTranslation(item: TranslationRow) {
  return (
    item.sourceValue !== null &&
    (!item.value.trim() || item.value === item.sourceValue)
  );
}

function selectPendingTranslations() {
  const candidates = pendingTranslationRows.value;
  selectedTranslationRows.value = candidates.slice(0, 20);
  if (candidates.length > 20) {
    Notify.create({
      type: "info",
      message: `待翻译共 ${candidates.length} 条，已选择前 20 条。`,
      position: "top",
      timeout: 0,
      actions: [
        {
          label: "选择全部",
          color: "white",
          handler: () => {
            selectedTranslationRows.value = [...candidates];
            Notify.create({
              type: "positive",
              message: `已选择全部 ${candidates.length} 条待翻译词条。`,
              position: "top",
            });
          },
        },
      ],
    });
  } else if (!candidates.length) {
    Notify.create({
      type: "info",
      message: "当前筛选结果没有待翻译词条。",
      position: "top",
    });
  }
}

async function generateAiTranslationPreview() {
  if (!canWrite.value || !selectedLanguage.value) return;
  const selected = [...selectedTranslationRows.value];
  if (!selected.length) return;
  generatingTranslations.value = true;
  aiPreviewPartial.value = false;
  aiTranslationProgress.value = "正在准备翻译…";
  try {
    const translatedRows: AiPreviewRow[] = [];
    let failedBatch: unknown;
    // 大批量翻译按序拆成每批 20 条，避免并发请求打满模型服务。
    for (let offset = 0; offset < selected.length; offset += 20) {
      const batch = selected.slice(offset, offset + 20);
      aiTranslationProgress.value = `正在翻译 ${Math.min(offset + 20, selected.length)} / ${selected.length}`;
      try {
        const result = await adminRequest<{
          pendingCount: number;
          items: AiPreviewRow[];
        }>(`/languages/${selectedLanguage.value.id}/translations/ai-preview`, {
          method: "POST",
          body: JSON.stringify({ keys: batch.map((item) => item.key) }),
        });
        translatedRows.push(...result.items);
      } catch (error) {
        failedBatch = error;
        break;
      }
    }
    aiPreviewRows.value = translatedRows.map((item) => ({ ...item }));
    aiPreviewPartial.value = Boolean(failedBatch && translatedRows.length);
    aiPreviewDialog.value = aiPreviewRows.value.length > 0;
    if (failedBatch && translatedRows.length) {
      Notify.create({
        type: "warning",
        message: `已生成前 ${translatedRows.length} 条预览，后续批次失败；可先保存这部分译文。`,
        position: "top",
        timeout: 0,
      });
    } else if (failedBatch) {
      throw failedBatch;
    }
    if (!aiPreviewRows.value.length) {
      Notify.create({
        type: "info",
        message: "没有可翻译的词条，请检查目标语言是否仍有待翻译内容。",
        position: "top",
      });
    }
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "AI 翻译失败。",
      position: "top",
    });
  } finally {
    generatingTranslations.value = false;
    aiTranslationProgress.value = "";
  }
}

async function saveAiPreviewTranslations() {
  if (!canWrite.value || !selectedLanguage.value || !aiPreviewRows.value.length)
    return;
  applyingAiTranslations.value = true;
  try {
    const result = await adminRequest<{ items: TranslationRow[] }>(
      `/languages/${selectedLanguage.value.id}/translations`,
      {
        method: "PUT",
        body: JSON.stringify({
          items: aiPreviewRows.value.map((item) => ({
            key: item.key,
            value: item.translatedValue,
          })),
        }),
      },
    );
    translationRows.value = result.items.map((item) => ({ ...item }));
    selectedTranslationRows.value = [];
    aiPreviewDialog.value = false;
    aiPreviewRows.value = [];
    aiPreviewPartial.value = false;
    await loadLanguages();
    Notify.create({
      type: "positive",
      message: "审核后的 AI 译文已保存。",
      position: "top",
    });
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "保存 AI 译文失败。",
      position: "top",
    });
  } finally {
    applyingAiTranslations.value = false;
  }
}

async function saveTranslations() {
  if (!canWrite.value || !selectedLanguage.value) return;
  savingTranslations.value = true;
  try {
    const result = await adminRequest<{ items: TranslationRow[] }>(
      `/languages/${selectedLanguage.value.id}/translations`,
      {
        method: "PUT",
        body: JSON.stringify({ items: translationRows.value }),
      },
    );
    translationRows.value = result.items.map((item) => ({ ...item }));
    await loadLanguages();
    Notify.create({
      type: "positive",
      message: "翻译内容已保存，用户端刷新后生效。",
      position: "top",
    });
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "保存翻译内容失败。",
      position: "top",
    });
  } finally {
    savingTranslations.value = false;
  }
}

async function deleteTranslation() {
  const key = pendingDeleteKey.value;
  if (!key || !selectedLanguage.value) return;
  deletingTranslation.value = true;
  try {
    await adminRequest(
      `/languages/${selectedLanguage.value.id}/translations/${encodeURIComponent(key)}`,
      { method: "DELETE" },
    );
    translationRows.value = translationRows.value.filter(
      (item) => item.key !== key,
    );
    pendingDeleteKey.value = null;
    await loadLanguages();
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "删除翻译词条失败。",
      position: "top",
    });
  } finally {
    deletingTranslation.value = false;
  }
}

onMounted(() => void loadLanguages());
</script>

<style lang="scss" scoped>
.language-management {
  display: grid;
  gap: 18px;
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
  margin-bottom: 18px;

  h2 {
    margin: 0;
    color: var(--admin-text);
    font-size: 16px;
  }

  p {
    margin: 4px 0 0;
    color: var(--admin-muted-text);
    font-size: 11px;
  }
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

.language-actions {
  white-space: nowrap;
}

.language-hint {
  margin-top: 14px;
  background: #eef3f8;
  color: #526177;
  font-size: 12px;
}

.translation-card {
  min-width: 0;
}

.translation-toolbar {
  display: grid;
  gap: 14px;
  margin: 4px 0 18px;
  padding: 14px 16px;
  border: 1px solid var(--admin-border);
  border-radius: 12px;
  background: color-mix(
    in srgb,
    var(--admin-surface) 92%,
    var(--admin-primary)
  );
}

.translation-filter-row,
.translation-action-row,
.translation-ai-actions,
.translation-edit-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.translation-search {
  width: min(460px, 100%);
}

.translation-filter-row {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--admin-border);
}

.translation-preview-dialog {
  display: flex;
  width: min(1040px, 94vw);
  max-width: 94vw;
  max-height: min(88vh, 900px);
  flex-direction: column;
}

.translation-preview-hint {
  margin-top: 6px;
  color: var(--admin-muted-text);
  font-size: 12px;
}

.translation-preview-content {
  display: grid;
  min-height: 0;
  gap: 0;
  overflow-y: auto;
}

.translation-preview-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  padding: 10px 0;
  border-bottom: 1px solid var(--admin-border);
}

.translation-preview-column {
  min-width: 0;
}

.translation-preview-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
  color: var(--admin-muted-text);
  font-size: 11px;
}

.translation-preview-column p {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--admin-background);
  color: var(--admin-text);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.translation-preview-input {
  min-height: 36px;
  padding: 2px 8px;
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  background: var(--admin-surface);
}

.translation-compare-tooltip {
  max-width: min(480px, 80vw);
  white-space: normal;
}

.translation-compare-item {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 8px;
  padding: 3px 0;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.translation-compare-item strong {
  color: color-mix(in srgb, currentColor 75%, transparent);
  font-weight: 600;
}

.translation-value {
  min-width: 240px;
}

.language-dialog {
  width: min(520px, 92vw);
  max-width: 92vw;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.language-error {
  background: #fff0f1;
  color: #a92a3c;
}

@media (max-width: 720px) {
  .settings-card {
    padding: 18px 14px;
  }

  .settings-heading {
    flex-wrap: wrap;
  }

  .translation-value {
    min-width: 140px;
  }

  .translation-action-row {
    align-items: stretch;
  }

  .translation-edit-actions {
    margin-left: auto;
  }

  .translation-preview-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
