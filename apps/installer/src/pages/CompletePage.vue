<template>
  <section class="step-content complete-step">
    <div v-if="loading" class="loading-state">
      <q-spinner-dots size="36px" color="primary" /><span
        >正在读取安装与部署资料…</span
      >
    </div>
    <q-banner v-else-if="loadError" class="message-banner error-message">
      <template #avatar><q-icon name="error_outline" /></template
      >{{ loadError }}
    </q-banner>
    <template v-else-if="deployment">
      <div class="complete-hero">
        <div class="complete-check"><q-icon name="check" size="34px" /></div>
        <p class="content-kicker">步骤 04 · 安装完成</p>
        <h2>部署资料已准备完成</h2>
        <p>
          本页包含数据库、首位管理员、钱包网络、链上部署结果和资料输出位置。
        </p>
      </div>
      <div class="summary-grid">
        <InstallerCard tag="article" class="summary-card">
          <span class="summary-icon"><q-icon name="dns" /></span>
          <div>
            <small>数据库</small
            ><strong>{{ summary.database || "PostgreSQL" }}</strong
            ><span
              >{{ summary.databaseConnection?.host ?? "本机配置" }}:{{
                summary.databaseConnection?.port ?? ""
              }}
              · 用户 {{ summary.databaseConnection?.username ?? "—" }}</span
            >
          </div>
        </InstallerCard>
        <InstallerCard tag="article" class="summary-card">
          <span class="summary-icon"
            ><q-icon name="admin_panel_settings"
          /></span>
          <div>
            <small>首位管理员</small
            ><strong>{{ summary.administrator || "已初始化" }}</strong
            ><span>角色：超级管理员</span>
          </div>
        </InstallerCard>
        <InstallerCard tag="article" class="summary-card">
          <span class="summary-icon"><q-icon name="qr_code_2" /></span>
          <div>
            <small>Reown AppKit</small
            ><strong>{{
              summary.walletConnectConfigured ? "已配置" : "未配置"
            }}</strong
            ><span>Project ID 从根目录 .env 加载，供三个前端共享</span>
          </div>
        </InstallerCard>
        <InstallerCard tag="article" class="summary-card">
          <span class="summary-icon"
            ><q-icon name="account_balance_wallet"
          /></span>
          <div>
            <small>部署网络</small
            ><strong>ChainId {{ deployment.chainId }}</strong
            ><span>部署者 {{ deployment.deployer }}</span>
          </div>
        </InstallerCard>
        <InstallerCard tag="article" class="summary-card">
          <span class="summary-icon"><q-icon name="schedule" /></span>
          <div>
            <small>完成时间</small
            ><strong>{{ formatDate(deployment.completedAt) }}</strong
            ><span>合约包版本 {{ deployment.releaseVersion }}</span>
          </div>
        </InstallerCard>
        <InstallerCard tag="article" class="summary-card">
          <span class="summary-icon"><q-icon name="badge" /></span>
          <div>
            <small>系统与代币身份</small>
            <strong>{{ deploymentIdentity.systemName || "链构" }}</strong>
            <span
              >{{ deploymentIdentity.tokenName || "项目代币" }} ·
              {{ deploymentIdentity.tokenSymbol || "TOKEN" }}</span
            >
          </div>
        </InstallerCard>
        <InstallerCard tag="article" class="summary-card">
          <span class="summary-icon"><q-icon name="terminal" /></span>
          <div>
            <small>安装运行环境</small
            ><strong>Node.js {{ environment?.nodeVersion ?? "—" }}</strong
            ><span
              >{{ environment?.platform ?? "" }} ·
              {{ environment?.architecture ?? "" }}</span
            >
          </div>
        </InstallerCard>
      </div>

      <InstallerCard class="policy-card">
        <div class="section-title">
          <strong>管理员密码策略</strong><small>已保存到 system_configs</small>
        </div>
        <span>最少 {{ summary.passwordPolicy?.minimumLength ?? 12 }} 位</span
        ><span>{{ policyLabels }}</span>
      </InstallerCard>

      <InstallerCard class="deployment-config">
        <div class="section-title">
          <strong>本次部署参数</strong><small>与完整部署资料 JSON 一致</small>
        </div>
        <div
          v-for="item in configurationRows"
          :key="item.label"
          class="configuration-row"
        >
          <strong>{{ item.label }}</strong
          ><code>{{ item.value }}</code>
        </div>
      </InstallerCard>

      <InstallerCard class="contract-summary">
        <div class="section-title">
          <strong>本次链上部署与配置</strong
          ><small
            >{{
              deployment.steps.filter((step) => step.status === "success")
                .length
            }}
            步均已成功</small
          >
        </div>
        <article
          v-for="entry in contractEntries"
          :key="entry.nodeId"
          class="contract-row"
        >
          <div>
            <strong>{{ entry.contractName }}</strong
            ><small>{{ entry.source ?? "链上部署" }}</small>
          </div>
          <div class="contract-meta">
            <code>地址 {{ entry.address }}</code
            ><code v-if="entry.transactionHash"
              >交易 {{ entry.transactionHash }}</code
            ><span v-else>由 {{ entry.source }} 读取，无单独部署交易</span>
          </div>
        </article>
        <article v-for="step in actionSteps" :key="step.id" class="action-row">
          <span class="success-check"><q-icon name="check" /></span>
          <div>
            <strong>{{ step.title }}</strong
            ><code v-if="step.transactionHash">{{ step.transactionHash }}</code
            ><span v-else>{{ step.result || "只读核验完成" }}</span>
          </div>
        </article>
      </InstallerCard>

      <q-banner class="message-banner info-message">
        <template #avatar><q-icon name="folder_open" /></template>
        <div>
          <strong>部署资料输出位置</strong><br /><code>{{
            deployment.outputPath
          }}</code
          ><br />同链支付 Token 列表：contracts/deploy/{{
            deployment.chainId
          }}/tokens.json
        </div>
      </q-banner>
      <q-banner
        v-if="summary.settingsSaved"
        class="message-banner success-message"
      >
        <template #avatar><q-icon name="save" /></template>数据库连接信息已写入
        workspace 的 .env 文件。
      </q-banner>
      <q-banner v-else class="message-banner warning-message">
        <template #avatar><q-icon name="info" /></template>数据库已初始化，但
        .env 未能保存连接信息。请检查安装服务的文件写入权限。
      </q-banner>
      <div class="actions-row">
        <q-btn
          flat
          color="dark"
          icon="arrow_back"
          label="返回部署摘要"
          @click="router.push('/deploy')"
        />
        <div class="complete-actions">
          <q-btn
            outline
            color="dark"
            icon="download"
            label="导出部署 JSON"
            @click="downloadDeployment"
          />
          <q-btn
            color="primary"
            unelevated
            icon="done_all"
            label="完成安装"
            :loading="finishing"
            @click="completeInstallation"
          />
        </div>
      </div>
      <q-banner v-if="finished" class="message-banner success-message">
        <template #avatar><q-icon name="task_alt" /></template
        >安装摘要已确认，ChainId、部署 ID 和合约地址已写入
        runtime_contract_binding。部署资料保存在上述 contracts/deploy 目录中。
      </q-banner>
      <q-banner v-if="finishError" class="message-banner error-message">
        <template #avatar><q-icon name="error_outline" /></template>
        {{ finishError }}
      </q-banner>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  installerRequest,
  type SavedDeployment,
} from "../services/installer-api";
import {
  errorMessage,
  installerFlow,
  type InstallerEnvironment,
} from "../services/installer-flow";
import InstallerCard from "../components/InstallerCard.vue";

