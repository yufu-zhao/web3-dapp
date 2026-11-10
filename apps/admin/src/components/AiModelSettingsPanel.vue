<template>
  <section class="ai-model-panel">
    <q-banner
      v-if="errorMessage"
      rounded
      class="model-message model-message--error"
    >
      <template #avatar><q-icon name="error_outline" /></template>
      {{ errorMessage }}
      <template #action>
        <q-btn flat dense label="重试" @click="loadConfiguration" />
      </template>
    </q-banner>

    <section class="settings-card">
      <header class="settings-heading">
        <span class="settings-icon"><q-icon name="smart_toy" /></span>
        <div>
          <h2>大模型服务</h2>
          <p>使用统一的模型调用接口，并为主要非兼容协议提供原生适配。</p>
        </div>
        <q-space />
        <q-toggle
          v-model="form.enabled"
          label="启用"
          color="positive"
          :disable="!canWrite"
        />
      </header>

      <div v-if="loading" class="model-loading">
        <q-spinner-dots color="primary" size="30px" />正在读取模型配置
      </div>
      <template v-else>
        <div class="model-form-grid">
          <q-select
            v-model="form.providerId"
            outlined
            dense
            emit-value
            map-options
            :options="providerOptions"
            label="服务商预设"
            :disable="!canWrite"
            @update:model-value="applyProviderPreset"
          />
          <q-input
            v-model.trim="form.providerName"
            outlined
            dense
            label="服务商名称"
            maxlength="80"
            :readonly="!canWrite"
          />
          <q-input
            v-model.trim="form.baseUrl"
            outlined
            dense
            label="API 地址"
            maxlength="500"
            :readonly="!canWrite"
            hint="HTTPS；本机 Ollama 可使用 HTTP 回环地址"
          />
          <q-input
            v-model="form.apiKey"
            outlined
            dense
            :type="showApiKey ? 'text' : 'password'"
            autocomplete="new-password"
            label="API 密钥"
            :placeholder="
              configuration.hasApiKey
                ? '已保存密钥；留空表示不更换'
                : '请输入服务商 API 密钥'
            "
            :readonly="!canWrite"
            @blur="loadModels"
          >
            <template #append>
              <q-icon
                :name="showApiKey ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showApiKey = !showApiKey"
              />
            </template>
          </q-input>
          <q-select
            v-model="form.model"
            :options="filteredModelOptions"
            outlined
            dense
            use-input
            fill-input
            hide-selected
            new-value-mode="add-unique"
            input-debounce="0"
            label="模型 ID"
            hint="密钥输入完成后自动获取，也可以手动输入模型 ID"
            :readonly="!canWrite"
            :loading="loadingModels"
            @filter="filterModels"
          />
        </div>

        <q-banner
          v-if="!configuration.encryptionKeyReady"
          rounded
          class="model-message model-message--warning"
        >
          <template #avatar><q-icon name="vpn_key" /></template>
          <code>AI_CONFIG_ENCRYPTION_KEY</code> 未配置或格式无效。请使用
          <code>openssl rand -base64 32</code> 生成解码后恰好 32 字节的值，写入
          <code>.env</code> 并重启 API，之后才能安全保存模型 API 密钥。
        </q-banner>
        <q-banner v-else rounded class="model-message model-message--info">
          <template #avatar><q-icon name="lock" /></template>
          API 密钥以 AES-256-GCM
          加密后保存在数据库，不会回传给浏览器。更换服务器时需保留同一加密密钥。
        </q-banner>

        <div
          v-if="testMessage"
          class="model-test-result"
          :class="{ 'model-test-result--error': testFailed }"
          role="status"
        >
          <q-icon :name="testFailed ? 'error_outline' : 'check_circle'" />
          <span>{{ testMessage }}</span>
        </div>
        <q-banner
          v-if="!canWrite"
          rounded
          class="model-message model-message--info"
        >
          <template #avatar><q-icon name="visibility" /></template>
          当前角色只有查看系统设置的权限。
        </q-banner>

        <div v-if="canWrite" class="model-actions">
          <q-btn
            flat
            color="negative"
            label="清除已保存密钥"
            :disable="!configuration.hasApiKey || saving"
            @click="clearSavedApiKey"
          />
          <q-space />
          <q-btn
            outline
            color="primary"
            icon="network_check"
            label="测试连接"
            :loading="testing"
            @click="testConnection"
          />
          <q-btn
            color="primary"
            unelevated
            icon="save"
            label="保存配置"
            :loading="saving"
            @click="saveConfiguration"
          />
        </div>
      </template>
    </section>

    <section class="settings-card provider-card">
      <h3>兼容范围</h3>
      <p>
        原生适配 OpenAI、Anthropic Claude、Google Gemini；兼容预设覆盖
        OpenAI、DeepSeek、通义千问、Moonshot、智谱、硅基流动、OpenRouter、Groq、Together
        AI、NVIDIA NIM 和本机 Ollama。自定义兼容 OpenAI Chat Completions
        协议的端点可使用“自定义服务商”。
      </p>
      <p>
        服务商支持的模型名称、额度和协议细节以其文档为准；这里填写 API
        地址、模型 ID 和密钥。
      </p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Notify } from "quasar";
