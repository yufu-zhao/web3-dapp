<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page class="page-shell flex flex-center">
        <main
          class="starter-card"
          aria-live="polite"
          :aria-busy="state === 'loading'"
        >
          <div class="brand-mark" aria-hidden="true">{{ brandMark }}</div>

          <template v-if="state === 'loading'">
            <p class="eyebrow">系统初始化检查</p>
            <h1>正在检查系统状态</h1>
            <p class="description">正在连接业务 API 并读取安装状态，请稍候。</p>
            <q-spinner-dots color="primary" size="36px" aria-label="正在加载" />
          </template>

          <template v-else-if="state === 'ready'">
            <p class="eyebrow">{{ systemName }}</p>
            <h1>管理后台</h1>
            <p class="description">
              {{ systemName }} · {{ tokenName }}（{{ tokenSymbol }}） ·
              {{ chainLabel }}
            </p>
            <q-badge color="positive" text-color="dark" class="status-badge">
              <q-icon name="check_circle" size="16px" class="q-mr-xs" />
              初始化完成，管理台已就绪
            </q-badge>
          </template>

          <template v-else-if="state === 'uninitialized'">
            <q-icon
              class="state-icon"
              name="settings_suggest"
              color="primary"
              aria-hidden="true"
            />
            <p class="eyebrow">首次运行</p>
            <h1>系统尚未初始化</h1>
            <p class="description">
              请先通过可视化安装器连接
              PostgreSQL，并完成核心数据与首位管理员初始化。完成后返回此页重新检查。
            </p>
            <q-btn
              color="primary"
              text-color="dark"
              label="重新检查"
              icon="refresh"
              unelevated
              :loading="checking"
              @click="checkInitialization"
            />
          </template>

          <template v-else-if="state === 'incomplete'">
            <q-icon
              class="state-icon"
              name="warning_amber"
              color="warning"
              aria-hidden="true"
            />
            <p class="eyebrow">需要完成配置</p>
            <h1>安装配置未完成</h1>
            <p class="description">
              数据库已有初始化记录，但系统身份配置不完整。请返回安装器的数据库连接步骤补全配置，再重新检查。
            </p>
            <q-btn
              color="primary"
              text-color="dark"
              label="重新检查"
              icon="refresh"
              unelevated
              :loading="checking"
              @click="checkInitialization"
            />
          </template>

          <template v-else-if="state === 'migration-required'">
            <q-icon
              class="state-icon"
              name="system_update_alt"
              color="warning"
              aria-hidden="true"
            />
            <p class="eyebrow">数据库升级</p>
            <h1>管理后台数据库尚未升级</h1>
            <p class="description">
              当前安装记录有效，但管理端菜单、首页内容、私募记录和用户端语言所需数据库迁移尚未应用。请在本机安装器的数据库连接页点击“应用待执行迁移”，完成后返回此页重新检查。
            </p>
            <q-btn
              color="primary"
              text-color="dark"
              label="重新检查"
              icon="refresh"
              unelevated
              :loading="checking"
              @click="checkInitialization"
            />
          </template>

          <template v-else>
            <q-icon
              class="state-icon"
              name="cloud_off"
              color="warning"
              aria-hidden="true"
            />
            <p class="eyebrow">连接问题</p>
            <h1>暂时无法读取系统状态</h1>
            <p class="description config-error">
              {{ configError || "请检查业务 API 与数据库连接后重试。" }}
            </p>
            <q-btn
              color="primary"
              text-color="dark"
              label="重试"
              icon="refresh"
              unelevated
              :loading="checking"
              @click="checkInitialization"
            />
          </template>
        </main>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  loadAdminInitializationStatus,
  type AdminInitializationStatus,
  type PublicInstallationConfig,
} from "@chainforge/shared-types";

type InitializationState =
  AdminInitializationStatus["state"] | "loading" | "error";

const state = ref<InitializationState>("loading");
const identity = ref<PublicInstallationConfig | null>(null);
const checking = ref(false);
const configError = ref("");
const installationStatus = computed(
  () => identity.value?.installationStatus ?? null,
);
const systemName = computed(() => identity.value?.systemName || "链构");
// 管理台品牌标记跟随安装配置中的系统名称首字。
const brandMark = computed(() => systemName.value.slice(0, 1) || "链");
const tokenName = computed(() => identity.value?.tokenName || "项目代币");
const tokenSymbol = computed(() => identity.value?.tokenSymbol || "TOKEN");
const chainLabel = computed(() =>
  installationStatus.value === "ready" && identity.value?.chainId
    ? `ChainId ${identity.value.chainId}`
    : "目标链将在首次完整部署后锁定",
);

watch(
  systemName,
  (value) => {
    document.title = `${value} 管理后台`;
  },
  { immediate: true },
);

// 按初始化状态选择管理端首屏；API 或数据库故障单独显示重试提示。
async function checkInitialization() {
  checking.value = true;
  configError.value = "";
  try {
    const result = await loadAdminInitializationStatus();
    state.value = result.state;
    identity.value = result.state === "ready" ? result.installation : null;
  } catch (error) {
    state.value = "error";
    configError.value =
      error instanceof Error ? error.message : "无法读取安装状态，请稍后重试。";
  } finally {
    checking.value = false;
  }
}

onMounted(() => {
  void checkInitialization();
});
</script>

<style lang="scss" scoped>
.page-shell {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(
      circle at 18% 15%,
      rgba(255, 200, 50, 0.12),
      transparent 32%
    ),
    radial-gradient(
      circle at 84% 86%,
      rgba(52, 211, 153, 0.08),
      transparent 30%
    ),
    #111827;
}

.starter-card {
  width: min(100%, 560px);
  padding: clamp(28px, 7vw, 56px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px;
  background: rgba(17, 24, 39, 0.86);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
  text-align: center;
}

.brand-mark {
  display: block;
  width: 56px;
  height: 56px;
  margin: 0 auto 24px;
  border-radius: 18px;
  background: #ffc832;
  color: #111827;
  font-size: 18px;
  font-weight: 800;
  place-items: center;
}

.state-icon {
  margin-bottom: 10px;
  font-size: 36px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #ffc832;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(26px, 6vw, 40px);
  font-weight: 700;
  line-height: 1.25;
}

.description {
  margin: 14px 0 24px;
  color: #cbd5e1;
  line-height: 1.7;
}

.config-error {
  color: #fcd34d;
  overflow-wrap: anywhere;
}

.status-badge {
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}
</style>
