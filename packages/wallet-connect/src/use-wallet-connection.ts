import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import {
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
  useDisconnect,
  useWalletInfo,
} from "@reown/appkit/vue";
import type { ConnectedWallet, Eip1193Provider } from "./wallet-types.js";

export interface WalletConnectionEvents {
  connected?: (wallet: ConnectedWallet) => void;
  changed?: (wallet: ConnectedWallet) => void;
  changePending?: (pending: boolean) => void;
  disconnected?: () => void;
}

export interface WalletConnectionOptions {
  confirmChanges?: Ref<boolean>;
  events?: WalletConnectionEvents;
}

/** 中性 AppKit 状态适配：只负责连接状态与账户/网络同步，不包含页面 UI。 */
export function useWalletConnection(options: WalletConnectionOptions = {}) {
  const account = useAppKitAccount({ namespace: "eip155" });
  const network = useAppKitNetwork();
  const appKitProvider = useAppKitProvider<Eip1193Provider>("eip155");
  const walletInfo = useWalletInfo("eip155");
  const { disconnect: disconnectAppKit } = useDisconnect();
  const wallet = ref<ConnectedWallet | null>(null);
  const pendingWallet = ref<ConnectedWallet | null>(null);
  const changePending = ref(false);
  const syncingWalletChange = ref(false);
  const changeError = ref("");
  let pendingChangeNotified = false;

  watch(
    () => ({
      status: account.value.status,
      isConnected: account.value.isConnected,
      address: account.value.address,
      chainId: network.value.chainId,
      provider: appKitProvider.walletProvider,
      walletName: walletInfo.walletInfo?.name,
    }),
    syncAppKitConnection,
    { immediate: true, flush: "post" },
  );

  function parseChainId(value: unknown): number | null {
    let chainId: number;
    if (typeof value === "number") chainId = value;
    else if (typeof value === "bigint") {
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      chainId = Number(value);
    } else if (typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)) {
      chainId = Number.parseInt(value.slice(2), 16);
    } else if (typeof value === "string" && /^\d+$/.test(value)) {
      chainId = Number(value);
    } else return null;
    return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
  }

  async function readWalletContext(provider: Eip1193Provider) {
    const [accounts, chain] = await Promise.all([
      provider.request({ method: "eth_accounts" }),
      provider.request({ method: "eth_chainId" }),
    ]);
    const address = Array.isArray(accounts) ? accounts[0] : undefined;
    const chainId = parseChainId(chain);
    if (typeof address !== "string" || chainId === null) {
      throw new Error("AppKit 未返回有效钱包账户或网络信息。");
    }
    return { address, chainId };
  }

  function syncAppKitConnection() {
    const status = account.value.status;
    const provider = appKitProvider.walletProvider;
    if (status === "disconnected") {
      if (wallet.value) resetWalletConnection();
      return;
    }
    if (!account.value.isConnected || !provider || status !== "connected")
      return;
    const address = account.value.address;
    const chainId = parseChainId(network.value.chainId);
    if (typeof address !== "string" || chainId === null) return;
    const candidate: ConnectedWallet = {
      address,
      chainId,
      provider,
      walletType: "appkit",
      walletName: walletInfo.walletInfo?.name || "AppKit 钱包",
    };
    if (!wallet.value) {
      wallet.value = candidate;
      options.events?.connected?.(candidate);
      return;
    }
    updateWallet(candidate);
  }

  function updateWallet(candidate: ConnectedWallet) {
    const current = wallet.value;
    if (sameWalletContext(candidate, current)) {
      if (current && candidate.provider !== current.provider) {
        wallet.value = candidate;
        options.events?.changed?.(candidate);
      }
      clearPendingWalletChange();
      return;
    }
    if (options.confirmChanges?.value) {
      pendingWallet.value = candidate;
      changeError.value = "";
      setChangePending(true);
      return;
    }
    wallet.value = candidate;
    options.events?.changed?.(candidate);
  }

  function sameWalletContext(
    left: ConnectedWallet | null,
    right: ConnectedWallet | null,
  ) {
    return Boolean(
      left &&
      right &&
      left.address.toLowerCase() === right.address.toLowerCase() &&
      left.chainId === right.chainId,
    );
  }

  function setChangePending(pending: boolean) {
    changePending.value = pending;
    if (pendingChangeNotified === pending) return;
    pendingChangeNotified = pending;
    options.events?.changePending?.(pending);
  }

  function clearPendingWalletChange() {
    pendingWallet.value = null;
    changeError.value = "";
    setChangePending(false);
  }

  function resetWalletConnection() {
    const wasConnected = Boolean(wallet.value);
    clearPendingWalletChange();
    wallet.value = null;
    if (wasConnected) options.events?.disconnected?.();
  }

  async function syncWalletChange() {
    const candidate = pendingWallet.value;
    if (!candidate || syncingWalletChange.value) return;
    syncingWalletChange.value = true;
    changeError.value = "";
    try {
      const connected: ConnectedWallet = {
        ...candidate,
        ...(await readWalletContext(candidate.provider)),
      };
      if (sameWalletContext(connected, wallet.value)) {
        if (connected.provider !== wallet.value?.provider) {
          wallet.value = connected;
          options.events?.changed?.(connected);
        }
        clearPendingWalletChange();
        return;
      }
      if (!sameWalletContext(connected, candidate)) {
        pendingWallet.value = connected;
        changeError.value =
          "钱包状态刚发生变化，请核对更新后的账户和网络后再次确认。";
        return;
      }
      wallet.value = connected;
      clearPendingWalletChange();
      options.events?.changed?.(connected);
    } catch (error) {
      changeError.value =
        error instanceof Error ? error.message : "钱包连接失败，请重试。";
    } finally {
      syncingWalletChange.value = false;
    }
  }

  async function disconnect() {
    try {
      await disconnectAppKit({ namespace: "eip155" });
    } finally {
      resetWalletConnection();
    }
  }

  onBeforeUnmount(clearPendingWalletChange);
  return {
    wallet,
    pendingWallet,
    changePending,
    syncingWalletChange,
    changeError,
    syncWalletChange,
    disconnect,
  };
}
