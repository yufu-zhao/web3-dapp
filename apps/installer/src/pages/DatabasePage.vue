<template>
  <section class="step-content">
    <ContentHeading
      title="数据库连接"
      kicker="步骤 02 · DATABASE CONNECTION"
      :icon="{ icon: 'lan', color: 'amber-1', textColor: 'amber-9' }"
    />
    <p class="content-description">
      不存在的数据库将自动创建，空库直接初始化；非空库仅在识别为链构已有安装后，才允许确认跳过。
    </p>
    <InstallerCard v-if="hasSavedDatabase" class="form-section">
      <div class="row items-center justify-between q-gutter-sm">
        <strong>当前数据库</strong>
        <q-btn flat dense icon="swap_horiz" label="更换数据库" :disable="busy" @click="beginReinitialize" />
      </div>
      <div class="database-summary">
        <span>
          {{ flow.summary.databaseConnection?.host }}:{{ flow.summary.databaseConnection?.port }} /
          {{ flow.summary.database }}
        </span>
        <span>管理员：{{ flow.summary.administrator }}</span>
        <span v-if="flow.summary.installation">
          系统：{{ flow.summary.installation.systemName }} · {{ flow.summary.installation.tokenName }}（{{
            flow.summary.installation.tokenSymbol
          }}）
        </span>
        <span>
          Reown AppKit：{{ flow.walletConnectConfigured ? "已配置" : "未配置" }} · 管理员密码最少
          {{ flow.passwordPolicy.minimumLength }} 位
        </span>
      </div>
      <q-banner v-if="!flow.databaseSettingsSaved" class="message-banner warning-message">
        当前数据库连接未能保存到本机配置文件，安装服务重启后需重新选择此数据库。
      </q-banner>
      <q-banner class="message-banner warning-message">
        <template #avatar><q-icon name="info_outline" /></template>
        当前数据库已有安装数据。确认跳过后将沿用原有配置，不重新导入、不创建管理员，也不自动执行后续迁移。
      </q-banner>
      <q-expansion-item icon="build" label="数据库维护" caption="需要升级已有数据库结构时使用" :disable="busy">
        <div class="q-pa-md column items-start q-gutter-md">
          <span>操作目标：{{ flow.summary.database }}。手动检查并应用待执行迁移。</span>
          <q-btn
            outline
            label="检查并应用迁移"
            icon="system_update_alt"
            :loading="migrating"
            :disable="initializing"
            @click="applyPendingMigrations"
          />
          <q-banner
            v-if="migrationResult || migrationError"
            class="message-banner"
            :class="migrationError ? 'error-message' : 'success-message'"
          >
            <!-- 迁移反馈仅在维护区显示。 -->
            {{ migrationError || migrationResult }}
          </q-banner>
        </div>
      </q-expansion-item>
    </InstallerCard>

    <InstallerCard v-if="!hasSavedDatabase" class="form-section">
      <div class="row items-center justify-between q-gutter-sm">
        <div class="form-section-title">
          <span>PostgreSQL 连接</span>
          <small>凭据只提交给本机安装服务</small>
        </div>
        <q-btn
          v-if="reinitializeMode"
          flat
          dense
          icon="close"
          label="取消更换"
          :disable="busy"
          @click="cancelReinitialize"
        />
      </div>
      <q-banner v-if="reinitializeMode" class="message-banner info-message">
        <!-- 更换目标库不清理原数据库。 -->
        正在选择新目标库，原数据库保留。非空目标库不会执行初始化。
      </q-banner>
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
              flow.databaseCheck.exists ? (flow.databaseCheck.empty ? 'check_circle' : 'warning') : 'add_circle_outline'
            "
          />
        </template>
        <template v-if="!flow.databaseCheck.exists">
          目标库不存在；初始化时将自动创建。{{
            flow.databaseCheck.canCreateDatabase ? "当前用户有 CREATEDB 权限。" : "当前用户缺少 CREATEDB 权限。"
          }}
        </template>
        <template v-else-if="flow.databaseCheck.empty">
          已连接空数据库 {{ flow.databaseCheck.database }} ·
          {{ flow.databaseCheck.serverVersion }}
        </template>
        <template v-else>
          目标库已有
          {{ flow.databaseCheck.tableCount }}
          张用户表，已停止初始化。{{
            flow.databaseCheck.existingInstallation
              ? "已识别为链构已有安装，可确认后跳过。"
              : "未识别到完整的链构安装，请更换数据库。"
          }}
        </template>
      </q-banner>
      <div v-if="flow.databaseCheck?.tables.length" class="table-list">
        <span v-for="table in flow.databaseCheck.tables" :key="table">{{ table }}</span>
      </div>
    </InstallerCard>

    <InstallerCard v-if="!hasSavedDatabase || !flow.summary.installation" class="form-section config-section">
      <div class="form-section-title">
        <span>初始配置</span>
        <small>ChainId 将在部署完成后从钱包读取并锁定</small>
      </div>
      <q-banner
        v-if="flow.databaseReady && !reinitializeMode && !flow.summary.installation"
        class="message-banner warning-message"
      >
        <template #avatar><q-icon name="lock_reset" /></template>
        这是已有安装的首次身份补录。保存后系统名称和代币信息不可通过安装器修改；目标 ChainId
        会在全部合约部署与链上核验成功后，从本次部署钱包读取并锁定。
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
      </div>
      <div class="policy-box">
        <strong>管理员密码策略</strong>
        <span>密码长度和字符要求会写入 system_configs。</span>
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

    <InstallerCard v-if="!hasSavedDatabase" class="form-section admin-section">
      <div class="form-section-title">
        <span>首位管理员</span>
        <small>密码需满足上方策略，无需重复确认</small>
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

    <q-banner v-if="flow.databaseError" class="message-banner error-message q-mt-md">
      <template #avatar><q-icon name="error_outline" /></template>
      {{ flow.databaseError }}
    </q-banner>
    <div class="actions-row">
      <q-btn flat color="dark" icon="arrow_back" label="上一步" :disable="busy" @click="router.push('/environment')" />
      <q-btn
        v-if="hasSavedDatabase && flow.summary.installation"
        color="primary"
        icon-right="arrow_forward"
        label="跳过并进入合约部署"
        :disable="busy"
        unelevated
        @click="confirmExistingOpen = true"
      />
      <q-btn
        v-else-if="hasSavedDatabase"
        color="primary"
        icon="lock"
        label="保存安装身份并继续"
        :loading="initializing"
        :disable="busy || !canSaveInstallation"
        unelevated
        @click="saveInstallationIdentity"
      />
      <q-btn
        v-else
        color="primary"
        icon-right="arrow_forward"
        :label="checking ? '正在检查数据库' : '初始化并继续'"
        :loading="initializing"
        :disable="busy || !canInitialize"
        unelevated
        @click="initializeDatabase"
      />
    </div>

    <q-dialog v-model="confirmExistingOpen" persistent>
      <q-card class="confirm-card">
        <q-card-section>
          <div class="confirm-title">
            <q-icon name="warning_amber" size="24px" />
            数据库非空
          </div>
          <p v-if="reuseInstallation">
            已识别为链构已有安装。跳过后将使用数据库内保存的配置，本页新填写的初始配置和管理员信息不会写入；不会导入数据或执行迁移。确认继续吗？
          </p>
          <p v-else>目标数据库已有数据，但未识别到完整的链构安装。为保护已有数据，不能初始化或跳过，请更换数据库。</p>
          <div v-if="reuseInstallation" class="database-summary">
            <strong>{{ reuseInstallation.systemName }}</strong>
            <span>{{ reuseInstallation.tokenName }}（{{ reuseInstallation.tokenSymbol }}）</span>
          </div>
          <div class="table-list dialog-tables q-mt-md">
            <span v-for="table in flow.databaseCheck?.tables ?? []" :key="table">{{ table }}</span>
          </div>
          <q-banner v-if="reuseError" class="message-banner error-message q-mt-md">
            <!-- 重验失败保留确认窗口，避免误入部署。 -->
            {{ reuseError }}
          </q-banner>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat color="grey" label="返回检查" :disable="busy" />
          <q-btn
            v-if="reuseInstallation"
            color="primary"
            label="跳过并进入合约部署"
            unelevated
            :loading="initializing"
            :disable="busy"
            @click="useExistingDatabase"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </section>
