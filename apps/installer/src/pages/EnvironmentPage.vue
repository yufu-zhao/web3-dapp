<template>
  <section class="step-content">
    <ContentHeading
      title="环境检查"
      kicker="步骤 01 · ENVIRONMENT CHECK"
      :icon="{ icon: 'monitor_heart', color: 'blue-1', textColor: 'blue-9' }"
    />
    <p class="content-description">
      确认安装服务和 Node.js 运行环境可用，然后进入数据库初始化。
    </p>
    <q-linear-progress
      v-if="flow.bootstrapping"
      indeterminate
      color="primary"
      class="loading-bar"
    />
    <div v-if="flow.environment" class="check-list">
      <div v-for="item in checks" :key="item.label" class="check-row">
        <div class="check-symbol" :class="item.ok ? 'passed' : 'failed'">
          <q-icon :name="item.ok ? 'check' : 'close'" size="17px" />
        </div>
        <div class="check-copy">
          <strong>{{ item.label }}</strong
          ><span>{{ item.detail }}</span>
        </div>
        <span class="check-status" :class="item.ok ? 'passed' : 'failed'">{{
          item.ok ? "通过" : "未通过"
        }}</span>
      </div>
    </div>
    <q-banner v-else class="message-banner error-message">
      <template #avatar><q-icon name="error_outline" /></template
      >{{ flow.environmentError || "正在读取安装环境…" }}
    </q-banner>
    <q-banner
      v-if="flow.environmentError && flow.environment"
      class="message-banner error-message"
    >
      <template #avatar><q-icon name="error_outline" /></template
      >{{ flow.environmentError }}
    </q-banner>
    <div class="actions-row">
      <q-btn
        outline
        color="dark"
        icon="refresh"
        label="重新检查"
        :loading="checking"
        unelevated
        @click="checkEnvironment"
      /><q-btn
        color="primary"
        icon-right="arrow_forward"
        label="继续配置数据库"
        unelevated
        :disable="!flow.environmentReady"
        @click="router.push('/database')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { installerRequest } from "../services/installer-api";
import ContentHeading from "../components/ContentHeading.vue";
import {
  errorMessage,
  installerFlow,
  type InstallerEnvironment,
} from "../services/installer-flow";

const router = useRouter();
const flow = installerFlow;
const checking = ref(false);
const checks = computed(() => {
  const environment = flow.environment;
  if (!environment) return [];
  return [
    {
      label: "安装服务",
      detail: `${environment.service} 服务已响应`,
      ok: environment.status === "ok",
    },
    {
      label: "Node.js 版本",
      detail: `当前 ${environment.nodeVersion} · 要求 ${environment.requiredNode}`,
      ok: environment.nodeSupported,
    },
    {
      label: "运行平台",
      detail: `${environment.platform} · ${environment.architecture}`,
      ok: true,
    },
  ];
});

async function checkEnvironment() {
  checking.value = true;
  flow.environmentError = "";
  try {
    flow.environment =
      await installerRequest<InstallerEnvironment>("/environment");
    flow.environmentReady =
      flow.environment.status === "ok" && flow.environment.nodeSupported;
    if (!flow.environmentReady)
      flow.environmentError = "运行环境版本不符合安装要求。";
  } catch (error) {
    flow.environmentReady = false;
    flow.environmentError = errorMessage(error);
  } finally {
    checking.value = false;
  }
}

onMounted(() => {
  if (!flow.environment) void checkEnvironment();
});
</script>

<style lang="scss" scoped>
.step-content {
  margin: 0 auto;
  padding: 34px 30px 40px;
}
.content-heading {
  display: flex;
  align-items: center;
  gap: 14px;
}
.step-icon {
  display: grid;
  width: 48px;
  height: 48px;
  border-radius: 15px;
  place-items: center;
}
.environment-icon {
  background: #e9f3ff;
  color: #1769aa;
}
.content-kicker {
  margin: 0 0 4px;
  color: #9aa3b1;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
h2 {
  margin: 0;
  color: #172033;
  font-size: 28px;
}
.content-description {
  margin: 20px 0 24px;
  color: #667085;
  line-height: 1.7;
}
.loading-bar {
  margin-bottom: 15px;
}
.check-list {
  display: grid;
  gap: 10px;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid #e8edf2;
  border-radius: 14px;
}
.check-symbol {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 50%;
  place-items: center;
}
.check-symbol.passed {
  background: #e9f8ef;
  color: #23824c;
}
.check-symbol.failed {
  background: #fff0ed;
  color: #b42318;
}
.check-copy {
  display: grid;
  flex: 1;
  gap: 5px;
}
.check-copy strong {
  color: #344054;
  font-size: 13px;
}
.check-copy span {
  color: #758094;
  font-size: 12px;
}
.check-status {
  font-size: 11px;
  font-weight: 700;
}
.check-status.passed {
  color: #23824c;
}
.check-status.failed {
  color: #b42318;
}
.message-banner {
  margin-top: 16px;
  border-radius: 13px;
}
.error-message {
  background: #fff0ed;
  color: #a33322;
}
.actions-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 25px;
}
@media (max-width: 650px) {
  .step-content {
    padding: 25px 17px 30px;
  }
  h2 {
    font-size: 24px;
  }
  .actions-row {
    flex-direction: column-reverse;
  }
  .actions-row :deep(.q-btn) {
    width: 100%;
  }
}
</style>
