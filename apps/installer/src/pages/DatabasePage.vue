<template>
  <section class="step-content">
    <ContentHeading
      title="数据库连接"
      kicker="步骤 02 · DATABASE CONNECTION"
      :icon="{ icon: 'lan', color: 'amber-1', textColor: 'amber-9' }"
    />
    <p class="content-description">
      输入 PostgreSQL
      连接信息。不存在的数据库会自动创建；已存在且非空时会先列出数据表并要求再次确认。
    </p>
    <q-banner
      v-if="flow.databaseReady && !reinitializeMode"
      class="message-banner success-message"
    >
      <template #avatar><q-icon name="task_alt" /></template>数据库
      {{ flow.summary.database }} 已初始化，管理员
      {{ flow.summary.administrator }} 已创建。
    </q-banner>
    <q-banner
      v-if="flow.databaseReady"
      class="message-banner info-message migration-banner"
    >
      <template #avatar><q-icon name="system_update_alt" /></template>
      检查并应用管理后台所需的数据库版本迁移。此操作仅允许在安装器本机执行。
      <template #action>
        <q-btn
          flat
          color="primary"
          label="应用待执行迁移"
          icon="system_update_alt"
          :loading="migrating"
          @click="applyPendingMigrations"
        />
      </template>
    </q-banner>
    <q-banner v-if="migrationResult" class="message-banner success-message">
      <template #avatar><q-icon name="task_alt" /></template>
      {{ migrationResult }}
    </q-banner>

    <InstallerCard class="form-section">
      <div class="form-section-title">
        <span>PostgreSQL 连接</span><small>凭据只提交给本机安装服务</small>
      </div>
      <div class="form-grid">
        <q-input
          v-model="flow.database.host"
          outlined
          dense
          label="数据库主机"
          placeholder="127.0.0.1"
          :disable="databaseFieldsDisabled"
        />
        <q-input
          v-model.number="flow.database.port"
          outlined
          dense
          type="number"
          label="端口"
          :disable="databaseFieldsDisabled"
        />
        <q-input
          v-model="flow.database.database"
          outlined
          dense
          label="数据库名称"
          placeholder="chainforge"
          :disable="databaseFieldsDisabled"
        />
        <q-input
          v-model="flow.database.username"
          outlined
          dense
          label="数据库用户"
          placeholder="postgres"
          :disable="databaseFieldsDisabled"
        />
        <q-input
          v-model="flow.database.password"
          outlined
          dense
          type="password"
          label="数据库密码"
          :disable="databaseFieldsDisabled"
        />
        <q-toggle
          v-model="flow.database.ssl"
          label="使用 TLS 连接"
          color="positive"
          :disable="databaseFieldsDisabled"
        />
      </div>
      <q-banner
        v-if="flow.databaseCheck"
        class="message-banner"
        :class="
          flow.databaseCheck.exists
            ? flow.databaseCheck.empty
              ? 'success-message'
              : 'warning-message'
            : 'info-message'
        "
      >
        <template #avatar>
          <q-icon
            :name="
              flow.databaseCheck.exists
                ? flow.databaseCheck.empty
                  ? 'check_circle'
                  : 'warning'
                : 'add_circle_outline'
            "
          />
        </template>
        <template v-if="!flow.databaseCheck.exists">
          目标库不存在；初始化时将自动创建。{{
            flow.databaseCheck.canCreateDatabase
              ? "当前用户有 CREATEDB 权限。"
              : "当前用户缺少 CREATEDB 权限。"
          }}
        </template>
        <template v-else-if="flow.databaseCheck.empty">
          已连接空数据库 {{ flow.databaseCheck.database }} ·
          {{ flow.databaseCheck.serverVersion }}
        </template>
        <template v-else>
          目标库已有
          {{ flow.databaseCheck.tableCount }}
          张用户表。确认后只新增缺失的核心表，不删除或覆盖已有数据。
        </template>
      </q-banner>
      <div v-if="flow.databaseCheck?.tables.length" class="table-list">
        <span v-for="table in flow.databaseCheck.tables" :key="table">{{
          table
        }}</span>
      </div>
      <q-banner v-if="flow.databaseError" class="message-banner error-message">
        <template #avatar><q-icon name="error_outline" /></template
        >{{ flow.databaseError }}
      </q-banner>
      <q-btn
        class="test-database-button"
        outline
        color="dark"
        icon="lan"
        label="测试数据库连接"
        :loading="checking"
        :disable="databaseFieldsDisabled"
        @click="testDatabase"
      />
    </InstallerCard>

    <InstallerCard class="form-section config-section">
      <div class="form-section-title">
        <span>初始配置</span
        ><small>ChainId 将在部署完成后从钱包读取并锁定</small>
      </div>
      <q-banner
        v-if="
          flow.databaseReady && !reinitializeMode && !flow.summary.installation
        "
        class="message-banner warning-message"
      >
        <template #avatar><q-icon name="lock_reset" /></template>
        这是已有安装的首次身份补录。保存后系统名称和代币信息不可通过安装器修改；目标
        ChainId 会在全部合约部署与链上核验成功后，从本次部署钱包读取并锁定。
      </q-banner>
      <div class="form-grid identity-grid">
        <q-input
          v-model="flow.installation.systemName"
          outlined
          dense
          maxlength="80"
          label="系统名称"
          hint="部署后显示在用户端和管理后台；安装器品牌固定为链构。"
          :disable="identityFieldsDisabled"
        />
        <q-input
          v-model="flow.installation.tokenName"
          outlined
          dense
          maxlength="80"
          label="代币全称"
          hint="写入 ERC-20 name()，部署后不可更改"
          :disable="identityFieldsDisabled"
        />
        <q-input
          v-model="flow.installation.tokenSymbol"
          outlined
          dense
          maxlength="16"
          label="代币简称"
          hint="仅允许字母、数字、点、下划线和短横线"
          :disable="identityFieldsDisabled"
        />
        <q-input
          v-model="flow.projectId"
          outlined
          dense
          label="WalletConnect project_id（可选）"
          hint="配置后钱包连接组件才会显示 WalletConnect。"
          :disable="databaseFieldsDisabled"
        />
      </div>
      <div class="policy-box">
        <strong>管理员密码策略</strong
        ><span>密码长度和字符要求会写入 system_configs。</span>
        <q-input
          v-model.number="flow.passwordPolicy.minimumLength"
          outlined
          dense
          type="number"
          label="最少密码长度"
          hint="请输入 8 到 128 之间的整数"
          min="8"
          max="128"
          step="1"
          :disable="databaseFieldsDisabled"
        />
        <div class="policy-options row">
          <q-checkbox
            v-model="flow.passwordPolicy.requireUppercase"
            label="包含大写字母"
            :disable="databaseFieldsDisabled"
            class="col-6 col-sm-3"
          />
          <q-checkbox
            v-model="flow.passwordPolicy.requireLowercase"
            label="包含小写字母"
            :disable="databaseFieldsDisabled"
            class="col-6 col-sm-3"
          />
          <q-checkbox
            v-model="flow.passwordPolicy.requireNumber"
            label="包含数字"
            :disable="databaseFieldsDisabled"
            class="col-6 col-sm-3"
          />
          <q-checkbox
            v-model="flow.passwordPolicy.requireSymbol"
            label="包含特殊字符"
            :disable="databaseFieldsDisabled"
            class="col-6 col-sm-3"
          />
        </div>
      </div>
    </InstallerCard>

    <InstallerCard class="form-section admin-section">
      <div class="form-section-title">
        <span>首位管理员</span><small>密码需满足上方策略，无需重复确认</small>
      </div>
      <div class="form-grid">
        <q-input
          v-model="flow.administrator.username"
          outlined
          dense
          label="管理员账号"
          placeholder="admin"
          :disable="databaseFieldsDisabled"
        />
        <q-input
          v-model="flow.administrator.password"
          outlined
          dense
          type="password"
          label="管理员密码"
          :disable="databaseFieldsDisabled"
        />
      </div>
    </InstallerCard>

    <div class="actions-row">
      <q-btn
        flat
        color="dark"
        icon="arrow_back"
        label="上一步"
        @click="router.push('/environment')"
      />
      <q-btn
        v-if="
          flow.databaseReady && !reinitializeMode && flow.summary.installation
        "
        color="primary"
        icon-right="arrow_forward"
        label="进入合约部署"
        unelevated
        @click="router.push('/deploy')"
      />
      <q-btn
        v-if="flow.databaseReady && !reinitializeMode"
        outline
        color="dark"
        icon="restart_alt"
        label="更换数据库并重新初始化"
        @click="beginReinitialize"
      />
      <q-btn
        v-if="reinitializeMode"
        flat
        color="dark"
        icon="close"
        label="取消更换"
        @click="cancelReinitialize"
      />
      <q-btn
        v-if="
          flow.databaseReady && !reinitializeMode && !flow.summary.installation
        "
        color="primary"
        icon="lock"
        label="保存并锁定安装身份"
        :loading="initializing"
        :disable="!canSaveInstallation"
        unelevated
        @click="saveInstallationIdentity"
      />
      <q-btn
        v-if="!flow.databaseReady || reinitializeMode"
        color="primary"
        icon="database"
        label="初始化数据库并创建管理员"
        :loading="initializing"
        :disable="!canInitialize"
        unelevated
        @click="initializeDatabase(false)"
      />
    </div>

    <q-dialog v-model="confirmExistingOpen" persistent>
      <q-card class="confirm-card">
        <q-card-section>
          <div class="confirm-title">
            <q-icon name="warning_amber" size="24px" />确认使用已有数据库
          </div>
          <p>
            将保留现有表和数据，仅补充缺失结构与配置项；已有同名配置会继续保留，不会被当前输入覆盖。若已存在管理员，安装服务会拒绝创建第二位管理员。
          </p>
          <div class="table-list dialog-tables">
            <span
              v-for="table in flow.databaseCheck?.tables ?? []"
              :key="table"
            >
              {{ table }}
            </span>
          </div>
        </q-card-section>
        <q-card-section align="right">
          <q-btn v-close-popup flat color="grey" label="返回检查" />
          <q-btn
            color="primary"
            label="确认继续初始化"
            unelevated
            :loading="initializing"
            @click="initializeDatabase(true)"
          />
        </q-card-section>
      </q-card>
    </q-dialog>
  </section>
