<template>
  <q-layout view="hHh Lpr fFf" class="admin-layout">
    <q-header class="topbar">
      <q-toolbar>
        <q-btn
          flat
          round
          dense
          icon="menu"
          aria-label="打开导航"
          class="mobile-menu-button"
          @click="drawerOpen = !drawerOpen"
        />
        <div class="topbar-brand">
          <span class="brand-symbol">链</span>
          <span>{{ systemName }}</span>
        </div>
        <q-space />
        <span class="user-role">{{ auth.user?.roleName }}</span>
        <q-btn flat round icon="account_circle" aria-label="当前账号">
          <q-menu anchor="bottom right" self="top right">
            <q-list style="min-width: 180px">
              <q-item>
                <q-item-section>
                  <q-item-label>{{ auth.user?.username }}</q-item-label>
                  <q-item-label caption>{{ auth.user?.roleName }}</q-item-label>
                </q-item-section>
              </q-item>
              <q-separator />
              <q-item v-close-popup clickable @click="logout">
                <q-item-section avatar><q-icon name="logout" /></q-item-section>
                <q-item-section>退出登录</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="drawerOpen"
      show-if-above
      :breakpoint="820"
      :width="256"
      class="sidebar"
    >
      <div class="sidebar-intro">
        <span class="sidebar-kicker">CHAINFORGE CONTROL</span>
        <strong>管理控制台</strong>
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
        <router-view />
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { loadAdminInitializationStatus } from "@filereset/shared-types";
import { useRoute, useRouter } from "vue-router";
import AdminMenuBranch from "../components/AdminMenuBranch.vue";
import { adminRequest } from "../services/admin-api";
import { adminSession, clearAdminSession } from "../services/admin-session";

const auth = adminSession;
const router = useRouter();
const route = useRoute();
const drawerOpen = ref(false);
const systemName = ref("链构");
const logoutError = ref("");
const pageTitle = computed(() =>
  typeof route.meta.title === "string" ? route.meta.title : "管理后台",
);

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
  background: #f3f6fa;
}

.topbar {
  border-bottom: 1px solid #e8edf4;
  background: #fff;
  color: #16233b;
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
  background: #ffc832;
  color: #14213d;
  font-size: 15px;
  place-items: center;
}

.user-role {
  margin-right: 8px;
  color: #7b8798;
  font-size: 12px;
}

.sidebar {
  background: #17243b;
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
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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
  min-height: 100vh;
  padding: 30px clamp(18px, 3vw, 40px) 48px;
  color: #202d42;
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
  color: #8490a2;
  font-size: 12px;
}

.breadcrumb span {
  margin: 0 6px;
  color: #c3cad4;
}

.content-topline h1 {
  margin: 0;
  color: #17243b;
  font-size: clamp(24px, 3vw, 30px);
  font-weight: 750;
}

.version-badge {
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
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
    padding-top: 22px;
  }
}
</style>