</template>

<script setup lang="ts">
import ContentHeading from "../components/ContentHeading.vue";
import InstallerCard from "../components/InstallerCard.vue";
import { computed, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { installerRequest, postJson, type DatabaseCheck, type InstallationSummary } from "../services/installer-api";
import { errorMessage, installerFlow, resetDatabaseCheck } from "../services/installer-flow";

const router = useRouter();
const flow = installerFlow;
const checking = ref(false);
const initializing = ref(false);
const migrating = ref(false);
const migrationResult = ref("");
const migrationError = ref("");
const reuseError = ref("");
const confirmExistingOpen = ref(false);
const continuing = ref(false);
const reinitializeMode = ref(false);
const originalReinitializationSettings = ref<{
  database: typeof flow.database;
  installation: typeof flow.installation;
  administrator: typeof flow.administrator;
  passwordPolicy: typeof flow.passwordPolicy;
} | null>(null);
// 所有数据库操作互斥，操作期间锁定表单与离开入口，保持请求目标一致。
const busy = computed(() => initializing.value || migrating.value);
const hasSavedDatabase = computed(() => flow.databaseReady && !reinitializeMode.value);
const databaseFieldsDisabled = computed(() => busy.value || hasSavedDatabase.value);
const identityFieldsDisabled = computed(
  () => busy.value || (hasSavedDatabase.value && Boolean(flow.summary.installation)),
);
const reuseInstallation = computed(() =>
  hasSavedDatabase.value ? flow.summary.installation : flow.databaseCheck?.existingInstallation?.installation,
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
    flow.database.host.trim() &&
    flow.database.database.trim() &&
    flow.database.username.trim() &&
    Number.isInteger(flow.database.port) &&
    flow.database.port >= 1 &&
    flow.database.port <= 65535,
  ),
);
const validInitialConfiguration = computed(() =>
  Boolean(
    Number.isInteger(flow.passwordPolicy.minimumLength) &&
    flow.passwordPolicy.minimumLength >= 8 &&
    flow.passwordPolicy.minimumLength <= 128 &&
    flow.administrator.username.trim() &&
    flow.administrator.password &&
    validInstallationIdentity.value,
  ),
);
const canSaveInstallation = computed(
  () => flow.databaseReady && !flow.summary.installation && validInstallationIdentity.value,
);

