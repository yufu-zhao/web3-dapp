<template>
  <div class="wallet-controls">
    <div v-if="wallet" class="wallet-status">
      <span class="wallet-dot" aria-hidden="true" />
      <span class="wallet-address">{{ shortAddress(wallet.address) }}</span>
      <span class="wallet-network">Chain {{ wallet.chainId }}</span>
      <q-btn
        flat
        round
        dense
        icon="logout"
        aria-label="断开钱包"
        @click="disconnect"
      />
    </div>
    <q-btn
      v-else
      outline
      color="dark"
      icon="account_balance_wallet"
      label="连接钱包"
      :loading="loading !== null"
      :disable="loading !== null"
      @click="openWalletPicker"
    />

    <q-dialog v-model="walletPickerOpen">
      <q-card class="wallet-picker">
        <q-card-section class="wallet-picker-heading">
          <div>
            <div class="wallet-picker-title">选择连接方式</div>
            <div class="wallet-picker-caption">
              选择一个钱包来连接 {{ systemName }}。
            </div>
          </div>
          <q-btn
            flat
            round
            dense
            icon="close"
            aria-label="关闭钱包选择"
            :disable="loading !== null"
            @click="walletPickerOpen = false"
          />
        </q-card-section>

        <q-card-section class="wallet-options">
          <button
            v-for="item in injectedWallets"
            :key="item.key"
            class="wallet-option"
            type="button"
            :disabled="loading !== null"
            @click="connectInjected(item)"
          >
            <span class="wallet-option-icon injected-icon">
              <q-spinner v-if="connectingWalletKey === item.key" size="22px" />
              <span v-else class="wallet-monogram">{{
                item.name.slice(0, 1).toUpperCase()
              }}</span>
            </span>
            <span class="wallet-option-copy">
              <strong>{{ item.name }}</strong>
              <small>浏览器注入钱包</small>
            </span>
            <q-icon name="chevron_right" size="20px" />
          </button>

          <div
            v-if="discoveringWallets && !injectedWallets.length"
            class="wallet-discovery"
          >
            <q-spinner size="18px" />
            <span>正在查找浏览器钱包…</span>
          </div>
          <div v-else-if="!injectedWallets.length" class="wallet-discovery">
            <q-icon name="extension_off" size="20px" />
            <span>未检测到浏览器注入钱包，可安装钱包扩展后重试。</span>
          </div>

          <button
            v-if="projectId.trim()"
            class="wallet-option"
            type="button"
            :disabled="loading !== null"
            @click="connectWalletConnect"
          >
            <span class="wallet-option-icon walletconnect-icon">
              <q-icon name="qr_code_2" size="22px" />
            </span>
            <span class="wallet-option-copy">
              <strong>WalletConnect</strong>
              <small>使用手机钱包扫描二维码连接</small>
              <small class="wallet-option-status">项目已配置</small>
            </span>
            <q-icon name="chevron_right" size="20px" />
          </button>
        </q-card-section>

        <q-banner v-if="connectionError" class="wallet-error" rounded>
          {{ connectionError }}
        </q-banner>
      </q-card>
    </q-dialog>

    <q-dialog v-model="walletChangeOpen" persistent>
      <q-card class="wallet-change-card">
        <q-card-section>
          <div class="wallet-picker-title">检测到钱包账户或网络切换</div>
          <p class="wallet-change-copy">
            页面仍使用原连接信息。确认同步后才会更新部署钱包状态并重新校验。
          </p>
        </q-card-section>
        <q-card-section class="wallet-change-comparison">
          <div class="wallet-change-value">
            <small>页面当前</small>
            <strong>{{ wallet?.address }}</strong>
            <span>Chain {{ wallet?.chainId }}</span>
          </div>
          <q-icon name="arrow_downward" color="grey-6" />
          <div class="wallet-change-value wallet-change-next">
            <small>钱包检测到</small>
            <strong>{{ pendingWallet?.address }}</strong>
            <span>Chain {{ pendingWallet?.chainId }}</span>
          </div>
        </q-card-section>
        <q-banner v-if="walletChangeError" class="wallet-error" rounded>
          {{ walletChangeError }}
        </q-banner>
        <q-banner v-if="deploymentBusy" class="wallet-change-warning" rounded>
          部署进行中：已发出的钱包请求无法撤回。确认同步后会停止后续步骤；若切回页面当前账户和网络，部署可继续。
        </q-banner>
        <q-card-section class="wallet-change-copy wallet-change-hint">
          如果这是临时切换，切回页面当前显示的账户和网络后，此提示会自动关闭。
        </q-card-section>
        <q-card-actions align="right" class="wallet-change-actions">
          <q-btn
            flat
            color="grey-8"
            label="断开钱包"
            :disable="syncingWalletChange"
            @click="disconnect"
          />
          <q-btn
            color="primary"
            unelevated
            label="确认同步切换"
            :loading="syncingWalletChange"
            @click="syncWalletChange"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ConnectedWallet, Eip1193Provider } from "./wallet-types.js";

