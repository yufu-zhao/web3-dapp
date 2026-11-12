import {
  computed,
  onMounted,
  onUnmounted,
  provide,
  ref,
  watch,
  type InjectionKey
} from "vue";
import { useI18n } from "vue-i18n";
import { Notify } from "quasar";
import { useRoute } from "vue-router";
import { walletKitReady } from "@chainforge/wallet-connect";
import {
  loadPublicInstallationConfig,
  type PublicInstallationConfig
} from "@chainforge/shared-types";
import type { AnnouncementSummary } from "../components/AnnouncementTicker.vue";
import type { CarouselItem } from "../components/CarouselHero.vue";
import { availableUserLanguages, changeUserLanguage } from "../boot/i18n";
import { formatNumber } from "@chainforge/shared-utils";

export function createUserPageState() {
  const { t, locale } = useI18n();
  async function selectLanguage(languageLocale: string) {
    try {
      await changeUserLanguage(languageLocale);
    } catch (error) {
      Notify.create({
        type: "negative",
        message: error instanceof Error ? error.message : "切换语言失败。",
        position: "top"
      });
    }
  }
  const route = useRoute();
  const navigation = computed(() => [
    { path: "/", label: t("text_203c08e0d44a"), icon: "home" },
    {
      path: "/presale",
      label: t("text_2f34ccddf398"),
      icon: "local_fire_department"
    },
    { path: "/trade", label: t("text_919ddbbd91c0"), icon: "swap_horiz" },
    { path: "/mine", label: t("text_7f1d9dd04cd1"), icon: "person_outline" }
  ]);
  const features = computed(() => [
    {
      key: "assets",
      title: t("text_5f45bb826b16"),
      english: "ASSETS",
      icon: "account_balance_wallet",
      description: t("text_977d6ba7257d"),
      metric: t("text_0d6cf5efd037"),
      hint: t("text_bf1b26ecb643"),
      action: t("text_d0a4006a26b6"),
      list: t("text_84adf19f350e")
    },
    {
      key: "staking",
      title: t("text_31cc4b032944"),
      english: "STAKING",
      icon: "savings",
      description: t("text_c224b62005e6"),
      metric: t("text_40246300504d"),
      hint: t("text_c6309848f6bc"),
      action: t("text_fe666457b149"),
      list: t("text_b3c131feff36")
    },
    {
      key: "lock",
      title: t("text_f32299fed16a"),
      english: "LOCK",
      icon: "lock_outline",
      description: t("text_0a4db761b71c"),
      metric: t("text_9c7ba175a7a8"),
      hint: t("text_cec00a67c851"),
      action: t("text_8a3214ca0dfd"),
      list: t("text_e887f1caa673")
    },
    {
      key: "referral",
      title: t("text_550eddc3c7fe"),
      english: "REFERRAL",
      icon: "share",
      description: t("text_392aa71d937b"),
      metric: t("text_222b01b1379b"),
      hint: t("text_a6b32fded4c3"),
      action: t("text_72055beeb82e"),
      list: t("text_0168df8f4c4a")
    },
    {
      key: "team",
      title: t("text_acdf17f4e9c4"),
      english: "TEAM",
      icon: "groups",
      description: t("text_ee8fe4a6b40a"),
      metric: t("text_f64191706f55"),
      hint: t("text_486aa923fc94"),
      action: t("text_5ddcb16ab6fc"),
      list: t("text_2e6bfec616ad")
    },
    {
      key: "points",
      title: t("text_10939f548645"),
      english: "POINTS",
      icon: "stars",
      description: t("text_99909a699065"),
      metric: t("text_67a469708ec2"),
      hint: t("text_b24a303fae70"),
      action: t("text_50dbb99d5980"),
      list: t("text_ed8745d001b1")
    },
    {
      key: "lottery",
      title: t("text_87556ba69658"),
      english: "LOTTERY",
      icon: "redeem",
      description: t("text_68c38611229d"),
      metric: t("text_67a469708ec2"),
      hint: t("text_497a247bd0ee"),
      action: t("text_1d1126356e3d"),
      list: t("text_4b1f0feb4a9a")
    },
    {
      key: "announcements",
      title: t("text_069c0ecbf898"),
      english: "ANNOUNCEMENTS",
      icon: "campaign",
      description: t("text_eef86f0ac9c3"),
      metric: t("text_069c0ecbf898"),
      hint: t("text_988410986031"),
      action: t("text_b0538ff56623"),
      list: t("text_9440594b127a")
    },
    {
      key: "trades",
      title: t("text_3e75292e1392"),
      english: "TRADE HISTORY",
      icon: "receipt_long",
      description: t("text_873f5230315c"),
      metric: t("text_3e75292e1392"),
      hint: t("text_5de3f0f091f4"),
      action: t("text_d0557b30cd3e"),
      list: t("text_3e75292e1392")
    }
  ]);
  const serviceFeatures = computed(() => [
    { key: "overview", title: t("text_eefb2470b9a8"), icon: "dashboard" },
    ...features.value.map(({ key, title, icon }) => ({ key, title, icon }))
  ]);
  const explore = computed(() => [
    {
      path: "/presale",
      title: t("text_e62ffc155f98"),
      description: t("text_af5aa78c275f"),
      icon: "local_fire_department"
    },
    {
      path: "/trade",
      title: t("text_c3daa7ef5cd3"),
      description: t("text_9ec729d9d2b4"),
      icon: "swap_horiz"
    },
    {
      path: "/mine",
      title: t("text_48880f7a549d"),
      description: t("text_c2590a79c3eb"),
      icon: "account_balance_wallet"
    }
  ]);
  const activeSection = computed(() =>
    route.path.startsWith("/mine") ? "/mine" : route.path
  );
  const currentFeature = computed(() =>
    features.value.find(item => item.key === route.params.feature)
  );
  // 数据接口尚未提供时使用空数组，页面只展示空态，不伪造业务记录。
  const carouselItems = ref<CarouselItem[]>([]);
  const announcementItems = ref<AnnouncementSummary[]>([]);
  const tickerSettings = ref({
    scrollDurationMs: 12000,
    itemDelayMs: 500,
    fontSizePx: 14
  });
  const announcementLoading = ref(false);
  const announcementError = ref("");
  const isMobile = ref(false);
  const identity = ref<PublicInstallationConfig | null>(null);
  const configError = ref("");
  const loading = ref(true);
  const systemName = computed(
    () => identity.value?.systemName || t("text_f5a1c7cd0895")
  );
  const tokenName = computed(
    () => identity.value?.tokenName || t("text_fa6de2cda687")
  );
  const tokenSymbol = computed(() => identity.value?.tokenSymbol || "TOKEN");
  const chainLabel = computed(() =>
    identity.value?.installationStatus === "ready" && identity.value.chainId
      ? `ChainId ${identity.value.chainId}`
      : "--"
  );
  const statusMessage = computed(() =>
    loading.value
      ? t("text_505caac0c387")
      : configError.value
        ? t("text_fb0f2cc8d979", { error: configError.value })
        : identity.value?.installationStatus === "ready"
          ? t("text_3334cc394625")
          : identity.value?.installationStatus === "deployment_pending"
            ? t("text_384647771e16")
            : t("text_2637f2222d6a")
  );
  const detailNotice = ref(false);
  // 路由切换后不保留上一功能的操作提示。
  watch(
    () => route.path,
    () => {
      detailNotice.value = false;
    }
  );
  const presaleLoading = ref(false);
  const presaleError = ref("");
  const openPresale = ref<{
    state: "scheduled" | "open" | "ended";
    round: number;
    start: number;
    end: number;
    blockTimestamp: number;
    price: string;
    ticket: string;
    offered: string;
    participants: string;
    requested?: string;
    progressBasisPoints?: string | null;
  } | null>(null);
  const presaleAccount = ref<{ refreshAfterTransition: () => void } | null>(
    null
  );
  const chainClock = ref(0);
  let clockBase = 0;
  let clockStarted = 0;
  let countdownTimer: ReturnType<typeof setInterval> | undefined;
  let lastTransitionRefresh = 0;
  let requestVersion = 0;
  const countdownText = computed(() => {
    const sale = openPresale.value;
    if (!sale || sale.state === "ended") return "";
    const target = sale.state === "scheduled" ? sale.start : sale.end;
    const remaining = Math.max(0, Math.ceil(target - chainClock.value));
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return t("presale_countdown", {
      days,
      hours: String(hours).padStart(2, "0"),
      minutes: String(minutes).padStart(2, "0"),
      seconds: String(seconds).padStart(2, "0")
    });
  });
  // 以最后读取的区块时间加本地单调计时估算，边界处重新读取链上状态。
  function tickPresale() {
    if (
      route.path !== "/presale" ||
      !openPresale.value ||
      openPresale.value.state === "ended"
    )
      return;
    chainClock.value = clockBase + (performance.now() - clockStarted) / 1000;
    const sale = openPresale.value;
    const due =
      sale.state === "scheduled"
        ? chainClock.value >= sale.start
        : chainClock.value >= sale.end;
    if (
      due &&
      !presaleLoading.value &&
      performance.now() - lastTransitionRefresh >= 5000
    ) {
      lastTransitionRefresh = performance.now();
      void loadPresale(true);
      presaleAccount.value?.refreshAfterTransition();
    }
  }
  // 百分比使用链上整数计算结果，展示值不受进度条长度限制。
  const progressPoints = computed(() => {
    try {
      return openPresale.value?.progressBasisPoints == null
        ? null
        : BigInt(openPresale.value.progressBasisPoints);
    } catch {
      return null;
    }
  });
  const progressText = computed(() =>
    progressPoints.value === null
      ? "--"
      : `${progressPoints.value / 100n}.${String(progressPoints.value % 100n).padStart(2, "0")}%`
  );
  const progressWidth = computed(() =>
    progressPoints.value === null
      ? "0%"
      : `${Number(progressPoints.value > 10000n ? 10000n : progressPoints.value) / 100}%`
  );
  const isOversubscribed = computed(
    () => progressPoints.value !== null && progressPoints.value > 10000n
  );
  // 只读链上当前期；读取失败时不显示空状态。
  async function loadPresale(background = false) {
    const version = ++requestVersion;
    presaleLoading.value = true;
    presaleError.value = "";
    if (!background) openPresale.value = null;
    try {
      const response = await fetch("/api/public/open-presale", {
        cache: "no-store"
      });
      if (!response.ok)
        throw new Error(t("text_0c49af90e18f", { status: response.status }));
      const data = await response.json();
      if (version !== requestVersion || route.path !== "/presale") return;
      if (data.state === "unbound") throw new Error(t("text_499321b2c1ed"));
      if (["scheduled", "open", "ended"].includes(data.state)) {
        openPresale.value = data;
        clockBase = data.blockTimestamp;
        clockStarted = performance.now();
        chainClock.value = clockBase;
      } else openPresale.value = null;
    } catch (error) {
      if (version !== requestVersion) return;
      presaleError.value =
        error instanceof Error ? error.message : t("text_fbf68d5893ce");
      openPresale.value = null;
    } finally {
      if (version === requestVersion) presaleLoading.value = false;
    }
  }
  watch(
    () => route.path,
    path => {
      if (path === "/presale") {
        lastTransitionRefresh = 0;
        void loadPresale();
      } else {
        requestVersion++;
        presaleLoading.value = false;
        openPresale.value = null;
      }
    },
    { immediate: true }
  );
  async function loadConfig() {
    loading.value = true;
    configError.value = "";
    try {
      identity.value = await loadPublicInstallationConfig();
    } catch (error) {
      configError.value =
        error instanceof Error ? error.message : t("text_0ad3cc6744bc");
    } finally {
      loading.value = false;
    }
  }
  async function loadContent() {
    announcementLoading.value = true;
    announcementError.value = "";
    try {
      const response = await fetch("/api/public/content-management", {
        headers: { accept: "application/json" },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as {
        carouselItems?: CarouselItem[];
        announcements?: AnnouncementSummary[];
        tickerSettings?: Partial<typeof tickerSettings.value>;
      };
      carouselItems.value = Array.isArray(payload.carouselItems)
        ? payload.carouselItems
        : [];
      announcementItems.value = Array.isArray(payload.announcements)
        ? payload.announcements
        : [];
      tickerSettings.value = {
        ...tickerSettings.value,
        ...payload.tickerSettings
      };
    } catch (error) {
      announcementError.value =
        error instanceof Error ? error.message : t("text_09548ab045b5");
    } finally {
      announcementLoading.value = false;
    }
  }
  document.title = "链构（ChainForge）用户端";
  onMounted(() => {
    countdownTimer = setInterval(tickPresale, 1000);
    isMobile.value = window.matchMedia("(max-width: 760px)").matches;
    window.addEventListener("resize", updateViewport);
    void loadConfig();
    void loadContent();
  });
  onUnmounted(() => {
    clearInterval(countdownTimer);
    requestVersion++;
    window.removeEventListener("resize", updateViewport);
  });
  function updateViewport() {
    isMobile.value = window.matchMedia("(max-width: 760px)").matches;
  }
  return {
    t,
    locale,
    selectLanguage,
    route,
    navigation,
    features,
    serviceFeatures,
    explore,
    activeSection,
    currentFeature,
    carouselItems,
    announcementItems,
    tickerSettings,
    announcementLoading,
    announcementError,
    isMobile,
    identity,
    configError,
    loading,
    systemName,
    tokenName,
    tokenSymbol,
    chainLabel,
    statusMessage,
    detailNotice,
    presaleLoading,
    presaleError,
    openPresale,
    presaleAccount,
    chainClock,
    countdownText,
    progressPoints,
    progressText,
    progressWidth,
    isOversubscribed,
    loadPresale,
    loadConfig,
    loadContent,
    formatNumber,
    walletKitReady,
    availableUserLanguages
  };
}

export type UserPageState = ReturnType<typeof createUserPageState>;
export const userPageStateKey: InjectionKey<UserPageState> =
  Symbol("user-page-state");

export function provideUserPageState() {
  const state = createUserPageState();
  provide(userPageStateKey, state);
  return state;
}