watch(
  () => JSON.stringify(flow.database),
  () => resetDatabaseCheck(),
);

// 写入过程中拦截侧栏与浏览器返回；成功后的主动跳转放行。
onBeforeRouteLeave(() => {
  if (busy.value && !continuing.value) return false;
  if (reinitializeMode.value && !continuing.value) cancelReinitialize();
  return true;
});

function beginReinitialize() {
  // 切换安装目标前暂存当前表单，取消后恢复原数据库与配置。
  originalReinitializationSettings.value = {
    database: { ...flow.database },
    installation: { ...flow.installation },
    administrator: { ...flow.administrator },
    passwordPolicy: { ...flow.passwordPolicy },
  };
  flow.databaseError = "";
  migrationError.value = "";
  migrationResult.value = "";
  reuseError.value = "";
  resetDatabaseCheck();
  reinitializeMode.value = true;
  flow.databaseReinitializing = true;
}

function cancelReinitialize() {
  const original = originalReinitializationSettings.value;
  if (original) {
    flow.database = { ...original.database };
    flow.installation = { ...original.installation };
    flow.administrator = { ...original.administrator };
    flow.passwordPolicy = { ...original.passwordPolicy };
  }
  flow.databaseError = "";
  migrationError.value = "";
  migrationResult.value = "";
  reuseError.value = "";
  resetDatabaseCheck();
  reinitializeMode.value = false;
  flow.databaseReinitializing = false;
  originalReinitializationSettings.value = null;
}

