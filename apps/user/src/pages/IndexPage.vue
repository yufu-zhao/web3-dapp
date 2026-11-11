<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <router-link to="/" class="brand" :aria-label="t('text_d66f4359dae3')">
          <BrandLogo :height="34" />
        </router-link>
        <nav class="desktop-nav" :aria-label="t('text_9bae68040509')">
          <router-link
            v-for="item in navigation"
            :key="item.path"
            :to="item.path"
            :class="{ active: activeSection === item.path }"
          >
            {{ item.label }}
          </router-link>
        </nav>
        <div class="wallet">
          <q-btn v-if="availableUserLanguages.length > 1" flat round dense icon="language" aria-label="切换语言">
            <q-menu class="language-menu">
              <q-list dense>
                <q-item
                  v-for="language in availableUserLanguages"
                  :key="language.locale"
                  v-close-popup
                  clickable
                  @click="void selectLanguage(language.locale)"
                >
                  <q-item-section>{{ language.name }}</q-item-section>
                  <q-item-section side>{{ language.locale }}</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
          <WalletConnect v-if="walletKitReady" />
          <span v-else>{{ t("text_fa29a60e22c1") }}</span>
        </div>
      </div>
    </header>

    <main class="content">
      <template v-if="route.path === '/'">
        <CarouselHero :items="carouselItems" :is-mobile="isMobile" />
        <AnnouncementTicker
          :items="announcementItems"
          :scroll-duration-ms="tickerSettings.scrollDurationMs"
          :item-delay-ms="tickerSettings.itemDelayMs"
          :font-size-px="tickerSettings.fontSizePx"
        />
        <section class="identity-bar panel" aria-live="polite">
          <div>
            <span class="label">{{ t("text_dc41c0013b97") }}</span>
            <strong>{{ systemName }}</strong>
          </div>
          <div>
            <span class="label">{{ t("text_fa6de2cda687") }}</span>
            <strong>
              {{ tokenName }}
              <span class="muted">{{ tokenSymbol }}</span>
            </strong>
          </div>
          <div>
            <span class="label">{{ t("text_872428a7210d") }}</span>
            <strong>{{ chainLabel }}</strong>
          </div>
          <div class="install-status">
            <span :class="['status-dot', { error: configError, waiting: !identity }]"></span>
            <span>{{ statusMessage }}</span>
            <button v-if="configError" class="text-button" @click="loadConfig">
              {{ t("text_b8784c8dd563") }}
            </button>
          </div>
        </section>
        <section class="section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">EXPLORE</span>
              <h2>{{ t("text_b85dacc64f51") }}</h2>
              <p>{{ t("text_1e54c3a69cb6") }}</p>
            </div>
          </div>
          <div class="explore-grid">
            <router-link v-for="card in explore" :key="card.path" :to="card.path" class="explore-card panel">
              <span class="icon-box"><q-icon :name="card.icon" /></span>
              <span>
                <strong>{{ card.title }}</strong>
                <small>{{ card.description }}</small>
              </span>
              <q-icon class="arrow" name="north_east" />
            </router-link>
          </div>
        </section>
      </template>

      <template v-else-if="route.path === '/presale'">
        <PanelHeading
          :title="t('text_9a8798488169', { token: tokenSymbol })"
          :sub-title="t('text_d33dafb53452')"
          entitle="PRIVATE SALE"
        >
          <template #side>
            <span class="presale-heading-note">
              <q-icon name="verified_user" />
              {{ t("text_70808b3d695f") }}
            </span>
          </template>
        </PanelHeading>
        <div v-if="presaleLoading" class="panel empty presale-state">
          <q-spinner color="primary" size="32px" />
          <h3>{{ t("text_dcd7952315f4") }}</h3>
          <p>{{ t("text_c6bf9ae19b59") }}</p>
        </div>
        <div v-else-if="presaleError" class="panel empty presale-state">
          <span class="empty-icon"><q-icon name="cloud_off" /></span>
          <h3>{{ t("text_b3fbe6f192ec") }}</h3>
          <p>{{ presaleError }}</p>
          <button class="button secondary presale-retry" @click="loadPresale()">
            {{ t("text_7bdd5ce1e298") }}
          </button>
        </div>
        <div v-else-if="openPresale" class="panel presale-card">
          <div class="presale-card-top">
            <div>
              <div class="presale-tags">
                <span class="sale-live" :class="{ 'sale-not-open': openPresale.state !== 'open' }">
                  <span></span>
                  {{
                    openPresale.state === "open"
                      ? t("text_70269cd2c470")
                      : openPresale.state === "scheduled"
                        ? t("presale_scheduled")
                        : t("presale_awaiting_finalization")
                  }}
                </span>
                <span class="sale-round">{{ t("text_60b8db6ee8cd", { round: openPresale.round }) }}</span>
              </div>
              <!-- <h2>{{ tokenSymbol }} 私募认购</h2> -->
              <p>{{ t("text_35a03c4289d4") }}</p>
            </div>
            <div class="sale-mark"><q-icon name="diamond" /></div>
          </div>
          <div class="sale-metrics">
            <div>
              <span>{{ t("text_b13fb9ff5d8c") }}</span>
              <strong>{{ openPresale.price }}</strong>
              <small>{{ t("text_ed1b2beb057c", { token: tokenSymbol }) }}</small>
            </div>
            <div>
              <span>{{ t("text_0c150fed7278") }}</span>
              <strong>{{ parseInt(openPresale.ticket) }}</strong>
              <small>{{ t("text_1c871c22a867") }}</small>
            </div>
            <div>
              <span>{{ t("text_7bc80bf154e7") }}</span>
              <strong>{{ parseInt(openPresale.offered) }}</strong>
              <small>{{ tokenSymbol }}</small>
            </div>
            <div>
              <span>{{ t("text_a3be500185e6") }}</span>
              <strong>{{ openPresale.participants }}</strong>
              <small>{{ t("text_50f5d65d5729") }}</small>
            </div>
          </div>
          <div class="sale-progress">
            <div class="progress-heading">
              <div>
                <h3>{{ t("text_207c88639b92") }}</h3>
                <p>{{ t("text_cdb244ddeb95") }}</p>
              </div>
              <strong>{{ progressText }}</strong>
            </div>
            <div class="progress-track" role="img" :aria-label="t('text_5a382066a61e', { progress: progressText })">
              <div class="progress-fill" :style="{ width: progressWidth }"></div>
            </div>
            <div class="progress-foot">
              <!-- <span>
                {{
                  t("text_03831f44f5de", {
                    amount: openPresale.requested ?? "--",
                    token: tokenSymbol,
                  })
                }}
              </span> -->
              <span>
                {{
                  t("text_03831f44f5de", {
                    amount: formatNumber(openPresale.requested),
                    token: tokenSymbol,
                  })
                }}
              </span>
              <span>
                {{
                  t("text_19003bc43c59", {
                    amount: formatNumber(openPresale.offered),
                    token: tokenSymbol,
                  })
                }}
              </span>
            </div>
            <p v-if="isOversubscribed" class="oversubscribed">
              <q-icon name="info_outline" />
              {{ t("text_638115ee8c03") }}
            </p>
          </div>
          <div class="sale-time">
            <q-icon name="schedule" />
            <div>
              <span>{{ openPresale.state === "scheduled" ? t("presale_starts_at") : t("text_8bf6994b5b44") }}</span>
              <strong>
                {{
                  new Date(
                    (openPresale.state === "scheduled" ? openPresale.start : openPresale.end) * 1000,
                  ).toLocaleString(locale)
                }}
              </strong>
              <small v-if="openPresale.state !== 'ended'" class="sale-countdown">
                {{ openPresale.state === "scheduled" ? t("presale_starts_in") : t("presale_ends_in") }}
                <b>{{ countdownText }}</b>
              </small>
              <small v-else class="sale-countdown">{{ t("presale_finalization_notice") }}</small>
            </div>
            <span class="sale-time-note">{{ t("text_52fa6050f77d") }}</span>
          </div>
        </div>
        <div v-else class="panel empty presale-state">
          <span class="empty-icon"><q-icon name="hourglass_empty" /></span>
          <h3>{{ t("text_5b73b7ffa69e") }}</h3>
          <p>{{ t("text_e41101a14626") }}</p>
        </div>
        <PresaleAccount
          ref="presaleAccount"
          v-if="walletKitReady"
          :token-symbol="tokenSymbol"
          @updated="loadPresale()"
        />
        <div v-else class="panel empty">
          {{ t("text_73eefa939f84") }}
        </div>
      </template>

      <template v-else-if="route.path === '/trade'">
        <TradePanel :token-symbol="tokenSymbol" />
      </template>

      <template v-else-if="route.path === '/mine'">
        <section class="account-banner panel">
          <div>
            <span class="icon-box"><q-icon name="account_balance_wallet" /></span>
            <div>
              <h2>{{ t("text_6c2eb6ceec1d") }}</h2>
              <p>{{ t("text_bc9757b1b80e") }}</p>
            </div>
          </div>
          <span class="pill">{{ t("text_6dd4fc575bcc") }}</span>
        </section>
        <div class="mine-layout">
          <DesktopServiceMenu :features="serviceFeatures" active-key="overview" />
          <MobileServiceGrid :features="serviceFeatures" />
          <section class="panel mine-overview">
            <h2>{{ t("text_eefb2470b9a8") }}</h2>
            <p>{{ t("text_3b0fa708d39e") }}</p>
          </section>
        </div>
      </template>

      <template v-else-if="currentFeature">
        <router-link class="back-link" to="/mine">
          <q-icon name="arrow_back" />
          {{ t("text_b668ee457f4d") }}
        </router-link>
        <div class="mine-layout">
          <DesktopServiceMenu :features="serviceFeatures" :active-key="currentFeature.key" />
          <MobileServiceGrid :features="serviceFeatures" />
          <div class="mine-detail">
            <h1 class="mine-title">{{ currentFeature.title }}</h1>
            <template v-if="currentFeature.key === 'announcements'">
              <div v-if="announcementLoading" class="panel empty compact-empty">
                <span class="empty-icon"><q-icon name="hourglass_empty" /></span>
                <h3>{{ t("text_56a7410e3ab2") }}</h3>
              </div>
              <div v-else-if="announcementError" class="panel empty compact-empty">
                <span class="empty-icon"><q-icon name="cloud_off" /></span>
                <h3>{{ t("text_1452f8ba28fa") }}</h3>
                <p>{{ announcementError }}</p>
                <button class="button secondary" @click="loadContent">
                  {{ t("text_b8784c8dd563") }}
                </button>
              </div>
              <div v-else-if="announcementItems.length" class="announcement-list">
                <article
                  v-for="announcement in announcementItems"
                  :key="announcement.id"
                  class="panel announcement-card"
                >
                  <h2>{{ announcement.title }}</h2>
                  <p v-if="announcement.summary" class="announcement-summary">
                    {{ announcement.summary }}
                  </p>
                  <img
                    v-if="announcement.contentType === 'article' && announcement.mediaUrl"
                    :src="announcement.mediaUrl"
                    :alt="announcement.title"
                    loading="lazy"
                  />
                  <video
                    v-if="announcement.contentType === 'video' && announcement.mediaUrl"
                    :src="announcement.mediaUrl"
                    controls
                    preload="metadata"
                  />
                  <p v-if="announcement.body" class="announcement-body">
                    {{ announcement.body }}
                  </p>
                </article>
              </div>
              <div v-else class="panel empty compact-empty">
                <span class="empty-icon"><q-icon name="campaign" /></span>
                <h3>{{ t("text_6d9a7758610a") }}</h3>
                <p>{{ t("text_41db199ee511") }}</p>
              </div>
            </template>
            <template v-else-if="currentFeature.key === 'trades'">
              <div class="panel empty compact-empty">
                <span class="empty-icon"><q-icon name="receipt_long" /></span>
                <h3>{{ t("text_5bddc23f5fa4") }}</h3>
                <p>{{ t("text_e3619cb000d3") }}</p>
              </div>
            </template>
            <template v-else>
              <section class="panel detail-summary">
                <div>
                  <span class="label">{{ currentFeature.metric }}</span>
                  <div class="detail-value">--</div>
                  <p>{{ currentFeature.hint }}</p>
                </div>
                <button class="button secondary" @click="detailNotice = true">
                  {{ currentFeature.action }}
                </button>
              </section>
              <p v-if="detailNotice" class="notice" role="status">
                {{ t("text_4af4222eb987", { feature: currentFeature.title }) }}
              </p>
              <div class="section-title">
                <h2>{{ currentFeature.list }}</h2>
                <span class="pill">{{ t("text_e912fe6ce99c") }}</span>
              </div>
              <div class="panel empty">
                <span class="empty-icon"><q-icon :name="currentFeature.icon" /></span>
                <h3>
                  {{ t("text_7204737076bc", { list: currentFeature.list }) }}
                </h3>
                <p>{{ t("text_19af25f736ba") }}</p>
              </div>
            </template>
          </div>
        </div>
      </template>
    </main>
    <nav class="mobile-nav" :aria-label="t('text_6bb29f763d65')">
      <router-link
        v-for="item in navigation"
        :key="item.path"
        :to="item.path"
        :class="{ active: activeSection === item.path }"
      >
        <q-icon :name="item.icon" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Notify } from "quasar";
