<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <router-link to="/" class="brand" aria-label="返回首页">
          <img src="/brand/chainforge-mark.png" alt="" />
          <span>{{ systemName }}<small>数字资产平台</small></span>
        </router-link>
        <nav class="desktop-nav" aria-label="主导航">
          <router-link
            v-for="item in navigation"
            :key="item.path"
            :to="item.path"
            :class="{ active: activeSection === item.path }"
            >{{ item.label }}</router-link
          >
        </nav>
        <div class="wallet"><WalletConnect /></div>
      </div>
    </header>

    <main class="content">
      <template v-if="route.path === '/'">
        <section class="hero panel">
          <div class="hero-copy">
            <span class="eyebrow"
              ><span class="status-dot"></span> 链上资产 · 全新体验</span
            >
            <h1>探索数字资产<br /><em>更多可能</em></h1>
            <p>从私募到交易，在 {{ systemName }} 开启你的链上旅程。</p>
            <div class="hero-actions">
              <router-link class="button primary" to="/presale"
                >探索私募 <q-icon name="arrow_forward" /></router-link
              ><router-link class="button secondary" to="/trade"
                >进入交易</router-link
              >
            </div>
          </div>
          <div class="hero-art" aria-hidden="true">
            <div class="orbit orbit-one"></div>
            <div class="orbit orbit-two"></div>
            <div class="coin">
              <img src="/brand/chainforge-mark.png" alt="" />
            </div>
            <span class="art-spark spark-one">✦</span
            ><span class="art-spark spark-two">✦</span>
          </div>
        </section>
        <section class="identity-bar panel" aria-live="polite">
          <div>
            <span class="label">系统名称</span><strong>{{ systemName }}</strong>
          </div>
          <div>
            <span class="label">项目代币</span
            ><strong
              >{{ tokenName }}
              <span class="muted">{{ tokenSymbol }}</span></strong
            >
          </div>
          <div>
            <span class="label">网络状态</span><strong>{{ chainLabel }}</strong>
          </div>
          <div class="install-status">
            <span
              :class="[
                'status-dot',
                { error: configError, waiting: !identity },
              ]"
            ></span
            ><span>{{ statusMessage }}</span
            ><button v-if="configError" class="text-button" @click="loadConfig">
              重试
            </button>
          </div>
        </section>
        <section class="section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">EXPLORE</span>
              <h2>探索更多</h2>
              <p>一站式管理你的链上资产</p>
            </div>
          </div>
          <div class="explore-grid">
            <router-link
              v-for="card in explore"
              :key="card.path"
              :to="card.path"
              class="explore-card panel"
              ><span class="icon-box"><q-icon :name="card.icon" /></span
              ><span
                ><strong>{{ card.title }}</strong
                ><small>{{ card.description }}</small></span
              ><q-icon class="arrow" name="north_east"
            /></router-link>
          </div>
        </section>
      </template>

      <template v-else-if="route.path === '/presale'">
        <section class="page-heading">
          <span class="eyebrow">PRIVATE SALE</span>
          <h1>私募</h1>
          <p>发现当前开放的私募机会</p>
        </section>
        <div class="section-title">
          <h2>当前开放</h2>
          <span class="pill">数据待接入</span>
        </div>
        <div class="panel empty large-empty">
          <span class="empty-icon"><q-icon name="hourglass_empty" /></span>
          <h3>私募信息暂不可用</h3>
          <p>私募数据尚未接入，开放信息将在这里展示。</p>
        </div>
      </template>

      <template v-else-if="route.path === '/trade'">
        <section class="page-heading">
          <span class="eyebrow">TRADE</span>
          <h1>交易</h1>
          <p>查看行情，选择适合你的交易方式</p>
        </section>
        <div class="trade-grid">
          <section class="panel market">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">MARKET</span>
                <h2>{{ tokenSymbol }} <span class="muted">/ USDT</span></h2>
              </div>
              <span class="pill">行情待接入</span>
            </div>
            <div class="market-price">-- <small>USDT</small></div>
            <div class="market-meta">
              <span>24H 涨跌 <b>--</b></span
              ><span>24H 最高 <b>--</b></span
              ><span>24H 最低 <b>--</b></span
              ><span>24H 成交量 <b>--</b></span>
            </div>
            <div class="chart-empty">
              <q-icon name="show_chart" /><strong>行情数据暂不可用</strong
              ><span>接入行情后将在这里展示价格走势</span>
            </div>
          </section>
          <section class="panel trade-form">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">ORDER</span>
                <h2>交易下单</h2>
              </div>
              <span class="pill">功能待接入</span>
            </div>
            <div class="segmented">
              <button
                v-for="side in ['买入', '卖出']"
                :key="side"
                :class="{ selected: tradeSide === side }"
                @click="tradeSide = side"
              >
                {{ side }}
              </button>
            </div>
            <div class="order-tabs">
              <button
                v-for="type in ['市价', '限价']"
                :key="type"
                :class="{ selected: orderType === type }"
                @click="orderType = type"
              >
                {{ type }}
              </button>
            </div>
            <label class="field-label" for="price">价格 <span>USDT</span></label
            ><input
              v-if="orderType === '限价'"
              id="price"
              v-model="price"
              class="field"
              type="number"
              min="0"
              placeholder="请输入价格"
            />
            <div v-else id="price" class="field field-placeholder">
              以市场价格交易
            </div>
            <label class="field-label" for="amount"
              >数量 <span>{{ tokenSymbol }}</span></label
            ><input
              id="amount"
              v-model="amount"
              class="field"
              type="number"
              min="0"
              placeholder="请输入数量"
            />
            <div class="balance-line">可用余额 <span>--</span></div>
            <button class="button primary full" @click="tradeNotice = true">
              {{ tradeSide }} {{ tokenSymbol }}
            </button>
            <p v-if="tradeNotice" class="notice" role="status">
              交易功能尚未接入，当前不会提交订单或发起链上交易。
            </p>
          </section>
        </div>
      </template>

      <template v-else-if="route.path === '/mine'">
        <section class="page-heading">
          <span class="eyebrow">MY ACCOUNT</span>
          <h1>我的</h1>
          <p>你的资产与权益，集中管理</p>
        </section>
        <section class="account-banner panel">
          <div>
            <span class="icon-box"
              ><q-icon name="account_balance_wallet"
            /></span>
            <div>
              <h2>我的账户</h2>
              <p>连接钱包后，未来可查看你的链上资产与权益</p>
            </div>
          </div>
          <span class="pill">业务功能待接入</span>
        </section>
        <div class="section-title">
          <h2>我的服务</h2>
          <span class="muted">全部功能</span>
        </div>
        <div class="feature-grid">
          <router-link
            v-for="feature in features"
            :key="feature.key"
            :to="`/mine/${feature.key}`"
            class="feature-card panel"
            ><span class="icon-box"><q-icon :name="feature.icon" /></span
            ><span
              ><strong>{{ feature.title }}</strong
              ><small>{{ feature.description }}</small></span
            ><q-icon class="arrow" name="chevron_right"
          /></router-link>
        </div>
      </template>

      <template v-else-if="currentFeature">
        <router-link class="back-link" to="/mine"
          ><q-icon name="arrow_back" /> 返回我的</router-link
        >
        <section class="page-heading detail-heading">
          <span class="eyebrow">MY ACCOUNT / {{ currentFeature.english }}</span>
          <h1>{{ currentFeature.title }}</h1>
          <p>{{ currentFeature.description }}</p>
        </section>
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
          {{ currentFeature.title }}功能尚未接入，暂无法操作。
        </p>
        <div class="section-title">
          <h2>{{ currentFeature.list }}</h2>
          <span class="pill">数据待接入</span>
        </div>
        <div class="panel empty">
          <span class="empty-icon"><q-icon :name="currentFeature.icon" /></span>
          <h3>{{ currentFeature.list }}暂不可用</h3>
          <p>相关数据接入后将在这里展示。</p>
        </div>
      </template>
    </main>
    <nav class="mobile-nav" aria-label="手机主导航">
      <router-link
        v-for="item in navigation"
        :key="item.path"
        :to="item.path"
        :class="{ active: activeSection === item.path }"
        ><q-icon :name="item.icon" /><span>{{ item.label }}</span></router-link
      >
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  loadPublicInstallationConfig,
  type PublicInstallationConfig,
} from "@chainforge/shared-types";
import WalletConnect from "../components/WalletConnect.vue";

