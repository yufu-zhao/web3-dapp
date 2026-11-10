<template>
  <main class="content-management-page">
    <header class="page-heading">
      <div>
        <h1>首页内容</h1>
        <p>管理用户端轮播、公告与公告滚动效果。</p>
      </div>
      <q-btn
        v-if="canUpdate"
        color="primary"
        text-color="dark"
        icon="save"
        label="保存全部"
        :loading="saving"
        :disable="loading"
        @click="saveSettings"
      />
      <span v-else class="readonly-label">只读</span>
    </header>

    <q-banner
      v-if="errorMessage"
      rounded
      class="content-banner content-banner--error"
    >
      <template #avatar><q-icon name="error_outline" /></template>
      {{ errorMessage }}
      <template #action>
        <q-btn flat dense label="重试" @click="loadSettings" />
      </template>
    </q-banner>
    <q-banner
      v-if="successMessage"
      rounded
      class="content-banner content-banner--success"
    >
      <template #avatar><q-icon name="check_circle" /></template>
      {{ successMessage }}
    </q-banner>

    <div v-if="loading" class="content-loading">
      <q-spinner-dots color="primary" size="34px" />
      <span>正在读取首页内容</span>
    </div>

    <template v-else>
      <q-tabs
        v-model="activeTab"
        align="left"
        dense
        active-color="primary"
        indicator-color="primary"
        class="content-tabs"
      >
        <q-tab name="carousel" icon="view_carousel" label="首屏轮播" />
        <q-tab name="announcements" icon="campaign" label="公告" />
      </q-tabs>

      <q-tab-panels v-model="activeTab" animated class="content-panels">
        <q-tab-panel name="carousel" class="content-panel">
          <div class="panel-heading">
            <div>
              <h2>首屏轮播</h2>
              <p>可分别设置桌面端和手机端图片；空图片时用户端不显示该轮播。</p>
            </div>
            <q-btn
              outline
              color="primary"
              icon="add"
              label="添加轮播"
              :disable="!canUpdate"
              @click="addCarousel"
            />
          </div>

          <div v-if="form.carouselItems.length === 0" class="content-empty">
            暂无轮播，点击“添加轮播”开始配置。
          </div>

          <q-card
            v-for="(item, index) in form.carouselItems"
            :key="item.id"
            flat
            bordered
            class="content-card"
          >
            <q-card-section class="content-card-heading">
              <div class="content-card-title">轮播 {{ index + 1 }}</div>
              <q-toggle
                v-model="item.isVisible"
                label="显示"
                :disable="!canUpdate"
              />
              <q-btn
                flat
                round
                dense
                color="negative"
                icon="delete"
                aria-label="删除轮播"
                :disable="!canUpdate"
                @click="removeCarousel(index)"
              />
            </q-card-section>
            <q-separator />
            <q-card-section class="content-fields">
              <q-input
                v-model.trim="item.title"
                outlined
                dense
                label="名称（后台识别用）"
                maxlength="100"
                :disable="!canUpdate"
              />
              <div class="media-field">
                <q-input
                  v-model.trim="item.desktopImageUrl"
                  outlined
                  dense
                  label="桌面端图片链接"
                  :disable="!canUpdate"
                />
                <q-file
                  :model-value="null"
                  outlined
                  dense
                  accept="image/*"
                  label="或上传桌面端图片"
                  max-file-size="10485760"
                  :disable="!canUpdate"
                  @update:model-value="
                    (file) =>
                      uploadAsset(file, (url) => (item.desktopImageUrl = url))
                  "
                />
              </div>
              <div class="media-field">
                <q-input
                  v-model.trim="item.mobileImageUrl"
                  outlined
                  dense
                  label="手机端图片链接"
                  :disable="!canUpdate"
                />
                <q-file
                  :model-value="null"
                  outlined
                  dense
                  accept="image/*"
                  label="或上传手机端图片"
                  max-file-size="10485760"
                  :disable="!canUpdate"
                  @update:model-value="
                    (file) =>
                      uploadAsset(file, (url) => (item.mobileImageUrl = url))
                  "
                />
              </div>
              <q-select
                v-model="item.actionType"
                outlined
                dense
                emit-value
                map-options
                label="点击后的动作"
                :options="actionOptions"
                :disable="!canUpdate"
              />
              <q-input
                v-if="item.actionType !== 'none'"
                v-model.trim="item.actionTarget"
                outlined
                dense
                :label="
                  item.actionType === 'route'
                    ? '站内路由（如 /presale）'
                    : '外部链接'
                "
                :disable="!canUpdate"
              />
              <q-select
                v-model="item.widthMode"
                outlined
                dense
                emit-value
                map-options
                label="轮播宽度"
                :options="widthOptions"
                :disable="!canUpdate"
              />
              <q-input
                v-model.number="item.desktopHeight"
                outlined
                dense
                type="number"
                min="0"
                label="桌面端高度（px）"
                :disable="!canUpdate"
              />
              <q-input
                v-model.number="item.mobileHeight"
                outlined
                dense
                type="number"
                min="0"
                label="手机端高度（px）"
                :disable="!canUpdate"
              />
              <q-input
                v-model.number="item.sortOrder"
                outlined
                dense
                type="number"
                label="显示顺序"
                :disable="!canUpdate"
              />
            </q-card-section>
          </q-card>
        </q-tab-panel>

        <q-tab-panel name="announcements" class="content-panel">
          <section class="content-card ticker-card">
            <div class="panel-heading">
              <div>
                <h2>首页滚动参数</h2>
                <p>标题和摘要从右向左滚动，公告之间向上切换。</p>
              </div>
            </div>
            <div class="ticker-fields">
              <q-input
                v-model.number="form.tickerSettings.scrollDurationMs"
                outlined
                dense
                type="number"
                min="1000"
                label="单条滚动时长（毫秒）"
                :disable="!canUpdate"
              />
              <q-input
                v-model.number="form.tickerSettings.itemDelayMs"
                outlined
                dense
                type="number"
                min="0"
                label="切换间隔（毫秒）"
                :disable="!canUpdate"
              />
              <q-input
                v-model.number="form.tickerSettings.fontSizePx"
                outlined
                dense
                type="number"
                min="10"
                label="字号（px）"
                :disable="!canUpdate"
              />
            </div>
          </section>

          <div class="panel-heading announcement-heading">
            <div>
              <h2>公告列表</h2>
              <p>
                图文公告可填写正文并添加图片；视频公告可上传视频或填写外部链接。
              </p>
            </div>
            <q-btn
              outline
              color="primary"
              icon="add"
              label="添加公告"
              :disable="!canUpdate"
              @click="addAnnouncement"
            />
          </div>

          <div v-if="form.announcements.length === 0" class="content-empty">
            暂无公告，点击“添加公告”开始配置。
          </div>

          <q-card
            v-for="(item, index) in form.announcements"
            :key="item.id"
            flat
            bordered
            class="content-card"
          >
            <q-card-section class="content-card-heading">
              <div class="content-card-title">公告 {{ index + 1 }}</div>
              <q-toggle
                v-model="item.isVisible"
                label="显示"
                :disable="!canUpdate"
              />
              <q-btn
                flat
                round
                dense
                color="negative"
                icon="delete"
                aria-label="删除公告"
                :disable="!canUpdate"
                @click="removeAnnouncement(index)"
              />
            </q-card-section>
            <q-separator />
            <q-card-section class="content-fields">
              <q-input
                v-model.trim="item.title"
                outlined
                dense
                label="标题"
                maxlength="160"
                :disable="!canUpdate"
              />
              <q-input
                v-model.trim="item.summary"
                outlined
                dense
                label="摘要"
                maxlength="300"
                :disable="!canUpdate"
              />
              <q-select
                v-model="item.contentType"
                outlined
                dense
                emit-value
                map-options
                label="内容类型"
                :options="announcementTypeOptions"
                :disable="!canUpdate"
              />
              <q-input
                v-model="item.body"
                outlined
                type="textarea"
                autogrow
                :label="
                  item.contentType === 'video' ? '视频说明（可选）' : '正文内容'
                "
                :disable="!canUpdate"
              />
              <div class="media-field">
                <q-input
                  v-model.trim="item.mediaUrl"
                  outlined
                  dense
                  label="媒体文件链接"
                  :disable="!canUpdate"
                />
                <q-file
                  :model-value="null"
                  outlined
                  dense
                  :accept="item.contentType === 'video' ? 'video/*' : 'image/*'"
                  :label="
                    item.contentType === 'video' ? '或上传视频' : '或上传图片'
                  "
                  max-file-size="104857600"
                  :disable="!canUpdate"
                  @update:model-value="
                    (file) =>
                      uploadAsset(file, (url) => {
                        item.mediaUrl = url;
                        item.mediaMode = 'upload';
                      })
                  "
                />
              </div>
              <q-select
                v-model="item.mediaMode"
                outlined
                dense
                emit-value
                map-options
                label="媒体来源"
                :options="mediaModeOptions"
                :disable="!canUpdate"
              />
            </q-card-section>
          </q-card>
        </q-tab-panel>
      </q-tab-panels>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  adminRequest,
  type ContentManagementSettings,
  type ManagedAnnouncement,
  type ManagedCarouselItem,
} from "../services/admin-api";
import { canAccess } from "../services/admin-session";