interface InjectedWallet {
  key: string;
  name: string;
  provider: Eip1193Provider;
}

interface Eip6963Detail {
  info?: { uuid?: string; name?: string };
  provider?: Eip1193Provider;
}

type DiscoverableProvider = Eip1193Provider & {
  providers?: DiscoverableProvider[];
  isMetaMask?: boolean;
  isTokenPocket?: boolean;
  isTrust?: boolean;
  isCoinbaseWallet?: boolean;
  isBitKeep?: boolean;
  isBitgetWallet?: boolean;
  isOkxWallet?: boolean;
  isOKXWallet?: boolean;
};

const props = withDefaults(
  defineProps<{
    projectId?: string;
    systemName?: string;
    chainId?: number | null;
    confirmChanges?: boolean;
    deploymentBusy?: boolean;
  }>(),
  {
    projectId: "",
    systemName: "FileReset",
    chainId: null,
    confirmChanges: false,
    deploymentBusy: false,
  },
);
// BNB 链使用公开 RPC 候选；其他链由 WalletConnect Cloud 按 project_id 提供 RPC。
const walletConnectRpcUrls: Record<number, string> = {
  56: "https://bsc-dataseed.binance.org",
  97: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
};

const emit = defineEmits<{
  connected: [wallet: ConnectedWallet];
  changed: [wallet: ConnectedWallet];
  changePending: [pending: boolean];
  disconnected: [];
}>();

const wallet = ref<ConnectedWallet | null>(null);
// 部署页先暂存钱包变化，用户确认后才替换当前连接快照。
const pendingWallet = ref<ConnectedWallet | null>(null);
const walletChangeOpen = ref(false);
const syncingWalletChange = ref(false);
const walletChangeError = ref("");
const loading = ref<"injected" | "walletconnect" | null>(null);
const projectId = ref(props.projectId);
const systemName = ref(props.systemName);
const chainId = ref(props.chainId);
const walletPickerOpen = ref(false);
const injectedWallets = ref<InjectedWallet[]>([]);
const discoveringWallets = ref(false);
const connectingWalletKey = ref("");
const connectionError = ref("");
let accountsListener: ((value: unknown) => void) | undefined;
let chainListener: ((value: unknown) => void) | undefined;
let disconnectListener: (() => void) | undefined;
let discoveryTimer: number | undefined;
let restoreTimer: number | undefined;
let walletContextTimer: number | undefined;
let mounted = false;
let restoring = false;
let pendingChangeNotified = false;
let contextRefreshInFlight = false;

const deploymentBusy = computed(() => props.deploymentBusy);

const connectionStorageKey = "filereset.wallet-connection";

interface StoredWalletSelection {
  walletType: ConnectedWallet["walletType"];
  walletKey?: string;
  walletName?: string;
}