</template>

<script setup lang="ts">
import ContentHeading from "../components/ContentHeading.vue";
import InstallerCard from "../components/InstallerCard.vue";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { postJson, type DatabaseCheck } from "../services/installer-api";
import {
  errorMessage,
  installerFlow,
  resetDatabaseCheck,
} from "../services/installer-flow";

const router = useRouter();
const flow = installerFlow;
const checking = ref(false);
const initializing = ref(false);
const migrating = ref(false);
const migrationResult = ref("");
const confirmExistingOpen = ref(false);
const reinitializeMode = ref(false);
const originalReinitializationSettings = ref<{
  database: typeof flow.database;
  installation: typeof flow.installation;
  administrator: typeof flow.administrator;
  projectId: string;
  passwordPolicy: typeof flow.passwordPolicy;
} | null>(null);
const databaseFieldsDisabled = computed(
  () => flow.databaseReady && !reinitializeMode.value,
);
const identityFieldsDisabled = computed(
  () =>
    flow.databaseReady &&
    Boolean(flow.summary.installation) &&
    !reinitializeMode.value,
);
const validInstallationIdentity = computed(() =>
  Boolean(
    flow.installation.systemName.trim().length > 0 &&
    flow.installation.systemName.trim().length <= 80 &&
    flow.installation.tokenName.trim().length > 0 &&
    flow.installation.tokenName.trim().length <= 80 &&
    /^[\p{L}\p{N}._-]{1,16}$/u.test(flow.installation.tokenSymbol.trim()),
  ),
);
const canInitialize = computed(() =>
  Boolean(
    flow.databaseCheck?.connected &&
    (flow.databaseCheck.exists || flow.databaseCheck.canCreateDatabase) &&
    Number.isInteger(flow.passwordPolicy.minimumLength) &&
    flow.passwordPolicy.minimumLength >= 8 &&
    flow.passwordPolicy.minimumLength <= 128 &&
    flow.administrator.username.trim() &&
    flow.administrator.password &&
    validInstallationIdentity.value,
  ),
);
const canSaveInstallation = computed(
  () =>
    flow.databaseReady &&
    !flow.summary.installation &&
    validInstallationIdentity.value,
);

