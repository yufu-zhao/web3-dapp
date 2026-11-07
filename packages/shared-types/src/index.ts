// 安装身份是用户端、管理端与业务 API 共用的只读运行配置。
export interface PublicInstallationConfig {
  chainId: number | null;
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
}

// 管理端首屏依据 API 返回的状态引导首次安装或进入已就绪页面。
export type AdminInitializationStatus =
  | { state: "ready"; installation: PublicInstallationConfig }
  | {
      state: "uninitialized" | "incomplete" | "migration-required";
      installation: null;
    };

// 前端通过同源 API 读取安装身份，避免把每个安装实例的名称编译进静态资源。
export async function loadPublicInstallationConfig() {
  const response = await fetch("/api/public/config", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`读取安装配置失败（HTTP ${response.status}）。`);
  }
  return (await response.json()) as PublicInstallationConfig;
}

// 检查数据库初始化标记和安装身份，不把 API/数据库故障误报为“未安装”。
export async function loadAdminInitializationStatus() {
  const response = await fetch("/api/public/initialization", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join("；")
      : payload?.message;
    throw new Error(
      message || `检查管理后台初始化状态失败（HTTP ${response.status}）。`,
    );
  }
  return (await response.json()) as AdminInitializationStatus;
}