const emptySettings = (): ContentManagementSettings => ({
  carouselItems: [],
  announcements: [],
  tickerSettings: {
    scrollDurationMs: 12000,
    itemDelayMs: 500,
    fontSizePx: 14,
  },
});

const activeTab = ref("carousel");
const route = useRoute();
const router = useRouter();
const canUpdate = computed(() => canAccess("content:update"));
const form = reactive<ContentManagementSettings>(emptySettings());
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

const actionOptions = [
  { label: "无动作", value: "none" },
  { label: "站内路由", value: "route" },
  { label: "外部链接", value: "external" },
];
const widthOptions = [
  { label: "默认宽度", value: "default" },
  { label: "通栏", value: "full" },
];
const announcementTypeOptions = [
  { label: "图文", value: "article" },
  { label: "视频", value: "video" },
];
const mediaModeOptions = [
  { label: "平台上传", value: "upload" },
  { label: "外部链接", value: "external" },
];

function applySettings(value: ContentManagementSettings) {
  form.carouselItems = value.carouselItems ?? [];
  form.announcements = value.announcements ?? [];
  form.tickerSettings = {
    ...emptySettings().tickerSettings,
    ...value.tickerSettings,
  };
}

async function loadSettings() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await adminRequest<ContentManagementSettings>(
      "/content-management",
    );
    applySettings(result ?? emptySettings());
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "读取首页内容失败。";
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  saving.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const result = await adminRequest<ContentManagementSettings>(
      "/content-management",
      { method: "PUT", body: JSON.stringify(form) },
    );
    if (result) applySettings(result);
    successMessage.value = "首页内容已保存。";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "保存首页内容失败。";
  } finally {
    saving.value = false;
  }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `content-${Date.now()}`;
}