const route = useRoute();
const router = useRouter();
const flow = installerFlow;
const deployment = ref<SavedDeployment | null>(null);
const environment = ref<InstallerEnvironment | null>(flow.environment);
const loading = ref(true);
const loadError = ref("");
const finished = ref(false);
const finishing = ref(false);
const finishError = ref("");
const summary = computed(() => flow.summary);
const contractEntries = computed(() =>
  Object.values(deployment.value?.contracts ?? {}).sort((left, right) =>
    String(left.nodeId).localeCompare(String(right.nodeId)),
  ),
);
const actionSteps = computed(() =>
  (deployment.value?.steps ?? []).filter(
    (step) => !deployment.value?.contracts?.[step.id],
  ),
);
const configurationRows = computed(() => {
  const configuration = deployment.value?.configuration ?? {};
  const external = readObject(configuration.externalAddresses);
  const roles = readObject(configuration.roleWallets);
  const assets = readObject(configuration.assetWallets);
  const oracle = readObject(configuration.oracle);
  const identity = readObject(configuration.installation);
  return [
    { label: "系统名称", value: identity.systemName },
    {
      label: "代币全称 / 简称",
      value: `${identity.tokenName ?? "—"} / ${identity.tokenSymbol ?? "—"}`,
    },
    { label: "安装目标 ChainId", value: identity.chainId },
    { label: "Router", value: external.router },
    { label: "Factory", value: external.factory },
    { label: "支付 Token", value: external.paymentToken },
    {
      label: "角色钱包",
      value: Object.entries(roles)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" · "),
    },
    {
      label: "资产钱包",
      value: Object.entries(assets)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" · "),
    },
    {
      label: "Oracle 参数",
      value: `采样 ${String(oracle.samplePeriodSeconds ?? "—")} 秒 · 最低支付储备 ${String(oracle.minimumPaymentReserve ?? "—")} Token 单位（${String(oracle.minimumPaymentReserveRaw ?? "—")} 链上整数）`,
    },
  ].map((item) => ({ label: item.label, value: String(item.value ?? "—") }));
});
const deploymentIdentity = computed(() =>
  readObject(deployment.value?.configuration?.installation),
);
const policyLabels = computed(() => {
  const policy = summary.value.passwordPolicy;
  if (!policy) return "大写、小写、数字、特殊字符";
  return (
    [
      [policy.requireUppercase, "大写字母"],
      [policy.requireLowercase, "小写字母"],
      [policy.requireNumber, "数字"],
      [policy.requireSymbol, "特殊字符"],
    ]
      .filter(([enabled]) => enabled)
      .map(([, label]) => label)
      .join("、") || "未额外要求字符类型"
  );
});

