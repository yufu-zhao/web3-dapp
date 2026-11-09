<template>
  <q-layout view="lHh Lpr fFf" class="admin-layout">
    <q-header class="topbar">
      <q-toolbar class="q-gutter-x-lg">
        <q-btn
          flat
          round
          dense
          icon="menu"
          aria-label="打开导航"
          @click="drawerOpen = !drawerOpen"
        />
        <q-space />
        <div class="flex items-center">
          <q-btn
            flat
            round
            dense
            color="grey"
            :icon="$q.fullscreen.isActive ? 'fullscreen_exit' : 'fullscreen'"
            @click="$q.fullscreen.toggle()"
          >
            <q-tooltip>
              {{ $q.fullscreen.isActive ? "Exit Fullscreen" : "Go Fullscreen" }}
            </q-tooltip>
          </q-btn>

          <q-btn
            flat
            round
            dense
            icon="delete_forever"
            aria-label="清理缓存"
            color="grey"
          >
            <q-tooltip>清理缓存</q-tooltip>
          </q-btn>
        </div>
        <div class="flex items-center">
          <span class="user-role">{{ auth.user?.roleName }}</span>
          <q-btn flat round icon="account_circle" aria-label="当前账号">
            <q-menu anchor="bottom right" self="top right">
              <q-list style="min-width: 180px">
                <q-item>
                  <q-item-section>
                    <q-item-label>{{ auth.user?.username }}</q-item-label>
                    <q-item-label caption>
                      {{ auth.user?.roleName }}
                    </q-item-label>
                  </q-item-section>
                </q-item>
                <q-separator />
                <q-item v-close-popup clickable @click="logout">
                  <q-item-section avatar>
                    <q-icon name="logout" />
                  </q-item-section>
                  <q-item-section>退出登录</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>
      </q-toolbar>
      <q-separator />
      <AdminTabBar :tabs="tabItems" @open="openTab" @close="closeTab" />
    </q-header>

    <q-drawer
      v-model="drawerOpen"
      show-if-above
      :breakpoint="820"
      :width="256"
      class="sidebar"
      :bordered="false"
      style="background-color: #151d2c"
    >
      <div class="q-pa-md flex items-center">
        <q-img
          src="brand/chainforge-logo-horizontal.svg"
          alt="logo"
          height="38"
        />
      </div>
      <q-separator dark inset />
      <div class="q-pa-md">
        <div class="sidebar-kicker">CHAINFORGE CONTROL</div>
        <strong class="text-white">管理控制台</strong>
      </div>
      <q-list class="sidebar-list">
        <AdminMenuBranch :items="auth.menus" />
      </q-list>

      <div class="sidebar-footer"><span class="status-dot" />系统运行中</div>
    </q-drawer>

    <q-page-container>
      <q-page class="content-page">
        <q-banner v-if="logoutError" rounded class="logout-error">
          <template #avatar><q-icon name="error_outline" /></template>
          {{ logoutError }}
        </q-banner>
        <div class="content-topline">
          <div>
            <p class="breadcrumb">管理后台 <span>/</span> {{ pageTitle }}</p>
            <h1>{{ pageTitle }}</h1>
          </div>
          <q-badge color="white" text-color="grey-8" class="version-badge">
            MVP
          </q-badge>
        </div>
        <router-view v-slot="{ Component, route: viewRoute }">
          <!-- 缓存仍有打开标签的页面，手动关闭标签后由 include 释放实例。 -->
          <keep-alive :include="cachedComponentNames">
            <component :is="Component" :key="viewRoute.path" />
          </keep-alive>
        </router-view>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { loadAdminInitializationStatus } from "@chainforge/shared-types";
import { useRoute, useRouter } from "vue-router";
import AdminMenuBranch from "../components/AdminMenuBranch.vue";
import AdminTabBar from "../components/AdminTabBar.vue";
import { adminRequest } from "../services/admin-api";
import { adminSession, clearAdminSession } from "../services/admin-session";
import {
  loadAdminPageTabs,
  saveAdminPageTabs,
  type AdminPageTab,
} from "../services/admin-tabs";

const auth = adminSession;
const router = useRouter();
const route = useRoute();
const drawerOpen = ref(false);
const systemName = ref("链构");
const logoutError = ref("");
const openTabs = ref<AdminPageTab[]>([{ path: "/", title: "概览" }]);
let tabsUserId: string | null = null;
const tabItems = computed(() =>
  openTabs.value.map((tab) => ({
    ...tab,
    icon: iconForTab(tab),
    active: isActiveTab(tab),
  })),
);
const pageTitle = computed(() =>
  typeof route.meta.title === "string" ? route.meta.title : "管理后台",
);
const cachedComponentNames = computed(() => {
  const names = openTabs.value
    .map((tab) => router.resolve(tab.path).meta.keepAliveName)
    .filter((name): name is string => typeof name === "string");
  return [...new Set(names)];
});

function pageTabForCurrentRoute(): AdminPageTab | null {
  if (!route.matched.some((record) => record.meta.requiresAuth)) return null;
  if (typeof route.meta.title !== "string") return null;

  return { path: route.fullPath, title: route.meta.title };
}

function isAuthorizedPageTab(tab: AdminPageTab) {
  const resolved = router.resolve(tab.path);
  if (!resolved.matched.some((record) => record.meta.requiresAuth))
    return false;

  const permission = resolved.meta.permission;
  return (
    typeof permission !== "string" ||
    auth.user?.permissions.includes("*") ||
    auth.user?.permissions.includes(permission) === true
  );
}

