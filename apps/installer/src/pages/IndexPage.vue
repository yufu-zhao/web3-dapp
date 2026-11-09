<template>
  <q-layout view="lHh Lpr lFf" class="installer-layout">
    <q-page-container class="installer-container">
      <q-page class="installer-page">
        <div class="installer-frame">
          <aside class="sidebar">
            <div class="brand-row">
              <img
                class="brand-mark"
                src="/brand/chainforge-mark-transparent.png"
                alt=""
                aria-hidden="true"
              />
              <div><strong>链构</strong><span>ChainForge 安装器</span></div>
            </div>
            <div class="sidebar-intro">
              <span class="release-label">INSTALLATION</span>
              <h1>部署您的<br />Web3 DApp 系统</h1>
              <p>服务器检查、数据库初始化与合约部署。</p>
            </div>
            <nav class="step-navigation" aria-label="安装步骤">
              <button
                v-for="(item, index) in steps"
                :key="item.path"
                class="step-nav-item"
                :class="{ 'is-current': route.path.startsWith(item.path) }"
                :disabled="!canOpen(item.path)"
                @click="openStep(item.path)"
              >
                <span class="step-number">0{{ index + 1 }}</span>
                <span class="step-nav-copy">
                  <strong class="title">{{ item.title }}</strong>
                  <small>{{ item.subtitle }}</small>
                </span>
                <q-icon
                  v-if="route.path.startsWith(item.path)"
                  name="chevron_right"
                  size="20px"
                />
              </button>
            </nav>
            <div class="sidebar-footer">
              <span class="secure-dot" /><span>安装数据由本机安装服务处理</span>
            </div>
          </aside>

          <main class="content-panel">
            <header class="topbar">
              <div>
                <span class="topbar-label"
                  >链构（CHAINFORGE） / INSTALLATION</span
                >
                <p>安装向导 <span>·</span> {{ currentStep }} / 4</p>
              </div>
              <q-badge
                class="connection-badge"
                :class="flow.bootstrapped ? 'is-online' : 'is-checking'"
              >
                <span class="badge-dot" />{{
                  flow.bootstrapped ? "安装服务已连接" : "正在连接安装服务"
                }}
              </q-badge>
            </header>
            <div class="content-scroll"><RouterView /></div>
            <footer class="content-footer">
              <span>ChainForge Installation</span
              ><span>安全安装 · 版本 0.1.0</span>
            </footer>
          </main>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  bootstrapInstallerFlow,
  installerFlow,
} from "../services/installer-flow";

const route = useRoute();
const router = useRouter();
const flow = installerFlow;
const steps = [
  { path: "/environment", title: "环境检查", subtitle: "运行环境与服务" },
  { path: "/database", title: "数据库连接", subtitle: "初始化核心数据" },
  { path: "/deploy", title: "部署合约", subtitle: "按计划逐步部署" },
  { path: "/complete", title: "完成", subtitle: "安装资料与输出位置" },
];
const currentStep = computed(() =>
  Math.max(1, steps.findIndex((item) => route.path.startsWith(item.path)) + 1),
);

function canOpen(path: string) {
  if (path === "/environment") return true;
  if (path === "/database") return flow.environmentReady;
  if (path === "/deploy")
    return (
      flow.environmentReady &&
      flow.databaseReady &&
      !flow.databaseReinitializing &&
      Boolean(flow.summary.installation)
    );
  return (
    !flow.databaseReinitializing &&
    (route.path.startsWith("/complete") || Boolean(flow.selectedDeployment))
  );
}

function openStep(path: string) {
  if (path === "/complete" && flow.selectedDeployment) {
    void router.push({
      path: `/complete/${flow.selectedDeployment.deploymentId}`,
      query: { chainId: String(flow.selectedDeployment.chainId) },
    });
    return;
  }
  void router.push(path);
}

onMounted(async () => {
  await bootstrapInstallerFlow();
  if (route.path === "/") await router.replace("/environment");
});
</script>

