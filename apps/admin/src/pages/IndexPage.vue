<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page class="page-shell flex flex-center">
        <main class="starter-card">
          <!-- prettier-ignore -->
          <img
            class="brand-mark"
            src="/brand/chainforge-mark.png"
            alt=""
            aria-hidden="true"
          >
          <p class="eyebrow">链构（ChainForge）</p>
          <h1>管理后台</h1>
          <p class="description">
            {{ systemName }} · {{ tokenName }}（{{ tokenSymbol }}） ·
            {{ chainLabel }}
          </p>
          <p
            class="installation-state"
            :class="{
              'is-error': Boolean(configError),
              'is-ready': installationStatus === 'ready',
            }"
          >
            {{ statusMessage }}
          </p>
          <q-badge :color="statusColor" text-color="dark" class="status-badge">
            <q-icon :name="statusIcon" size="16px" class="q-mr-xs" />
            {{ statusLabel }}
          </q-badge>
        </main>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  loadPublicInstallationConfig,
  type PublicInstallationConfig,
} from "@chainforge/shared-types";

const identity = ref<PublicInstallationConfig | null>(null);
const configError = ref("");
const installationStatus = computed(
  () => identity.value?.installationStatus ?? null,
);
const systemName = computed(() => identity.value?.systemName || "链构");
const tokenName = computed(() => identity.value?.tokenName || "项目代币");
const tokenSymbol = computed(() => identity.value?.tokenSymbol || "TOKEN");
const chainLabel = computed(() =>
  installationStatus.value === "ready" && identity.value?.chainId
    ? `ChainId ${identity.value.chainId}`
    : installationStatus.value === "deployment_pending"
      ? "等待合约与链上配置完成"
      : installationStatus.value === "not_initialized"
        ? "尚未完成安装"
        : "正在读取安装状态",
);
const statusColor = computed(() => {
  if (configError.value) return "negative";
  if (installationStatus.value === "ready") return "positive";
  return installationStatus.value ? "warning" : "info";
});
const statusIcon = computed(() => {
  if (configError.value) return "error_outline";
  if (installationStatus.value === "ready") return "check_circle";
  return installationStatus.value ? "pending" : "sync";
});
const statusLabel = computed(() => {
  if (configError.value) return "状态不可用";
  if (installationStatus.value === "ready") return "已完成安装";
  if (installationStatus.value === "deployment_pending") return "等待部署";
  if (installationStatus.value === "not_initialized") return "待初始化";
  return "正在检查";
});
const statusMessage = computed(() => {
  if (configError.value) return `安装状态读取失败：${configError.value}`;
  if (installationStatus.value === "ready") {
    return "数据库、合约与链上配置均已完成并核验。";
  }
  if (installationStatus.value === "deployment_pending") {
    return "数据库已初始化，需在安装器中完成合约部署与链上配置。";
  }
  if (installationStatus.value === "not_initialized") {
    return "系统尚未初始化，请先运行链构安装器。";
  }
  return "正在读取系统安装状态。";
});

// 页面标题展示产品品牌，安装实例名称保留在页面摘要中。
document.title = "链构（ChainForge）管理后台";

onMounted(async () => {
  try {
    identity.value = await loadPublicInstallationConfig();
  } catch (error) {
    configError.value =
      error instanceof Error ? error.message : "无法读取安装身份配置。";
  }
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
  object-fit: cover;
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
  font-size: clamp(28px, 6vw, 40px);
  font-weight: 700;
}

.description {
  margin: 14px 0 24px;
  color: #cbd5e1;
  line-height: 1.7;
}

.installation-state {
  margin: 0;
  color: #fbbf24;
  font-size: 12px;
  line-height: 1.6;
}

.installation-state.is-ready {
  color: #a7f3d0;
}

.installation-state.is-error {
  color: #fca5a5;
}

.status-badge {
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}
</style>
