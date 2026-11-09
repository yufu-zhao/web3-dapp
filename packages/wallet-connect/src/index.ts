export type { ConnectedWallet, Eip1193Provider } from "./wallet-types.js";
export type {
  WalletConnectionEvents,
  WalletConnectionOptions,
} from "./use-wallet-connection.js";
export { useWalletConnection } from "./use-wallet-connection.js";
export {
  initializeWalletKit,
  isWalletKitInitialized,
  walletKitReady,
  type WalletKitOptions,
} from "./wallet-kit.js";