watch(
  () => [props.projectId, props.systemName, props.chainId] as const,
  ([nextProjectId, nextSystemName, nextChainId]) => {
    projectId.value = nextProjectId ?? "";
    systemName.value = nextSystemName ?? "FileReset";
    chainId.value = nextChainId ?? null;
    if (mounted) scheduleRestore(100);
  },
);

function providerName(provider: DiscoverableProvider, index: number) {
  if (provider.isTokenPocket) return "TokenPocket";
  if (provider.isMetaMask) return "MetaMask";
  if (provider.isTrust) return "Trust Wallet";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isBitKeep || provider.isBitgetWallet) return "Bitget Wallet";
  if (provider.isOkxWallet || provider.isOKXWallet) return "OKX Wallet";
  return `浏览器钱包 ${index + 1}`;
}

function normalizedWalletName(name: string) {
  return name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function addInjectedWallet(
  provider: Eip1193Provider,
  name?: string,
  key?: string,
) {
  if (!provider || typeof provider.request !== "function") return;
  const fallbackName = providerName(
    provider as DiscoverableProvider,
    injectedWallets.value.length,
  );
  const walletName = name?.trim() || fallbackName;
  const existingWallet = injectedWallets.value.find(
    (wallet) =>
      wallet.key === key ||
      wallet.provider === provider ||
      normalizedWalletName(wallet.name) === normalizedWalletName(walletName),
  );
  if (existingWallet) {
    // 同一钱包可能同时走 EIP-6963 与旧版 ethereum 注入；保留一项并优先使用广播 Provider。
    if (key?.startsWith("eip6963-") && existingWallet.provider !== provider) {
      existingWallet.key = key;
      existingWallet.provider = provider;
    }
    return;
  }

  injectedWallets.value.push({
    key: key || `injected-${injectedWallets.value.length}`,
    name: walletName,
    provider,
  });
}

function handleAnnouncedProvider(event: Event) {
  const detail = (event as CustomEvent<Eip6963Detail>).detail;
  if (!detail?.provider) return;
  // 钱包提供的图标属于外部内容；此处只读取名称和 Provider，不渲染外部 SVG。
  addInjectedWallet(
    detail.provider,
    detail.info?.name,
    detail.info?.uuid ? `eip6963-${detail.info.uuid}` : undefined,
  );
  if (mounted) scheduleRestore(180);
}

function discoverInjectedWallets() {
  injectedWallets.value = [];
  discoveringWallets.value = true;

  const ethereum = (window as Window & { ethereum?: DiscoverableProvider })
    .ethereum;
  const legacyProviders = Array.isArray(ethereum?.providers)
    ? ethereum.providers
    : ethereum
      ? [ethereum]
      : [];
  for (const provider of legacyProviders) addInjectedWallet(provider);

  window.dispatchEvent(new Event("eip6963:requestProvider"));
  if (discoveryTimer) window.clearTimeout(discoveryTimer);
  discoveryTimer = window.setTimeout(() => {
    discoveringWallets.value = false;
  }, 450);
}

function openWalletPicker() {
  connectionError.value = "";
  walletPickerOpen.value = true;
  discoverInjectedWallets();
}

async function connectInjected(item: InjectedWallet) {
  if (loading.value) return;
  connectingWalletKey.value = item.key;
  await connectWithProvider(item.provider, "injected", item.name, item.key);
  connectingWalletKey.value = "";
}

async function connectWalletConnect() {
  if (!projectId.value.trim() || loading.value) return;

  loading.value = "walletconnect";
  connectionError.value = "";
  try {
    // WalletConnect 仅在数据库提供 project_id 后初始化，不在包内写入项目凭据。
    const { EthereumProvider } =
      await import("@walletconnect/ethereum-provider");
    const chains: [number, ...number[]] = chainId.value
      ? [chainId.value]
      : [56, 97];
    const rpcMap = chainId.value
      ? walletConnectRpcUrls[chainId.value]
        ? { [chainId.value]: walletConnectRpcUrls[chainId.value] }
        : {}
      : walletConnectRpcUrls;
    const provider = await EthereumProvider.init({
      projectId: projectId.value.trim(),
      chains,
      showQrModal: true,
      metadata: {
        name: systemName.value,
        description: `${systemName.value} 应用`,
        url: window.location.origin,
        icons: [],
      },
      rpcMap,
    });
    await provider.connect();
    await connectProvider(
      provider as unknown as Eip1193Provider,
      "walletconnect",
      "WalletConnect",
    );
    walletPickerOpen.value = false;
  } catch (error) {
    connectionError.value = errorMessage(error);
  } finally {
    loading.value = null;
  }
}

async function connectWithProvider(
  provider: Eip1193Provider,
  walletType: ConnectedWallet["walletType"],
  walletName: string,
  walletKey?: string,
) {
  loading.value = walletType;
  connectionError.value = "";
  try {
    await connectProvider(
      provider,
      walletType,
      walletName,
      "eth_requestAccounts",
      walletKey,
    );
    walletPickerOpen.value = false;
  } catch (error) {
    connectionError.value = errorMessage(error);
  } finally {
    loading.value = null;
  }
}

async function connectProvider(
  provider: Eip1193Provider,
  walletType: ConnectedWallet["walletType"],
  walletName: string,
  accountsMethod:
    "eth_accounts" | "eth_requestAccounts" = "eth_requestAccounts",
  walletKey?: string,
) {
  const accounts = await provider.request({ method: accountsMethod });
  const chain = await provider.request({ method: "eth_chainId" });
  const address = Array.isArray(accounts) ? accounts[0] : undefined;
  const chainId = parseChainId(chain);
  if (typeof address !== "string" || chainId === null) {
    throw new Error("钱包未返回有效账户或网络信息。");
  }

  clearListeners(wallet.value?.provider);
  const connected: ConnectedWallet = {
    address,
    chainId,
    provider,
    walletType,
    walletName,
  };
  wallet.value = connected;
  clearPendingWalletChange();
  saveWalletSelection({ walletType, walletKey, walletName });
  listen(provider, walletType);
  emit("connected", connected);
  startWalletContextMonitor();
}

// 钱包可能返回十六进制字符串，也可能返回十进制字符串或数字。
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

function saveWalletSelection(selection?: StoredWalletSelection) {
  try {
    if (!selection) {
      window.localStorage.removeItem(connectionStorageKey);
      return;
    }
    // 只记住钱包类型和扩展标识，不保存账户地址或签名信息。
    window.localStorage.setItem(
      connectionStorageKey,
      JSON.stringify(selection),
    );
  } catch {
    // 隐私模式或浏览器策略可能禁用本地存储；钱包仍可在当前页面使用。
  }
}

function readWalletSelection(): StoredWalletSelection | null {
  try {
    const value = window.localStorage.getItem(connectionStorageKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<StoredWalletSelection>;
    if (
      parsed.walletType !== "injected" &&
      parsed.walletType !== "walletconnect"
    )
      return null;
    return {
      walletType: parsed.walletType,
      walletKey:
        typeof parsed.walletKey === "string" ? parsed.walletKey : undefined,
      walletName:
        typeof parsed.walletName === "string" ? parsed.walletName : undefined,
    };
  } catch {
    saveWalletSelection();
    return null;
  }
}

function scheduleRestore(delay = 550) {
  if (restoreTimer) window.clearTimeout(restoreTimer);
  restoreTimer = window.setTimeout(() => {
    restoreTimer = undefined;
    void restoreWalletConnection();
  }, delay);
}

async function restoreWalletConnection() {
  if (!mounted || wallet.value || restoring) return;
  const saved = readWalletSelection();
  if (!saved) return;
  if (saved.walletType === "walletconnect" && !projectId.value.trim()) return;

  restoring = true;
  loading.value = saved.walletType;
  try {
    if (saved.walletType === "injected") {
      const selected = injectedWallets.value.find(
        (item) =>
          item.key === saved.walletKey ||
          (saved.walletName &&
            normalizedWalletName(item.name) ===
              normalizedWalletName(saved.walletName)),
      );
      if (!selected) return;
      await connectProvider(
        selected.provider,
        "injected",
        selected.name,
        "eth_accounts",
        selected.key,
      );
      return;
    }

    // EthereumProvider.init 会恢复本机 WalletConnect 会话；关闭 QR 模态框以免刷新时打断用户。
    const { EthereumProvider } =
      await import("@walletconnect/ethereum-provider");
    const chains: [number, ...number[]] = chainId.value
      ? [chainId.value]
      : [56, 97];
    const rpcMap = chainId.value
      ? walletConnectRpcUrls[chainId.value]
        ? { [chainId.value]: walletConnectRpcUrls[chainId.value] }
        : {}
      : walletConnectRpcUrls;
    const provider = await EthereumProvider.init({
      projectId: projectId.value.trim(),
      chains,
      showQrModal: false,
      metadata: {
        name: systemName.value,
        description: `${systemName.value} 应用`,
        url: window.location.origin,
        icons: [],
      },
      rpcMap,
    });
    const session = (provider as typeof provider & { session?: unknown })
      .session;
    if (!session) return;
    await connectProvider(
      provider as unknown as Eip1193Provider,
      "walletconnect",
      "WalletConnect",
      "eth_accounts",
    );
  } catch {
    // 静默恢复失败时保留连接按钮，用户仍可重新选择钱包并显式授权。
  } finally {
    restoring = false;
    loading.value = null;
  }
}

function listen(
  provider: Eip1193Provider,
  walletType: ConnectedWallet["walletType"],
) {
  accountsListener = (value) => {
    const address = Array.isArray(value) ? value[0] : undefined;
    if (typeof address !== "string") {
      resetWalletConnection(provider);
      return;
    }
    updateWallet({ address }, provider, walletType);
  };
  chainListener = (value) => {
    const chainId = parseChainId(value);
    if (chainId !== null) updateWallet({ chainId }, provider, walletType);
  };
  disconnectListener = () => {
    resetWalletConnection(provider);
  };
  provider.on?.("accountsChanged", accountsListener);
  provider.on?.("chainChanged", chainListener);
  provider.on?.("disconnect", disconnectListener);
}

function updateWallet(
  change: Partial<Pick<ConnectedWallet, "address" | "chainId">>,
  provider: Eip1193Provider,
  walletType: ConnectedWallet["walletType"],
) {
  if (!wallet.value) return;
  const base = pendingWallet.value ?? wallet.value;
  const candidate: ConnectedWallet = {
    ...base,
    ...change,
    provider,
    walletType,
  };
  if (sameWalletContext(candidate, wallet.value)) {
    clearPendingWalletChange();
    return;
  }
  if (props.confirmChanges) {
    pendingWallet.value = candidate;
    walletChangeError.value = "";
    walletChangeOpen.value = true;
    notifyPendingChange(true);
    return;
  }
  wallet.value = candidate;
  emit("changed", candidate);
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

function notifyPendingChange(pending: boolean) {
  if (pendingChangeNotified === pending) return;
  pendingChangeNotified = pending;
  emit("changePending", pending);
}

function clearPendingWalletChange() {
  pendingWallet.value = null;
  walletChangeOpen.value = false;
  walletChangeError.value = "";
  notifyPendingChange(false);
}

function resetWalletConnection(provider?: Eip1193Provider) {
  clearListeners(provider);
  stopWalletContextMonitor();
  saveWalletSelection();
  clearPendingWalletChange();
  wallet.value = null;
  emit("disconnected");
}

async function refreshWalletContext() {
  const current = wallet.value;
  if (!props.confirmChanges || !current || contextRefreshInFlight) return;
  contextRefreshInFlight = true;
  try {
    const [accounts, chain] = await Promise.all([
      current.provider.request({ method: "eth_accounts" }),
      current.provider.request({ method: "eth_chainId" }),
    ]);
    const address = Array.isArray(accounts) ? accounts[0] : undefined;
    const chainId = parseChainId(chain);
    if (typeof address !== "string" || chainId === null) {
      resetWalletConnection(current.provider);
      return;
    }
    updateWallet({ address, chainId }, current.provider, current.walletType);
  } catch {
    // 临时 RPC 错误不改变已确认的钱包状态，也不自动断开连接。
  } finally {
    contextRefreshInFlight = false;
  }
}

function handleWalletFocus() {
  void refreshWalletContext();
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") handleWalletFocus();
}

function startWalletContextMonitor() {
  if (!props.confirmChanges || walletContextTimer !== undefined) return;
  // 有些注入钱包切换时不会及时发事件，轮询和页面恢复焦点时再读一次当前状态。
  walletContextTimer = window.setInterval(() => {
    void refreshWalletContext();
  }, 1500);
  window.addEventListener("focus", handleWalletFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function stopWalletContextMonitor() {
  if (walletContextTimer !== undefined) {
    window.clearInterval(walletContextTimer);
    walletContextTimer = undefined;
  }
  window.removeEventListener("focus", handleWalletFocus);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

async function syncWalletChange() {
  const candidate = pendingWallet.value;
  if (!candidate || syncingWalletChange.value) return;
  syncingWalletChange.value = true;
  walletChangeError.value = "";
  try {
    // 点击确认时再从钱包读取一次，避免同步过期的事件载荷。
    const [accounts, chain] = await Promise.all([
      candidate.provider.request({ method: "eth_accounts" }),
      candidate.provider.request({ method: "eth_chainId" }),
    ]);
    const address = Array.isArray(accounts) ? accounts[0] : undefined;
    const chainId = parseChainId(chain);
    if (typeof address !== "string" || chainId === null) {
      resetWalletConnection(candidate.provider);
      return;
    }
    const connected: ConnectedWallet = {
      ...candidate,
      address,
      chainId,
    };
    if (sameWalletContext(connected, wallet.value)) {
      clearPendingWalletChange();
      return;
    }
    if (!sameWalletContext(connected, candidate)) {
      pendingWallet.value = connected;
      walletChangeOpen.value = true;
      walletChangeError.value =
        "钱包状态刚发生变化，请核对更新后的账户和网络后再次确认。";
      notifyPendingChange(true);
      return;
    }
    wallet.value = connected;
    clearPendingWalletChange();
    emit("changed", connected);
  } catch (error) {
    walletChangeError.value = errorMessage(error);
  } finally {
    syncingWalletChange.value = false;
  }
}

async function disconnect() {
  const provider = wallet.value?.provider;
  clearListeners(provider ?? pendingWallet.value?.provider);
  stopWalletContextMonitor();
  if (wallet.value?.walletType === "walletconnect") {
    await provider?.disconnect?.().catch(() => undefined);
  }
  saveWalletSelection();
  clearPendingWalletChange();
  wallet.value = null;
  emit("disconnected");
}

function clearListeners(provider?: Eip1193Provider) {
  if (!provider) return;
  if (accountsListener)
    provider.removeListener?.("accountsChanged", accountsListener);
  if (chainListener) provider.removeListener?.("chainChanged", chainListener);
  if (disconnectListener)
    provider.removeListener?.("disconnect", disconnectListener);
  accountsListener = undefined;
  chainListener = undefined;
  disconnectListener = undefined;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "钱包连接失败，请重试。";
}

onMounted(() => {
  mounted = true;
  window.addEventListener("eip6963:announceProvider", handleAnnouncedProvider);
  discoverInjectedWallets();
  scheduleRestore();
});

onBeforeUnmount(() => {
  window.removeEventListener(
    "eip6963:announceProvider",
    handleAnnouncedProvider,
  );
  if (discoveryTimer) window.clearTimeout(discoveryTimer);
  if (restoreTimer) window.clearTimeout(restoreTimer);
  stopWalletContextMonitor();
  mounted = false;
  clearListeners(wallet.value?.provider);
});
</script>

<style lang="scss" scoped>
.wallet-controls,
.wallet-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wallet-status {
  min-height: 40px;
  padding: 4px 8px 4px 12px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 999px;
  background: #fff;
  color: #1e293b;
}

.wallet-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #16a34a;
}

.wallet-address {
  font-size: 13px;
  font-weight: 700;
}

.wallet-network {
  color: #64748b;
  font-size: 12px;
}

.wallet-picker {
  width: min(100%, 440px);
  max-height: min(84vh, 680px);
  border-radius: 18px;
  display: flex;
  flex-direction: column;
}

.wallet-change-card {
  width: min(calc(100vw - 32px), 460px);
  border-radius: 18px;
}

.wallet-change-copy {
  margin: 8px 0 0;
  color: #687386;
  font-size: 13px;
  line-height: 1.6;
}

.wallet-change-comparison {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding-top: 4px;
}

.wallet-change-value {
  display: grid;
  width: 100%;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid #e3e8ef;
  border-radius: 12px;
  overflow-wrap: anywhere;
}

.wallet-change-value small {
  color: #687386;
  font-size: 11px;
}

.wallet-change-value strong {
  color: #202c40;
  font-size: 14px;
}

.wallet-change-value span {
  color: #64748b;
  font-size: 12px;
}

.wallet-change-next {
  border-color: #f4d274;
  background: #fffbeb;
}

.wallet-change-warning {
  margin: 0 24px;
  background: #fff7df;
  color: #735719;
  font-size: 12px;
  line-height: 1.6;
}

.wallet-change-hint {
  padding-top: 4px;
}

.wallet-change-actions {
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 24px 20px;
}

.wallet-picker-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 24px 12px;
}

.wallet-picker-title {
  color: #172033;
  font-size: 20px;
  font-weight: 750;
}

.wallet-picker-caption {
  margin-top: 5px;
  color: #687386;
  font-size: 13px;
}

.wallet-options {
  display: grid;
  min-height: 0;
  max-height: min(58vh, 440px);
  gap: 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 24px 24px;
}

.wallet-discovery {
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px dashed #d7dee9;
  border-radius: 14px;
  color: #687386;
  font-size: 12px;
}

.wallet-option {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px;
  border: 1px solid #e3e8ef;
  border-radius: 14px;
  background: #fff;
  color: #344054;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease;
}

.wallet-option:not(:disabled):hover {
  border-color: #92b4ec;
  background: #f8fbff;
  box-shadow: 0 5px 16px rgba(34, 81, 145, 0.08);
}

.wallet-option:focus-visible {
  outline: 3px solid rgba(52, 112, 203, 0.35);
  outline-offset: 2px;
}

.wallet-option:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.wallet-option-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 12px;
}

.injected-icon {
  background: #eef4ff;
  color: #285ba8;
}

.wallet-monogram {
  font-size: 18px;
  font-weight: 800;
}

.walletconnect-icon {
  background: #f1efff;
  color: #5b4acb;
}

.wallet-option-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.wallet-option-copy strong {
  color: #202c40;
  font-size: 14px;
  font-weight: 700;
}

.wallet-option-copy small {
  color: #687386;
  font-size: 12px;
}

.wallet-option-copy .wallet-option-status {
  color: #748197;
  font-size: 11px;
}

.wallet-error {
  margin: 0 24px 20px;
  background: #fff0f0;
  color: #9f2d2d;
}

@media (max-width: 540px) {
  .wallet-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .wallet-picker-heading {
    padding: 20px 18px 10px;
  }

  .wallet-options {
    max-height: min(58vh, 420px);
    padding: 10px 18px 18px;
  }

  .wallet-error {
    margin: 0 18px 18px;
  }

  .wallet-change-warning {
    margin: 0 18px;
  }

  .wallet-change-actions {
    justify-content: stretch;
    padding: 10px 18px 18px;
  }

  .wallet-change-actions :deep(.q-btn) {
    flex: 1 1 auto;
  }
}
</style>
