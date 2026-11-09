import { defineBoot } from "#q-app";
import { installerRequest } from "../services/installer-api";
import { initializeWalletKit } from "@chainforge/wallet-connect";

export default defineBoot(() => {
  // 安装器服务直接从根目录 .env 读取供浏览器使用的 Project ID。
  void installerRequest<{ projectId: string | null }>("/wallet-config")
    .then((config) =>
      initializeWalletKit(config.projectId, {
        appName: "ChainForge 安装器",
        description: "链构系统安装与合约部署",
        themeMode: "light",
        themeVariables: {
          "--w3m-accent": "#ffc832",
          "--apkt-accent": "#ffc832",
          // "--apkt-color-mix": "#ffc832",
          // "--apkt-color-mix-strength": 12,
        },
      }),
    )
    .catch(() => undefined);
});