function persistOpenTabs() {
  if (tabsUserId) saveAdminPageTabs(tabsUserId, openTabs.value);
}

function restoreOpenTabs(userId: string) {
  tabsUserId = userId;
  const restoredByRoute = new Map<string, AdminPageTab>();
  for (const tab of loadAdminPageTabs(userId).filter(isAuthorizedPageTab)) {
    const path = router.resolve(tab.path).path;
    if (!restoredByRoute.has(path)) restoredByRoute.set(path, tab);
  }

  openTabs.value = [...restoredByRoute.values()];
  addCurrentRouteTab();
  persistOpenTabs();
}

function addCurrentRouteTab() {
  if (!tabsUserId || tabsUserId !== auth.user?.id) return;
  const currentTab = pageTabForCurrentRoute();
  if (!currentTab || !isAuthorizedPageTab(currentTab)) return;

  const existingIndex = openTabs.value.findIndex(
    (tab) => router.resolve(tab.path).path === route.path,
  );
  if (existingIndex >= 0) {
    openTabs.value[existingIndex] = currentTab;
  } else {
    openTabs.value.push(currentTab);
  }

  persistOpenTabs();
}

function isActiveTab(tab: AdminPageTab) {
  return router.resolve(tab.path).path === route.path;
}

function iconForTab(tab: AdminPageTab) {
  const icon = router.resolve(tab.path).meta.icon;
  return typeof icon === "string" ? icon : "article";
}

function openTab(path: string) {
  void router.push(path);
}

function closeTab(index: number) {
  const tab = openTabs.value[index];
  if (!tab) return;
  const closingActiveTab = isActiveTab(tab);

  if (openTabs.value.length === 1) {
    // 工作台需要至少保留一个可见标签；关闭最后一页后回到概览。
    openTabs.value = [{ path: "/", title: "概览" }];
    persistOpenTabs();
    if (!isActiveTab(openTabs.value[0]!)) void router.push("/");
    return;
  }

  openTabs.value.splice(index, 1);
  persistOpenTabs();

  if (closingActiveTab) {
    const fallback = openTabs.value[index - 1] ??
      openTabs.value[index] ?? {
        path: "/",
        title: "概览",
      };
    void router.push(fallback.path);
  }
}

function handleSessionExpired() {
  if (route.path === "/login") return;
  const redirect = route.fullPath;
  clearAdminSession();
  void router.replace({ path: "/login", query: { redirect } });
}

watch(
  [systemName, pageTitle],
  ([system, title]) => {
    document.title = `${title} · ${system}管理后台`;
  },
  { immediate: true },
);

onMounted(async () => {
  window.addEventListener("admin-session-expired", handleSessionExpired);
  try {
    const status = await loadAdminInitializationStatus();
    if (status.state === "ready")
      systemName.value = status.installation.systemName;
  } catch {
    // 已登录页面保留默认品牌，具体请求故障由对应数据页显示。
  }
});

onUnmounted(() => {
  window.removeEventListener("admin-session-expired", handleSessionExpired);
});

watch(
  () => auth.user?.id,
  (userId) => {
    if (userId && userId !== tabsUserId) restoreOpenTabs(userId);
  },
  { immediate: true },
);

watch(
  () => route.fullPath,
  () => addCurrentRouteTab(),
);

async function logout() {
  logoutError.value = "";
  try {
    await adminRequest<void>("/auth/logout", { method: "POST" });
    clearAdminSession();
    await router.replace("/login");
  } catch (error) {
    logoutError.value =
      error instanceof Error
        ? error.message
        : "退出登录失败，请检查 API 服务。";
  }
}
</script>

<style lang="scss" scoped>
.admin-layout {
  background: var(--admin-background);
}

.topbar {
  background: var(--admin-surface);
  color: var(--admin-text);
}

.topbar :deep(.q-toolbar) {
  min-height: 60px;
  padding: 0 22px;
}

.topbar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
}

.brand-symbol {
  display: grid;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--admin-primary);
  color: #14213d;
  font-size: 15px;
  place-items: center;
}

.user-role {
  margin-right: 8px;
  color: var(--admin-muted-text);
  font-size: 12px;
}

.sidebar {
  background-color: #151d2c;
  color: #e5eaf2;
}

.sidebar-intro {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 28px 24px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-kicker {
  color: #8997ad;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.sidebar-intro strong {
  color: #fff;
  font-size: 18px;
}

.sidebar-list {
  padding: 16px 12px;
}

.sidebar-footer {
  position: absolute;
  right: 20px;
  bottom: 20px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid $separator-dark-color;
  color: #9ba8bc;
  font-size: 11px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.12);
}

.content-page {
  padding: 28px clamp(18px, 3vw, 40px) 48px;
  background: var(--admin-background);
  color: var(--admin-text);
}

.content-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

.logout-error {
  margin-bottom: 18px;
  background: #fff0f1;
  color: #a92a3c;
}

.breadcrumb {
  margin: 0 0 8px;
  color: var(--admin-muted-text);
  font-size: 12px;
}

.breadcrumb span {
  margin: 0 6px;
  color: #c3cad4;
}

.content-topline h1 {
  margin: 0;
  color: var(--admin-text);
  font-size: clamp(24px, 3vw, 30px);
  font-weight: 750;
}

.version-badge {
  padding: 6px 10px;
  border: 1px solid var(--admin-border);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.mobile-menu-button {
  display: none;
}

@media (max-width: 820px) {
  .mobile-menu-button {
    display: inline-flex;
    margin-right: 8px;
  }

  .content-page {
    padding-top: 20px;
  }
}
</style>
