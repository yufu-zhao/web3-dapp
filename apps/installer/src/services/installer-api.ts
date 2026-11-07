// 本地默认连接安装服务；部署时可在页面脚本注入自定义服务地址。
const apiBaseUrl =
  (
    window as Window & { __FILERESET_INSTALLER_API__?: string }
  ).__FILERESET_INSTALLER_API__?.replace(/\/$/, "") ?? "http://127.0.0.1:3611";

export interface DatabaseSettings {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

export interface AdminPasswordPolicy {
  minimumLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export interface InstallationIdentity {
  chainId: number | null;
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
}

export interface InstallationIdentityInput {
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
}

export interface DatabaseCheck {
  connected: boolean;
  database: string;
  serverVersion: string;
  exists: boolean;
  empty: boolean;
  tableCount: number;
  tables: string[];
  canCreateDatabase: boolean;
}

export interface DeploymentRecord {
  contractName: string;
  address: string;
  transactionHash: string;
  chainId: number;
  deployer: string;
  createdAt: string;
}

export interface InstallationSummary {
  installed: boolean;
  database?: string;
  databaseConnection?: {
    host: string;
    port: number;
    database: string;
    username: string;
  };
  administrator?: string;
  passwordPolicy?: AdminPasswordPolicy;
  installation?: InstallationIdentity | null;
  deployments?: DeploymentRecord[];
  projectId?: string | null;
  installedAt?: string | null;
  settingsSaved?: boolean;
}

export interface SavedToken {
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
  transactionHash: string;
  deployer: string;
  createdAt: string;
}

export interface PendingDeploymentSummary {
  chainId: number;
  deployer: string;
  releaseVersion?: string;
  updatedAt?: string;
}

export interface DeploymentStepRecord {
  id: string;
  title: string;
  status: "pending" | "running" | "success" | "failed";
  phase?:
    | "preparing"
    | "estimating"
    | "awaiting_wallet"
    | "waiting_receipt"
    | "recovery_required";
  transactionHash?: string;
  address?: string;
  result?: string;
  error?: string;
  completedAt?: string;
  startingNonce?: number;
  walletRequestSlow?: boolean;
  recoveryRequired?: boolean;
  recoveryBlocked?: boolean;
}

export interface SavedDeployment {
  deploymentId: string;
  status: "complete";
  chainId: number;
  releaseVersion: string;
  deployer: string;
  completedAt: string;
  outputPath: string;
  contracts: Record<
    string,
    {
      contractName: string;
      nodeId: string;
      address: string;
      transactionHash?: string;
      chainId: number;
      deployer: string;
      createdAt: string;
      source?: string;
    }
  >;
  steps: DeploymentStepRecord[];
  configuration: Record<string, unknown>;
}

export async function installerRequest<T>(path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/installer${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("无法连接安装器服务，请检查服务是否已在 3611 端口启动。");
  }

  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? (payload as { message: unknown }).message
        : undefined;
    throw new Error(
      Array.isArray(message)
        ? message.join("；")
        : typeof message === "string"
          ? message
          : `安装器服务返回 HTTP ${response.status}`,
    );
  }
  return payload as T;
}

export function postJson<T>(path: string, body: unknown) {
  return installerRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