import { adminRequest } from "../services/admin-api";
import { canAccess } from "../services/admin-session";

interface ModelConfiguration {
  adapter: "openai-compatible" | "anthropic" | "google";
  providerId: string;
  providerName: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
  encryptionKeyReady: boolean;
}

const providers = [
  {
    id: "openai",
    name: "OpenAI",
    adapter: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    adapter: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
  },
  {
    id: "google",
    name: "Google Gemini",
    adapter: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    adapter: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
  },
  {
    id: "qwen",
    name: "通义千问（DashScope）",
    adapter: "openai-compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "moonshot",
    name: "Moonshot（月之暗面）",
    adapter: "openai-compatible",
    baseUrl: "https://api.moonshot.cn/v1",
  },
  {
    id: "zhipu",
    name: "智谱 AI",
    adapter: "openai-compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  },
  {
    id: "siliconflow",
    name: "硅基流动",
    adapter: "openai-compatible",
    baseUrl: "https://api.siliconflow.cn/v1",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    adapter: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "groq",
    name: "Groq",
    adapter: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  {
    id: "together",
    name: "Together AI",
    adapter: "openai-compatible",
    baseUrl: "https://api.together.xyz/v1",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    adapter: "openai-compatible",
    baseUrl: "https://integrate.api.nvidia.com/v1",
  },
  {
    id: "ollama",
    name: "Ollama（本机）",
    adapter: "openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1",
  },
  {
    id: "openai-compatible",
    name: "自定义 OpenAI 兼容服务",
    adapter: "openai-compatible",
    baseUrl: "",
  },
];
const providerOptions = providers.map(({ id, name }) => ({
  label: name,
  value: id,
}));
const canWrite = computed(() => canAccess("settings:update"));
const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const loadingModels = ref(false);
const modelOptions = ref<string[]>([]);
const filteredModelOptions = ref<string[]>([]);
const showApiKey = ref(false);
const errorMessage = ref("");
const testMessage = ref("");
const testFailed = ref(false);
let lastModelsRequest = "";
const configuration = ref<ModelConfiguration>({
  adapter: "openai-compatible",
  providerId: "openai-compatible",
  providerName: "OpenAI 兼容接口",
  baseUrl: "https://api.openai.com/v1",
  model: "",
  enabled: false,
  hasApiKey: false,
  encryptionKeyReady: false,
});
const form = ref({
  adapter: "openai-compatible" as ModelConfiguration["adapter"],
  providerId: "openai-compatible",
  providerName: "OpenAI 兼容接口",
  baseUrl: "https://api.openai.com/v1",
  model: "",
  enabled: false,
  apiKey: "",
});

function applyProviderPreset(providerId: string) {
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) return;
  form.value.providerName = provider.name;
  form.value.adapter = provider.adapter as ModelConfiguration["adapter"];
  if (provider.baseUrl) form.value.baseUrl = provider.baseUrl;
  modelOptions.value = [];
  filteredModelOptions.value = [];
  lastModelsRequest = "";
}

function applyConfiguration(value: ModelConfiguration) {
  configuration.value = value;
  modelOptions.value = [];
  filteredModelOptions.value = [];
  lastModelsRequest = "";
  form.value = {
    adapter: value.adapter,
    providerId: value.providerId,
    providerName: value.providerName,
    baseUrl: value.baseUrl,
    model: value.model,
    enabled: value.enabled,
    apiKey: "",
  };
}

async function loadModels() {
  if (!canWrite.value) return;
  const hasUsableKey =
    form.value.apiKey.trim() || configuration.value.hasApiKey;
  if (!hasUsableKey || loadingModels.value) return;
  // 同一组服务商、地址和密钥只自动查询一次，避免密钥框重复失焦时请求刷屏。
  const requestFingerprint = JSON.stringify({
    providerId: form.value.providerId,
    adapter: form.value.adapter,
    baseUrl: form.value.baseUrl.trim(),
    apiKey: form.value.apiKey.trim() || "saved-key",
  });
  if (requestFingerprint === lastModelsRequest) return;

  loadingModels.value = true;
  try {
    const result = await adminRequest<{ models: string[] }>(
      "/settings/ai-model/models",
      {
        method: "POST",
        body: JSON.stringify(form.value),
      },
    );
    modelOptions.value = result.models;
    filteredModelOptions.value = result.models;
    lastModelsRequest = requestFingerprint;
    Notify.create({
      type: "positive",
      message: `已获取 ${result.models.length} 个模型 ID。`,
      position: "top",
    });
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "获取模型列表失败。",
      position: "top",
    });
  } finally {
    loadingModels.value = false;
  }
}

