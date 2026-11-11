<template>
  <div class="limit-settings">
    <q-banner v-if="error" rounded class="warning-banner">
      <template #avatar><q-icon name="error_outline" /></template>
      {{ error }}
      <template #action>
        <q-btn flat label="重试" @click="load" />
      </template>
    </q-banner>

    <section class="settings-card">
      <header class="settings-heading">
        <span class="settings-icon"><q-icon name="swap_horiz" /></span>
        <div>
          <h2>限价单执行设置</h2>
          <p>滑点用于市价报价与最低到账量估算；限价单价格和最低到账量由用户输入后签名确认。</p>
        </div>
      </header>
      <div v-if="loading" class="settings-loading">
        <q-spinner-dots color="primary" size="30px" />
        <span>正在读取执行器状态</span>
      </div>
      <template v-else-if="snapshot">
        <q-form class="settings-form" @submit.prevent="save">
          <div class="settings-grid">
            <q-input
              v-model.number="slippageBps"
              outlined
              dense
              type="number"
              label="市价最大滑点"
              suffix="bps"
              min="1"
              max="500"
              step="1"
              hint="1 至 500 bps（0.01% 至 5%）"
              :readonly="!canWrite"
              :rules="[(value) => (Number.isInteger(value) && value >= 1 && value <= 500) || '请输入 1 至 500 的整数']"
            />
            <q-input
              :model-value="'30 分钟（固定）'"
              outlined
              dense
              label="限价单有效期"
              readonly
              hint="合约常量，不支持后台修改"
            />
          </div>
          <div v-if="canWrite" class="settings-actions">
            <q-btn color="primary" unelevated icon="save" label="保存滑点设置" type="submit" :loading="saving" />
          </div>
        </q-form>
      </template>
    </section>

    <section v-if="snapshot" class="settings-card">
      <header class="settings-heading">
        <span class="settings-icon"><q-icon name="monitor_heart" /></span>
        <div>
          <h2>链上服务状态</h2>
          <p>执行器只使用服务端环境变量中的专用钱包支付 Gas；私钥不会保存到数据库。</p>
        </div>
        <q-btn flat round dense icon="refresh" aria-label="刷新限价单状态" :loading="refreshing" @click="load">
          <q-tooltip>刷新状态</q-tooltip>
        </q-btn>
      </header>
      <div class="service-status-grid">
        <article class="service-status">
          <span>自动执行器</span>
          <strong>{{ stateLabel(snapshot.executor?.state) }}</strong>
          <small v-if="snapshot.executor?.native_balance">Gas 余额：{{ snapshot.executor.native_balance }} wei</small>
          <small v-if="snapshot.executor?.last_attempt_at">
            最近执行：{{ formatTime(snapshot.executor.last_attempt_at) }}
          </small>
          <small v-if="snapshot.executor?.last_transaction_hash" class="mono">
            {{ snapshot.executor.last_transaction_hash }}
          </small>
          <small v-if="snapshot.executor?.last_error" class="status-error">{{ snapshot.executor.last_error }}</small>
        </article>
        <article class="service-status">
          <span>行情索引器</span>
          <strong>{{ stateLabel(snapshot.indexer?.state) }}</strong>
          <small v-if="snapshot.indexer?.last_block">已同步区块：{{ snapshot.indexer.last_block }}</small>
          <small v-if="snapshot.indexer?.last_error" class="status-error">{{ snapshot.indexer.last_error }}</small>
        </article>
      </div>
      <q-banner v-if="!canWrite" rounded class="readonly-banner q-mt-md">
        <template #avatar><q-icon name="visibility" /></template>
        当前角色只有查看系统设置的权限。
      </q-banner>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Notify } from "quasar";
import { adminRequest } from "../services/admin-api";
import { canAccess } from "../services/admin-session";

interface ServiceStatus {
  state?: string;
  native_balance?: string | null;
  last_block?: string | null;
  last_attempt_at?: string | null;
  last_transaction_hash?: string | null;
  last_error?: string | null;
}
interface Snapshot {
  settings: { slippage_bps: number } | null;
  executor: ServiceStatus | null;
  indexer: ServiceStatus | null;
}

const canWrite = computed(() => canAccess("settings:update"));
const loading = ref(true);
const refreshing = ref(false);
const saving = ref(false);
const error = ref("");
const slippageBps = ref(100);
const snapshot = ref<Snapshot | null>(null);

// 加载后台执行参数及服务端公开运行状态，不读取或回显钱包私钥。
async function load() {
  refreshing.value = true;
  error.value = "";
  try {
    const result = await adminRequest<Snapshot>("/trading/limit-orders");
    snapshot.value = result;
    slippageBps.value = result.settings?.slippage_bps ?? 100;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "限价单状态读取失败。";
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function save() {
  if (!canWrite.value) return;
  saving.value = true;
  try {
    snapshot.value = await adminRequest<Snapshot>("/trading/limit-orders/slippage", {
      method: "PUT",
      body: JSON.stringify({ slippageBps: slippageBps.value }),
    });
    Notify.create({ type: "positive", message: "限价单滑点设置已保存。", position: "top" });
  } catch (reason) {
    Notify.create({
      type: "negative",
      message: reason instanceof Error ? reason.message : "滑点设置保存失败。",
      position: "top",
    });
  } finally {
    saving.value = false;
  }
}

function stateLabel(state?: string) {
  return (
    ({ disabled: "未启用", ready: "正常", degraded: "需处理", error: "异常" } as Record<string, string>)[state ?? ""] ??
    "未知"
  );
}

function formatTime(value: string) {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? value : time.toLocaleString();
}

onMounted(() => void load());
</script>

<style lang="scss" scoped>
.limit-settings {
  display: grid;
  gap: 20px;
}

.settings-card {
  padding: 24px;
  border: 1px solid var(--admin-border);
  border-radius: 16px;
  background: var(--admin-surface);
  box-shadow: 0 10px 28px rgba(23, 43, 77, 0.05);
}

.settings-form {
  display: grid;
  gap: 20px;
}

.settings-heading {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 20px;

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
  background: color-mix(in srgb, var(--admin-primary) 22%, var(--admin-surface));
  color: var(--admin-primary);
  font-size: 21px;
  place-items: center;
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
}

.readonly-banner {
  background: #eef3f8;
  color: #526177;
}

.warning-banner {
  background: #fff2e2;
  color: #70470b;
}

.service-status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.service-status {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--admin-border, #d9e1ef);
  border-radius: 14px;
  background: var(--admin-surface, #fff);

  span,
  small {
    color: var(--admin-muted-text, #63718a);
  }

  strong {
    color: var(--admin-text, #17243b);
    font-size: 18px;
  }

  .mono {
    overflow-wrap: anywhere;
    font-family: monospace;
  }

  .status-error {
    color: var(--q-negative);
  }
}

@media (max-width: 720px) {
  .settings-card {
    padding: 18px;
  }

  .settings-grid {
    grid-template-columns: 1fr;
  }

  .service-status-grid {
    grid-template-columns: 1fr;
  }
}
</style>