async function applyPendingMigrations() {
  if (busy.value) return;
  migrating.value = true;
  migrationResult.value = "";
  migrationError.value = "";
  try {
    const result = await postJson<{ applied: string[] }>("/database/migrate", {});
    migrationResult.value = result.applied.length
      ? `已应用 ${result.applied.length} 个数据库迁移版本：${result.applied.join("、")}`
      : "数据库结构已是最新版本，无需迁移。";
  } catch (error) {
    migrationError.value = errorMessage(error);
  } finally {
    migrating.value = false;
  }
}

function finishDatabaseStep(summary: InstallationSummary) {
  if (!summary.installed || !summary.installation) throw new Error("数据库安装配置不完整，无法进入合约部署。");
  flow.summary = summary;
  flow.databaseReady = true;
  flow.databaseSettingsSaved = Boolean(summary.settingsSaved);
  flow.installation = { ...summary.installation };
  flow.walletConnectConfigured = Boolean(summary.walletConnectConfigured);
  if (summary.passwordPolicy) flow.passwordPolicy = { ...summary.passwordPolicy };
  flow.administrator = {
    username: summary.administrator ?? "admin",
    password: "",
  };
  flow.deploymentRecords = summary.deployments ?? [];
  flow.selectedDeployment = null;
  reinitializeMode.value = false;
  flow.databaseReinitializing = false;
  originalReinitializationSettings.value = null;
}

async function initializeDatabase() {
  if (busy.value || !canInitialize.value) return;
  initializing.value = true;
  checking.value = true;
  resetDatabaseCheck();
  reuseError.value = "";
  try {
    // 同一次操作先只读检查；非空库必须停下等待用户确认，绝不走初始化接口。
    const database = { ...flow.database };
    flow.databaseCheck = await postJson<DatabaseCheck>("/database/check", database);
    checking.value = false;
    if (flow.databaseCheck.exists && !flow.databaseCheck.empty) {
      confirmExistingOpen.value = true;
      return;
    }
    if (!flow.databaseCheck.exists && !flow.databaseCheck.canCreateDatabase)
      throw new Error("目标数据库不存在，当前 PostgreSQL 用户没有 CREATEDB 权限。");
    if (!validInitialConfiguration.value)
      throw new Error("目标库可初始化，请补全初始配置、管理员账号和符合密码策略的管理员密码，再点击初始化并继续。");
    await postJson("/database/initialize", {
      database,
      administrator: { ...flow.administrator },
      installation: { ...flow.installation },
      passwordPolicy: { ...flow.passwordPolicy },
    });
    finishDatabaseStep(await installerRequest<InstallationSummary>("/summary"));
    continuing.value = true;
    await router.replace("/deploy");
  } catch (error) {
    flow.databaseError = errorMessage(error);
  } finally {
    initializing.value = false;
    checking.value = false;
    continuing.value = false;
  }
}

async function useExistingDatabase() {
  if (busy.value || !reuseInstallation.value) return;
  initializing.value = true;
  reuseError.value = "";
  try {
    // 服务端重新识别目标库，只有用户主动确认后才保存目标连接并解锁部署。
    const summary = await postJson<InstallationSummary>(
      "/database/use-existing",
      hasSavedDatabase.value ? {} : { database: { ...flow.database } },
    );
    finishDatabaseStep(summary);
    confirmExistingOpen.value = false;
    continuing.value = true;
    await router.replace("/deploy");
  } catch (error) {
    reuseError.value = errorMessage(error);
  } finally {
    initializing.value = false;
    continuing.value = false;
  }
}

async function saveInstallationIdentity() {
  if (busy.value || !canSaveInstallation.value) return;
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
    continuing.value = true;
    await router.replace("/deploy");
  } catch (error) {
    flow.databaseError = errorMessage(error);
  } finally {
    initializing.value = false;
    continuing.value = false;
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
.database-summary {
  display: grid;
  gap: 8px;
  overflow-wrap: anywhere;
  color: #596579;
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
