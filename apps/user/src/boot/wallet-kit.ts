import { defineBoot } from "#q-app";
import { loadWalletConnectConfig } from "@chainforge/shared-types";
import { initializeWalletKit } from "@chainforge/wallet-connect";

export default defineBoot(async () => {
  // Project ID 是公开的 Reown 配置，由 API 从根目录 .env 提供。
  await loadWalletConnectConfig()
    .then((config) =>
      initializeWalletKit(config.projectId, {
        appName: "ChainForge",
        description: "链构用户端",
        themeMode: "dark",
        themeVariables: {
          "--apkt-color-mix": "#ffc832",
          "--apkt-color-mix-strength": 12,
        },
      }),
    )
    .catch(() => undefined);
});