import { useRoute } from "vue-router";
import { walletKitReady } from "@chainforge/wallet-connect";
import { BrandLogo } from "@chainforge/brand-ui";
import { loadPublicInstallationConfig, type PublicInstallationConfig } from "@chainforge/shared-types";
import AnnouncementTicker, { type AnnouncementSummary } from "../components/AnnouncementTicker.vue";
import CarouselHero, { type CarouselItem } from "../components/CarouselHero.vue";
import DesktopServiceMenu from "../components/DesktopServiceMenu.vue";
import MobileServiceGrid from "../components/MobileServiceGrid.vue";
import TradePanel from "../components/TradePanel.vue";
import WalletConnect from "../components/WalletConnect.vue";
import PresaleAccount from "../components/PresaleAccount.vue";
import PanelHeading from "@/components/PanelHeading.vue";
import { availableUserLanguages, changeUserLanguage } from "../boot/i18n";

import { formatNumber } from "@chainforge/shared-utils";

const { t, locale } = useI18n();

async function selectLanguage(languageLocale: string) {
  try {
    await changeUserLanguage(languageLocale);
  } catch (error) {
    Notify.create({
      type: "negative",
      message: error instanceof Error ? error.message : "切换语言失败。",
      position: "top",
    });
  }
}

const route = useRoute();
const navigation = computed(() => [
  { path: "/", label: t("text_203c08e0d44a"), icon: "home" },
  {
    path: "/presale",
    label: t("text_2f34ccddf398"),
    icon: "local_fire_department",
  },
  { path: "/trade", label: t("text_919ddbbd91c0"), icon: "swap_horiz" },
  { path: "/mine", label: t("text_7f1d9dd04cd1"), icon: "person_outline" },
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
    list: t("text_84adf19f350e"),
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
    list: t("text_b3c131feff36"),
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
    list: t("text_e887f1caa673"),
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
    list: t("text_0168df8f4c4a"),
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
    list: t("text_2e6bfec616ad"),
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
    list: t("text_ed8745d001b1"),
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
    list: t("text_4b1f0feb4a9a"),
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
    list: t("text_9440594b127a"),
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
    list: t("text_3e75292e1392"),
  },
]);
const serviceFeatures = computed(() => [
  { key: "overview", title: t("text_eefb2470b9a8"), icon: "dashboard" },
  ...features.value.map(({ key, title, icon }) => ({ key, title, icon })),
]);
const explore = computed(() => [
  {
    path: "/presale",
    title: t("text_e62ffc155f98"),
    description: t("text_af5aa78c275f"),
    icon: "local_fire_department",
  },
  {
    path: "/trade",
    title: t("text_c3daa7ef5cd3"),
    description: t("text_9ec729d9d2b4"),
    icon: "swap_horiz",
  },
  {
    path: "/mine",
    title: t("text_48880f7a549d"),
    description: t("text_c2590a79c3eb"),
    icon: "account_balance_wallet",
  },
]);
const activeSection = computed(() => (route.path.startsWith("/mine") ? "/mine" : route.path));
const currentFeature = computed(() => features.value.find((item) => item.key === route.params.feature));
// 数据接口尚未提供时使用空数组，页面只展示空态，不伪造业务记录。
const carouselItems = ref<CarouselItem[]>([]);
const announcementItems = ref<AnnouncementSummary[]>([]);
const tickerSettings = ref({
  scrollDurationMs: 12000,
  itemDelayMs: 500,
  fontSizePx: 14,
});
const announcementLoading = ref(false);
const announcementError = ref("");
const isMobile = ref(false);
const identity = ref<PublicInstallationConfig | null>(null);
const configError = ref("");
const loading = ref(true);
const systemName = computed(() => identity.value?.systemName || t("text_f5a1c7cd0895"));
const tokenName = computed(() => identity.value?.tokenName || t("text_fa6de2cda687"));
const tokenSymbol = computed(() => identity.value?.tokenSymbol || "TOKEN");
const chainLabel = computed(() =>
  identity.value?.installationStatus === "ready" && identity.value.chainId ? `ChainId ${identity.value.chainId}` : "--",
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
          : t("text_2637f2222d6a"),
);
const detailNotice = ref(false);
// 路由切换后不保留上一功能的操作提示。
watch(
  () => route.path,
  () => {
    detailNotice.value = false;
  },
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
const presaleAccount = ref<{ refreshAfterTransition: () => void } | null>(null);
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
    seconds: String(seconds).padStart(2, "0"),
  });
});
// 以最后读取的区块时间加本地单调计时估算，边界处重新读取链上状态。
function tickPresale() {
  if (route.path !== "/presale" || !openPresale.value || openPresale.value.state === "ended") return;
  chainClock.value = clockBase + (performance.now() - clockStarted) / 1000;
  const sale = openPresale.value;
  const due = sale.state === "scheduled" ? chainClock.value >= sale.start : chainClock.value >= sale.end;
  if (due && !presaleLoading.value && performance.now() - lastTransitionRefresh >= 5000) {
    lastTransitionRefresh = performance.now();
    void loadPresale(true);
    presaleAccount.value?.refreshAfterTransition();
  }
}
// 百分比使用链上整数计算结果，展示值不受进度条长度限制。
const progressPoints = computed(() => {
  try {
    return openPresale.value?.progressBasisPoints == null ? null : BigInt(openPresale.value.progressBasisPoints);
  } catch {
    return null;
  }
});
const progressText = computed(() =>
  progressPoints.value === null
    ? "--"
    : `${progressPoints.value / 100n}.${String(progressPoints.value % 100n).padStart(2, "0")}%`,
);
const progressWidth = computed(() =>
  progressPoints.value === null
    ? "0%"
    : `${Number(progressPoints.value > 10000n ? 10000n : progressPoints.value) / 100}%`,
);
const isOversubscribed = computed(() => progressPoints.value !== null && progressPoints.value > 10000n);
// 只读链上当前期；读取失败时不显示空状态。
async function loadPresale(background = false) {
  const version = ++requestVersion;
  presaleLoading.value = true;
  presaleError.value = "";
  if (!background) openPresale.value = null;
  try {
    const response = await fetch("/api/public/open-presale", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(t("text_0c49af90e18f", { status: response.status }));
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
    presaleError.value = error instanceof Error ? error.message : t("text_fbf68d5893ce");
    openPresale.value = null;
  } finally {
    if (version === requestVersion) presaleLoading.value = false;
  }
}
watch(
  () => route.path,
  (path) => {
    if (path === "/presale") {
      lastTransitionRefresh = 0;
      void loadPresale();
    } else {
      requestVersion++;
      presaleLoading.value = false;
      openPresale.value = null;
    }
  },
  { immediate: true },
);
async function loadConfig() {
  loading.value = true;
  configError.value = "";
  try {
    identity.value = await loadPublicInstallationConfig();
  } catch (error) {
    configError.value = error instanceof Error ? error.message : t("text_0ad3cc6744bc");
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
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      carouselItems?: CarouselItem[];
      announcements?: AnnouncementSummary[];
      tickerSettings?: Partial<typeof tickerSettings.value>;
    };
    carouselItems.value = Array.isArray(payload.carouselItems) ? payload.carouselItems : [];
    announcementItems.value = Array.isArray(payload.announcements) ? payload.announcements : [];
    tickerSettings.value = {
      ...tickerSettings.value,
      ...payload.tickerSettings,
    };
  } catch (error) {
    announcementError.value = error instanceof Error ? error.message : t("text_09548ab045b5");
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
</script>