function addCarousel() {
  const item: ManagedCarouselItem = {
    id: createId(),
    title: "",
    desktopImageUrl: "",
    mobileImageUrl: "",
    actionType: "none",
    actionTarget: "",
    widthMode: "default",
    desktopHeight: 320,
    mobileHeight: 200,
    sortOrder: form.carouselItems.length,
    isVisible: true,
  };
  form.carouselItems.push(item);
}

function removeCarousel(index: number) {
  form.carouselItems.splice(index, 1);
}

function addAnnouncement() {
  const item: ManagedAnnouncement = {
    id: createId(),
    title: "",
    summary: "",
    contentType: "article",
    body: "",
    mediaUrl: "",
    mediaMode: "upload",
    isVisible: true,
  };
  form.announcements.push(item);
}

function removeAnnouncement(index: number) {
  form.announcements.splice(index, 1);
}

async function uploadAsset(file: File | null, setUrl: (url: string) => void) {
  if (!file) return;
  errorMessage.value = "";
  try {
    const body = new FormData();
    body.append("file", file);
    const result = await adminRequest<{ url: string }>(
      "/content-management/uploads",
      { method: "POST", body },
    );
    setUrl(result.url);
    successMessage.value = "文件已上传。保存后发布内容配置。";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "文件上传失败。";
  }
}

onMounted(loadSettings);
watch(
  () => route.path,
  (path) => {
    activeTab.value = path === "/announcements" ? "announcements" : "carousel";
  },
  { immediate: true },
);
watch(activeTab, (tab) => {
  const path = tab === "announcements" ? "/announcements" : "/carousel";
  if (route.path !== path) void router.replace(path);
});
</script>

<style lang="scss" scoped>
.content-management-page {
  display: grid;
  gap: 20px;
  max-width: 1240px;
  margin: 0 auto;
  padding: 24px;
}

.page-heading,
.panel-heading,
.content-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-heading h1,
.panel-heading h2 {
  margin: 0;
  color: var(--admin-text);
}

.page-heading p,
.panel-heading p {
  margin: 6px 0 0;
  color: var(--admin-muted-text);
}

.page-heading h1 {
  font-size: 26px;
}

.panel-heading h2 {
  font-size: 18px;
}

.content-tabs,
.content-panels {
  background: transparent;
}

.content-panel {
  display: grid;
  gap: 18px;
  padding: 20px 0;
}

.content-card {
  border-color: var(--admin-border);
  border-radius: 14px;
  background: var(--admin-surface);
}

.content-card-heading {
  padding: 12px 16px;
}

.content-card-title {
  flex: 1;
  color: var(--admin-text);
  font-weight: 700;
}

.content-fields,
.ticker-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.media-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.7fr);
  gap: 10px;
}

.ticker-card {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.content-empty,
.content-loading {
  display: flex;
  min-height: 120px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--admin-muted-text);
}

.content-banner--error {
  background: color-mix(in srgb, #b91c1c 12%, transparent);
}

.content-banner--success {
  background: color-mix(in srgb, #15803d 12%, transparent);
}

@media (max-width: 700px) {
  .content-management-page {
    padding: 16px;
  }

  .page-heading,
  .panel-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .content-fields,
  .ticker-fields,
  .media-field {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
