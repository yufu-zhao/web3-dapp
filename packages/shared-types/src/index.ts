// 安装身份是用户端、管理端与业务 API 共用的只读运行配置。
export interface PublicInstallationConfig {
  installationStatus: "not_initialized" | "deployment_pending" | "ready";
  chainId: number | null;
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
}

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