function filterModels(value: string, update: (callback: () => void) => void) {
  update(() => {
    const query = value.trim().toLocaleLowerCase();
    filteredModelOptions.value = query
      ? modelOptions.value.filter((model) =>
          model.toLocaleLowerCase().includes(query),
        )
      : modelOptions.value;
  });
}

async function loadConfiguration() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await adminRequest<{ configuration: ModelConfiguration }>(
      "/settings/ai-model",
    );
    applyConfiguration(result.configuration);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "读取模型配置失败。";
  } finally {
    loading.value = false;
  }
}

async function saveConfiguration() {
  if (!canWrite.value) return;
  saving.value = true;
  try {
    const result = await adminRequest<{ configuration: ModelConfiguration }>(
      "/settings/ai-model",
      {
        method: "PUT",
        body: JSON.stringify(form.value),
      },
    );
    applyConfiguration(result.configuration);
    testMessage.value = "模型配置已保存。";
    testFailed.value = false;
    Notify.create({
      type: "positive",
      message: "模型配置已保存。",
      position: "top",
    });
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "保存模型配置失败。",
      position: "top",
    });
  } finally {
    saving.value = false;
  }
}

async function testConnection() {
  if (!canWrite.value) return;
  testing.value = true;
  testMessage.value = "";
  testFailed.value = false;
  try {
    const result = await adminRequest<{
      success: true;
      providerName: string;
      model: string;
      response: string;
    }>("/settings/ai-model/test", {
      method: "POST",
      body: JSON.stringify(form.value),
    });
    testMessage.value = `${result.providerName} / ${result.model} 连接成功：${result.response}`;
    Notify.create({
      type: "positive",
      message: "模型连接成功。",
      position: "top",
    });
  } catch (error) {
    testFailed.value = true;
    testMessage.value =
      error instanceof Error ? error.message : "模型连接失败。";
    Notify.create({
      type: "negative",
      message: testMessage.value,
      position: "top",
    });
  } finally {
    testing.value = false;
  }
}

async function clearSavedApiKey() {
  saving.value = true;
  try {
    const result = await adminRequest<{ configuration: ModelConfiguration }>(
      "/settings/ai-model",
      {
        method: "PUT",
        body: JSON.stringify({
          ...form.value,
          apiKey: "",
          clearApiKey: true,
          enabled: false,
        }),
      },
    );
    applyConfiguration(result.configuration);
    Notify.create({
      type: "positive",
      message: "已清除模型 API 密钥，并停用模型。",
      position: "top",
    });
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "清除模型密钥失败。",
      position: "top",
    });
  } finally {
    saving.value = false;
  }
}

onMounted(() => void loadConfiguration());
</script>

<style lang="scss" scoped>
.ai-model-panel {
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

  h2,
  h3 {
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

.model-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.model-message {
  margin-top: 18px;
  font-size: 12px;
}

.model-message--warning {
  background: #fff4df;
  color: #805500;
}

.model-message--info {
  background: #edf4fb;
  color: #405875;
}

.model-message--error,
.model-test-result--error {
  background: #fff0f1;
  color: #a92a3c;
}

.model-loading,
.model-test-result,
.model-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.model-loading {
  color: var(--admin-muted-text);
}

.model-test-result {
  margin-top: 16px;
  color: #23764a;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.model-actions {
  margin-top: 20px;
}

.provider-card {
  h3 {
    margin: 0 0 10px;
    color: var(--admin-text);
    font-size: 15px;
  }

  p {
    margin: 8px 0 0;
    color: var(--admin-muted-text);
    font-size: 12px;
    line-height: 1.7;
  }
}

@media (max-width: 720px) {
  .settings-card {
    padding: 18px 14px;
  }

  .model-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .model-actions {
    flex-wrap: wrap;
  }
}
</style>