watch(
  () => JSON.stringify(flow.database),
  () => resetDatabaseCheck(),
);

async function testDatabase() {
  checking.value = true;
  resetDatabaseCheck();
  try {
    flow.databaseCheck = await postJson<DatabaseCheck>(
      "/database/check",
      flow.database,
    );
    if (!flow.databaseCheck.exists && !flow.databaseCheck.canCreateDatabase)
      flow.databaseError =
        "目标数据库不存在，当前 PostgreSQL 用户没有 CREATEDB 权限。";
  } catch (error) {
    flow.databaseError = errorMessage(error);
  } finally {
    checking.value = false;
  }
}

async function applyPendingMigrations() {
  migrating.value = true;
  migrationResult.value = "";
  flow.databaseError = "";
  try {
    const result = await postJson<{ applied: string[] }>(
      "/database/migrate",
      {},
    );
    migrationResult.value = result.applied.length
      ? `已应用 ${result.applied.length} 个数据库迁移版本：${result.applied.join("、")}`
      : "数据库结构已是最新版本，无需迁移。";
  } catch (error) {
    flow.databaseError = errorMessage(error);
  } finally {
    migrating.value = false;
  }
}

async function initializeDatabase(confirmedExisting: boolean) {
  if (
    flow.databaseCheck?.exists &&
    !flow.databaseCheck.empty &&
    !confirmedExisting
  ) {
    confirmExistingOpen.value = true;
    return;
  }
  initializing.value = true;
  flow.databaseError = "";
  try {
    const result = await postJson<{
      initialized: boolean;
      database: string;
      administrator: string;
      settingsSaved: boolean;
      installation: {
        chainId: number | null;
        systemName: string;
        tokenName: string;
        tokenSymbol: string;
      };
    }>("/database/initialize", {
      database: flow.database,
      administrator: flow.administrator,
      projectId: flow.projectId,
      installation: {
        systemName: flow.installation.systemName.trim(),
        tokenName: flow.installation.tokenName.trim(),
        tokenSymbol: flow.installation.tokenSymbol.trim(),
      },
      passwordPolicy: flow.passwordPolicy,
      allowExistingNonEmpty: confirmedExisting,
    });
    confirmExistingOpen.value = false;
    flow.databaseReady = result.initialized;
    flow.databaseSettingsSaved = result.settingsSaved;
    flow.installation = { ...result.installation };
    flow.summary = {
      installed: result.initialized,
      database: result.database,
      databaseConnection: {
        host: flow.database.host.trim(),
        port: flow.database.port,
        database: flow.database.database.trim(),
        username: flow.database.username.trim(),
      },
      administrator: result.administrator,
      installation: result.installation,
      deployments: [],
      projectId: flow.projectId || null,
      passwordPolicy: { ...flow.passwordPolicy },
      settingsSaved: result.settingsSaved,
      installedAt: new Date().toISOString(),
    };
    flow.deploymentRecords = [];
    flow.selectedDeployment = null;
    reinitializeMode.value = false;
    flow.databaseReinitializing = false;
    originalReinitializationSettings.value = null;
    await router.replace("/deploy");
  } catch (error) {
    flow.databaseError = errorMessage(error);
  } finally {
    initializing.value = false;
  }
}

