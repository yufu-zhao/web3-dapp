import { defineBoot } from "#q-app";
import { loadWalletConnectConfig } from "@chainforge/shared-types";
import { initializeWalletKit } from "@chainforge/wallet-connect";

export default defineBoot(() => {
  // Project ID 是公开的 Reown 配置，由 API 从根目录 .env 提供。
  void loadWalletConnectConfig()
    .then((config) =>
      initializeWalletKit(config.projectId, {
        appName: "ChainForge 管理后台",
        description: "链构管理后台",
        themeMode: "light",
        themeVariables: {
          "--apkt-color-mix": "#ffc832",
          "--apkt-color-mix-strength": 12,
        },
      }),
    )
    .catch(() => undefined);
});
