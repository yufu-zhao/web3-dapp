import { reactive } from "vue";
import {
  installerRequest,
  type AdminPasswordPolicy,
  type DatabaseCheck,
  type DatabaseSettings,
  type InstallationIdentity,
  type DeploymentRecord,
  type InstallationSummary,
  type InstallationIdentityInput,
  type SavedDeployment,
} from "./installer-api";

export interface InstallerEnvironment {
  status: string;
  service: string;
  nodeVersion: string;
  nodeSupported: boolean;
  platform: string;
  architecture: string;
  requiredNode: string;
}

const defaultPasswordPolicy: AdminPasswordPolicy = {
  minimumLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
};

export const installerFlow = reactive({
  bootstrapped: false,
  bootstrapping: false,
  environment: null as InstallerEnvironment | null,
  environmentError: "",
  environmentReady: false,
  database: {
    host: "127.0.0.1",
    port: 5432,
    database: "chainforge",
    username: "postgres",
    password: "",
    ssl: false,
  } as DatabaseSettings,
  databaseCheck: null as DatabaseCheck | null,
  databaseError: "",
  databaseReady: false,
  databaseReinitializing: false,
  databaseSettingsSaved: false,
  administrator: {
    username: "admin",
    password: "",
  },
  projectId: "",
  installation: {
    systemName: "我的 DApp",
    tokenName: "项目代币",
    tokenSymbol: "TOKEN",
  } as InstallationIdentityInput,
  passwordPolicy: { ...defaultPasswordPolicy } as AdminPasswordPolicy,
  summary: {} as InstallationSummary,
  deploymentRecords: [] as DeploymentRecord[],
  selectedDeployment: null as SavedDeployment | null,
});

let bootstrapPromise: Promise<void> | undefined;

export function resetDatabaseCheck() {
  installerFlow.databaseCheck = null;
  installerFlow.databaseError = "";
}

export async function bootstrapInstallerFlow() {
  if (installerFlow.bootstrapped) return;
  if (bootstrapPromise) return bootstrapPromise;

  installerFlow.bootstrapping = true;
  bootstrapPromise = (async () => {
    try {
      installerFlow.environment =
        await installerRequest<InstallerEnvironment>("/environment");
      installerFlow.environmentReady =
        installerFlow.environment.status === "ok" &&
        installerFlow.environment.nodeSupported;
      if (!installerFlow.environmentReady) {
        installerFlow.environmentError = "服务器运行环境未通过安装器检查。";
      }
    } catch (error) {
      installerFlow.environmentError = errorMessage(error);
    }

    try {
      const [config, summary] = await Promise.all([
        installerRequest<{
          projectId: string | null;
          installed: boolean;
          passwordPolicy?: AdminPasswordPolicy;
          installation?: InstallationIdentity | null;
        }>("/config"),
        installerRequest<InstallationSummary>("/summary"),
      ]);
      installerFlow.projectId = config.projectId ?? "";
      if (config.installation) {
        installerFlow.installation = { ...config.installation };
      } else if (summary.installation) {
        installerFlow.installation = { ...summary.installation };
      }
      installerFlow.passwordPolicy = {
        ...defaultPasswordPolicy,
        ...config.passwordPolicy,
      };
      installerFlow.summary = summary;
      if (summary.databaseConnection) {
        // 用已保存的连接目标预填页面，但不从服务端回传或复原数据库密码。
        installerFlow.database = {
          ...installerFlow.database,
          host: summary.databaseConnection.host,
          port: summary.databaseConnection.port,
          database: summary.databaseConnection.database,
          username: summary.databaseConnection.username,
        };
      }
      installerFlow.databaseReady = Boolean(
        summary.installed || config.installed,
      );
      installerFlow.databaseSettingsSaved = Boolean(summary.settingsSaved);
      installerFlow.deploymentRecords = summary.deployments ?? [];
    } catch {
      // 首次安装时数据库尚未初始化，保留表单默认值并停留在前置步骤。
    }
  })().finally(() => {
    installerFlow.bootstrapping = false;
    installerFlow.bootstrapped = true;
  });

  return bootstrapPromise;
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "请求失败，请检查安装服务和输入后重试。";
}