const route = useRoute();
const navigation = [
  { path: "/", label: "首页", icon: "home" },
  { path: "/presale", label: "私募", icon: "local_fire_department" },
  { path: "/trade", label: "交易", icon: "swap_horiz" },
  { path: "/mine", label: "我的", icon: "person_outline" },
];
const features = [
  {
    key: "assets",
    title: "资产",
    english: "ASSETS",
    icon: "account_balance_wallet",
    description: "查看和管理你的数字资产",
    metric: "资产总览",
    hint: "资产余额与估值待接入",
    action: "查看资产",
    list: "资产记录",
  },
  {
    key: "staking",
    title: "质押",
    english: "STAKING",
    icon: "savings",
    description: "查看质押资产与奖励",
    metric: "质押总额",
    hint: "质押数据与奖励待接入",
    action: "参与质押",
    list: "质押记录",
  },
  {
    key: "lock",
    title: "锁仓",
    english: "LOCK",
    icon: "lock_outline",
    description: "管理锁仓资产与到期记录",
    metric: "锁仓总额",
    hint: "锁仓数据待接入",
    action: "创建锁仓",
    list: "锁仓记录",
  },
  {
    key: "referral",
    title: "推广",
    english: "REFERRAL",
    icon: "share",
    description: "邀请好友，查看推广信息",
    metric: "推广概览",
    hint: "邀请信息与推广数据待接入",
    action: "邀请好友",
    list: "推广记录",
  },
  {
    key: "team",
    title: "团队",
    english: "TEAM",
    icon: "groups",
    description: "查看你的团队与成员",
    metric: "团队人数",
    hint: "团队数据待接入",
    action: "查看成员",
    list: "团队成员",
  },
  {
    key: "points",
    title: "积分",
    english: "POINTS",
    icon: "stars",
    description: "查看积分余额与明细",
    metric: "可用积分",
    hint: "积分余额与明细待接入",
    action: "查看积分",
    list: "积分记录",
  },
  {
    key: "lottery",
    title: "积分抽奖",
    english: "LOTTERY",
    icon: "redeem",
    description: "使用积分探索更多惊喜",
    metric: "可用积分",
    hint: "抽奖活动与积分数据待接入",
    action: "参与抽奖",
    list: "抽奖记录",
  },
];
const explore = [
  {
    path: "/presale",
    title: "探索私募",
    description: "了解当前开放的私募",
    icon: "local_fire_department",
  },
  {
    path: "/trade",
    title: "快捷交易",
    description: "行情与交易一目了然",
    icon: "swap_horiz",
  },
  {
    path: "/mine",
    title: "我的资产",
    description: "管理你的资产与权益",
    icon: "account_balance_wallet",
  },
];
const activeSection = computed(() =>
  route.path.startsWith("/mine") ? "/mine" : route.path,
);
const currentFeature = computed(() =>
  features.find((item) => item.key === route.params.feature),
);
const identity = ref<PublicInstallationConfig | null>(null);
const configError = ref("");
const loading = ref(true);
const systemName = computed(() => identity.value?.systemName || "链构");
const tokenName = computed(() => identity.value?.tokenName || "项目代币");
const tokenSymbol = computed(() => identity.value?.tokenSymbol || "TOKEN");
const chainLabel = computed(() =>
  identity.value?.installationStatus === "ready" && identity.value.chainId
    ? `ChainId ${identity.value.chainId}`
    : "--",
);
const statusMessage = computed(() =>
  loading.value
    ? "正在读取安装状态"
    : configError.value
      ? `安装状态读取失败：${configError.value}`
      : identity.value?.installationStatus === "ready"
        ? "安装已完成"
        : identity.value?.installationStatus === "deployment_pending"
          ? "等待合约部署"
          : "系统尚未初始化",
);
const tradeSide = ref("买入");
const orderType = ref("市价");
const price = ref("");
const amount = ref("");
const tradeNotice = ref(false);
const detailNotice = ref(false);
// 路由切换后不保留上一功能的操作提示。
watch(
  () => route.path,
  () => {
    detailNotice.value = false;
    tradeNotice.value = false;
  },
);
async function loadConfig() {
  loading.value = true;
  configError.value = "";
  try {
    identity.value = await loadPublicInstallationConfig();
  } catch (error) {
    configError.value =
      error instanceof Error ? error.message : "无法读取安装身份配置。";
  } finally {
    loading.value = false;
  }
}
document.title = "链构（ChainForge）用户端";
onMounted(loadConfig);
</script>
