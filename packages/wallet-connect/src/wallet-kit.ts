import { createAppKit, type CreateAppKit } from "@reown/appkit/vue";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import {
  arbitrum,
  avalanche,
  base,
  bsc,
  bscTestnet,
  mainnet,
  optimism,
  polygon,
  sepolia,
  type AppKitNetwork,
} from "@reown/appkit/networks";
import { ref } from "vue";

let initialized = false;
export const walletKitReady = ref(false);

export interface WalletKitOptions {
  appName: string;
  description: string;
  themeMode?: CreateAppKit["themeMode"];
  themeVariables?: CreateAppKit["themeVariables"];
  features?: CreateAppKit["features"];
}

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  bsc,
  bscTestnet,
  mainnet,
  sepolia,
  arbitrum,
  optimism,
  polygon,
  base,
  avalanche,
];

/** 每个前端独立调用一次，UI、主题和 AppKit 功能由调用端配置。 */
export function initializeWalletKit(
  projectId?: string | null,
  options?: WalletKitOptions,
) {
  const normalizedProjectId = projectId?.trim();
  if (!normalizedProjectId || initialized) return initialized;
  const appName = options?.appName ?? "ChainForge";
  createAppKit({
    adapters: [new EthersAdapter()],
    networks,
    defaultNetwork: bsc,
    projectId: normalizedProjectId,
    metadata: {
      name: appName,
      description: options?.description ?? "ChainForge 应用",
      url: window.location.origin,
      icons: [
        `${window.location.origin}/brand/chainforge-mark-transparent.png`,
      ],
    },
    allowUnsupportedChain: true,
    enableReconnect: true,
    features: options?.features ?? { analytics: false },
    themeMode: options?.themeMode ?? "light",
    themeVariables: options?.themeVariables,
  });
  initialized = true;
  walletKitReady.value = true;
  return initialized;
}

export function isWalletKitInitialized() {
  return initialized;
}