function formatDate(value?: string) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function loadDeployment() {
  loading.value = true;
  loadError.value = "";
  try {
    const id = String(route.params.deploymentId ?? "");
    if (flow.selectedDeployment?.deploymentId === id)
      deployment.value = flow.selectedDeployment;
    else {
      const chainId = Number(route.query.chainId);
      if (!Number.isSafeInteger(chainId) || chainId <= 0)
        throw new Error("部署资料缺少 ChainId。");
      deployment.value = await installerRequest<SavedDeployment>(
        `/contracts/deployments/${chainId}/${encodeURIComponent(id)}`,
      );
      flow.selectedDeployment = deployment.value;
    }
    environment.value ??=
      await installerRequest<InstallerEnvironment>("/environment");
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
}

function downloadDeployment() {
  if (!deployment.value) return;
  const blob = new Blob([JSON.stringify(deployment.value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `chainforge-deployment-${deployment.value.chainId}-${deployment.value.deploymentId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function completeInstallation() {
  if (!deployment.value || finishing.value) return;
  finishing.value = true;
  finishError.value = "";
  try {
    await installerRequest(
      `/contracts/deployments/${deployment.value.chainId}/${encodeURIComponent(deployment.value.deploymentId)}/activate`,
      { method: "POST", body: "{}" },
    );
    finished.value = true;
  } catch (error) {
    finishError.value = errorMessage(error);
  } finally {
    finishing.value = false;
  }
}

onMounted(() => {
  void loadDeployment();
});
</script>

<style lang="scss" scoped>
.step-content {
  width: min(1040px, 100%);
  margin: 0 auto;
  padding: 33px 40px 40px;
}
.loading-state {
  display: grid;
  min-height: 300px;
  place-items: center;
  align-content: center;
  gap: 12px;
  color: #748094;
  font-size: 12px;
}
.complete-hero {
  display: grid;
  justify-items: center;
  margin-bottom: 24px;
  text-align: center;
}
.complete-check {
  display: grid;
  width: 62px;
  height: 62px;
  margin-bottom: 16px;
  border-radius: 50%;
  background: #e8f7ed;
  color: #21804b;
  place-items: center;
}
.content-kicker {
  margin: 0 0 7px;
  color: #9aa3b1;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.15em;
}
.complete-hero h2 {
  margin: 0 0 8px;
  color: #172033;
  font-size: 27px;
}
.complete-hero p:last-child {
  max-width: 600px;
  margin: 0;
  color: #718096;
  font-size: 12px;
  line-height: 1.7;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.summary-card {
  display: flex;
  min-width: 0;
  gap: 12px;
  padding: 14px;
}
.summary-icon {
  display: grid;
  width: 35px;
  height: 35px;
  flex: 0 0 auto;
  border-radius: 11px;
  background: #f0f3f7;
  color: #4c5b72;
  place-items: center;
}
.summary-card > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.summary-card small {
  color: #8792a2;
  font-size: 10px;
}
.summary-card strong {
  overflow-wrap: anywhere;
  color: #253044;
  font-size: 12px;
}
.summary-card span:last-child {
  overflow-wrap: anywhere;
  color: #748094;
  font-size: 10px;
  line-height: 1.5;
}
.policy-card,
.contract-summary,
.deployment-config {
  display: grid;
  gap: 11px;
  margin-top: 17px;
  padding: 16px;
}
.policy-card > span {
  color: #667085;
  font-size: 11px;
}
.section-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #344054;
  font-size: 12px;
}
.section-title small {
  color: #8994a4;
  font-size: 10px;
  font-weight: 500;
}
.contract-row {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid #edf0f3;
}
.contract-row > div:first-child {
  display: grid;
  align-content: start;
  gap: 4px;
}
.contract-row strong,
.action-row strong {
  color: #344054;
  font-size: 11px;
}
.contract-row small {
  color: #929baa;
  font-size: 9px;
}
.contract-meta {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.contract-meta code,
.action-row code {
  overflow-wrap: anywhere;
  color: #617084;
  font-size: 9px;
}
.contract-meta span,
.action-row span {
  color: #8792a2;
  font-size: 10px;
}
.action-row {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  padding-top: 9px;
  border-top: 1px solid #edf0f3;
}
.action-row > div {
  display: grid;
  gap: 4px;
}
.success-check {
  display: grid;
  width: 21px;
  height: 21px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #eaf8f0;
  color: #21804b;
  place-items: center;
}
.message-banner {
  margin-top: 14px;
  border-radius: 12px;
  line-height: 1.6;
}
.message-banner code {
  overflow-wrap: anywhere;
  font-size: 10px;
}
.info-message {
  background: #eef6ff;
  color: #205e92;
}
.success-message {
  background: #eaf8f0;
  color: #176b42;
}
.warning-message {
  background: #fff7df;
  color: #805800;
}
.error-message {
  background: #fff0ed;
  color: #a33322;
}
.actions-row,
.complete-actions {
  display: flex;
  gap: 10px;
}
.actions-row {
  justify-content: space-between;
  margin-top: 22px;
}
@media (max-width: 650px) {
  .step-content {
    padding: 24px 15px 30px;
  }
  .summary-grid {
    grid-template-columns: 1fr;
  }
  .contract-row {
    grid-template-columns: 1fr;
  }
  .actions-row,
  .complete-actions {
    flex-direction: column;
  }
  .actions-row :deep(.q-btn) {
    width: 100%;
  }
}
</style>