async function saveInstallationIdentity() {
  if (!canSaveInstallation.value) return;
  initializing.value = true;
  flow.databaseError = "";
  try {
    const result = await postJson<{
      saved: boolean;
      installation: {
        chainId: number | null;
        systemName: string;
        tokenName: string;
        tokenSymbol: string;
      };
    }>("/config/installation", {
      systemName: flow.installation.systemName.trim(),
      tokenName: flow.installation.tokenName.trim(),
      tokenSymbol: flow.installation.tokenSymbol.trim(),
    });
    flow.installation = { ...result.installation };
    flow.summary.installation = { ...result.installation };
    await router.replace("/deploy");
  } catch (error) {
    flow.databaseError = errorMessage(error);
  } finally {
    initializing.value = false;
  }
}
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
.database-icon {
  background: #fff5d9;
  color: #9a6900;
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
  margin: 18px 0 23px;
  color: #667085;
  line-height: 1.7;
}
.form-section {
  display: grid;
  gap: 14px;
  margin-top: 18px;
  padding: 18px;
}
.form-section-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #344054;
  font-size: 13px;
  font-weight: 800;
}
.form-section-title small {
  color: #8a94a4;
  font-size: 10px;
  font-weight: 500;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px;
  align-items: center;
}
.message-banner {
  border-radius: 12px;
  line-height: 1.5;
}
.success-message {
  background: #eaf8f0;
  color: #176b42;
}
.warning-message {
  background: #fff7df;
  color: #805800;
}
.info-message {
  background: #eef6ff;
  color: #205e92;
}
.error-message {
  background: #fff0ed;
  color: #a33322;
}
.table-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.table-list span {
  padding: 5px 8px;
  border-radius: 7px;
  background: #f2f4f7;
  color: #596579;
  font-family: monospace;
  font-size: 11px;
}
.test-database-button {
  justify-self: start;
}
.policy-box {
  display: grid;
  gap: 5px;
}
.policy-box > strong {
  color: #344054;
  font-size: 12px;
}
.policy-box > span {
  color: #8390a1;
  font-size: 11px;
}
.policy-options {
  display: flex;
  flex-wrap: wrap;
  border: 1px solid #e9edf1;
  border-radius: $generic-border-radius;
}
.confirm-card {
  width: min(560px, calc(100vw - 30px));
  border-radius: 18px;
}
.confirm-card p {
  color: #667085;
  font-size: 13px;
  line-height: 1.7;
}
.confirm-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #754e00;
  font-weight: 800;
}
.dialog-tables {
  max-height: 160px;
  overflow: auto;
}
.actions-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
}
@media (max-width: 650px) {
  .step-content {
    padding: 24px 16px 30px;
  }
  h2 {
    font-size: 24px;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .actions-row {
    flex-direction: column-reverse;
  }
  .actions-row :deep(.q-btn) {
    width: 100%;
  }
  .form-section {
    padding: 14px;
  }
}
</style>
