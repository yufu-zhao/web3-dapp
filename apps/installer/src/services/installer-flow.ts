import { reactive } from "vue";
import {
  installerRequest,
  type AdminPasswordPolicy,
  type DatabaseCheck,
  type DatabaseSettings,
  type DeploymentRecord,
  type InstallationSummary,
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
    database: "filereset",
    username: "postgres",
    password: "",
    ssl: false,
  } as DatabaseSettings,
  databaseCheck: null as DatabaseCheck | null,
  databaseError: "",
  databaseReady: false,
  databaseSettingsSaved: false,
  administrator: {
    username: "admin",
    password: "",
  },
  projectId: "",
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
        }>("/config"),
        installerRequest<InstallationSummary>("/summary"),
      ]);
      installerFlow.projectId = config.projectId ?? "";
      installerFlow.passwordPolicy = {
        ...defaultPasswordPolicy,
        ...config.passwordPolicy,
      };
      installerFlow.summary = summary;
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