<style lang="scss" scoped>
.installer-layout {
  min-width: 360px;
  min-height: 100dvh;
  background: #f4f6f8;
  color: #182230;
}
.installer-container {
  min-height: 100vh;
}
.installer-page {
  height: 100dvh;
  min-height: 0;
  padding: 24px;
}
.installer-frame {
  display: grid;
  width: min(1440px, 100%);
  height: calc(100dvh - 48px);
  min-height: 0;
  margin: 0 auto;
  overflow: hidden;
  grid-template-columns: 285px minmax(0, 1fr);
  border: 1px solid #e5e8ed;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 24px 80px #34405412;
}
.sidebar {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 28px 20px;
  background: #151d2c;
  color: #fff;
}
.brand-row {
  display: flex;
  align-items: center;
  // gap: 12px;
}
.brand-mark {
  display: block;
  width: 60px;
  height: 60px;
  flex: 0 0 auto;
  border-radius: 13px;
  object-fit: cover;
}
.brand-row strong,
.brand-row span {
  display: block;
}
.brand-row strong {
  font-size: 15px;
}
.brand-row span {
  margin-top: 4px;
  color: #a8b0bf;
  font-size: 11px;
}
.sidebar-intro {
  margin: 54px 4px 28px;
}
.release-label,
.topbar-label {
  color: #f4c844;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.15em;
}
.sidebar-intro h1 {
  margin: 13px 0 10px;
  font-size: 25px;
  line-height: 1.34;
}
.sidebar-intro p {
  margin: 0;
  color: #aab3c2;
  font-size: 12px;
  line-height: 1.8;
}
.step-navigation {
  display: grid;
  gap: 8px;
}
.step-nav-item {
  display: flex;
  width: 100%;
  min-height: 68px;
  align-items: center;
  gap: 12px;
  padding: 10px 11px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: #aab3c2;
  cursor: pointer;
  text-align: left;
}
.step-nav-item:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}
.step-nav-item.is-current {
  background: #ffffff14;
  color: #fff;
}
.step-number {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid #576173;
  border-radius: 50%;
  color: #d4dae4;
  font-size: 10px;
  font-weight: 800;
  place-items: center;
}
.is-current .step-number {
  border-color: #ffc832;
  background: #ffc832;
  color: #242b38;
}
.step-nav-copy {
  display: grid;
  flex: 1;
  gap: 4px;
}
.step-nav-copy strong {
  font-size: 12px;
}
.step-nav-copy small {
  color: #a1aabc;
  font-size: 10px;
}
.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding: 18px 4px 0;
  color: #aab3c2;
  font-size: 10px;
}
.secure-dot,
.badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #50c878;
}
.content-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}
.topbar {
  display: flex;
  min-height: 70px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 30px;
  border-bottom: 1px solid #edf0f3;
}
.topbar-label {
  color: #98a2b3;
}
.topbar p {
  margin: 5px 0 0;
  color: #253044;
  font-size: 12px;
  font-weight: 700;
}
.topbar p span {
  color: #aab2bf;
}
.connection-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border-radius: 20px;
  background: #ecfdf3;
  color: #18794e;
  font-size: 10px;
}
.is-checking {
  background: #fff8e1;
  color: #866400;
}
.content-scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.content-footer {
  display: flex;
  flex: 0 0 auto;
  justify-content: space-between;
  padding: 13px 30px;
  border-top: 1px solid #edf0f3;
  color: #9aa3b1;
  font-size: 10px;
}
@media (max-width: 800px) {
  .installer-page {
    padding: 0;
  }
  .installer-frame {
    width: 100%;
    height: 100dvh;
    min-height: 0;
    grid-template-columns: 1fr;
    /* 侧栏按导航自身定高，剩余视口交给内容区，避免自动网格把侧栏拉长。 */
    grid-template-rows: max-content minmax(0, 1fr);
    overflow: auto;
    border: 0;
    border-radius: 0;
  }
  .sidebar {
    padding: 14px 16px;
  }
  .sidebar-intro,
  .sidebar-footer {
    display: none;
  }
  .brand-row {
    margin-bottom: 12px;
  }
  .step-navigation {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
  }
  .step-nav-item {
    min-height: 48px;
    justify-content: center;
    padding: 5px;
  }
  .step-number {
    width: 28px;
    height: 28px;
  }
  .step-nav-item > .q-icon {
    display: none;
  }
  .step-nav-copy {
    flex: none;
    > small {
      display: none;
    }
  }
  .content-panel {
    min-height: 0;
  }
  .topbar {
    min-height: 62px;
    padding: 12px 16px;
  }
  .content-footer {
    padding: 12px 16px;
  }
}
</style>
