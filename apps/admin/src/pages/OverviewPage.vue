<template>
  <section class="overview-page">
    <q-card flat bordered class="welcome-card">
      <div class="welcome-icon"><q-icon name="dashboard" /></div>
      <div class="welcome-copy">
        <p class="eyebrow">CHAINFORGE CONTROL</p>
        <h2>欢迎使用管理后台</h2>
        <p>从概览开始，查看系统管理入口并继续日常配置。</p>
      </div>
      <q-badge color="positive" text-color="dark" class="ready-badge">
        <q-icon name="check_circle" size="16px" class="q-mr-xs" />
        管理会话已建立
      </q-badge>
    </q-card>

    <div class="shortcut-grid">
      <q-card
        v-for="shortcut in shortcuts"
        :key="shortcut.path"
        flat
        bordered
        class="shortcut-card cursor-pointer"
        @click="router.push(shortcut.path)"
      >
        <div class="shortcut-icon">
          <q-icon :name="shortcut.icon" />
        </div>
        <div class="shortcut-copy">
          <h3>{{ shortcut.title }}</h3>
          <p>{{ shortcut.description }}</p>
        </div>
        <q-icon name="arrow_forward" class="shortcut-arrow" />
      </q-card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { canAccess } from "../services/admin-session";

defineOptions({ name: "OverviewPage" });

const router = useRouter();
const shortcuts = computed(() =>
  [
    {
      title: "管理员",
      description: "管理后台登录账号与所属角色。",
      path: "/administrators",
      icon: "admin_panel_settings",
      permission: "admins:read",
    },
    {
      title: "权限菜单",
      description: "维护管理后台的多级导航菜单。",
      path: "/menus",
      icon: "account_tree",
      permission: "menus:read",
    },
    {
      title: "角色",
      description: "配置角色权限与账号访问范围。",
      path: "/roles",
      icon: "badge",
      permission: "roles:read",
    },
    {
      title: "系统设置",
      description: "维护安装身份、管理员密码策略和界面主题。",
      path: "/settings",
      icon: "tune",
      permission: "settings:read",
    },
  ].filter((shortcut) => canAccess(shortcut.permission)),
);
</script>

<style lang="scss" scoped>
.overview-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.welcome-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 28px;
  border-color: var(--admin-border);
  border-radius: 18px;
  background:
    radial-gradient(
      circle at 92% 10%,
      color-mix(in srgb, var(--admin-primary) 18%, transparent),
      transparent 34%
    ),
    var(--admin-surface);
}

.welcome-icon,
.shortcut-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  color: var(--admin-primary);
  background: color-mix(
    in srgb,
    var(--admin-primary) 22%,
    var(--admin-surface)
  );
}

.welcome-icon {
  width: 58px;
  height: 58px;
  border-radius: 17px;
  font-size: 28px;
}

.welcome-copy {
  flex: 1;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--admin-primary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.welcome-copy h2 {
  margin: 0;
  color: var(--admin-text);
  font-size: 22px;
}

.welcome-copy p:last-child {
  margin: 8px 0 0;
  color: var(--admin-muted-text);
}

.ready-badge {
  align-self: flex-start;
  padding: 8px 10px;
  border-radius: 999px;
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.shortcut-card {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 116px;
  padding: 20px;
  border-color: var(--admin-border);
  border-radius: 16px;
  background: var(--admin-surface);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    border-color 160ms ease;

  &:hover {
    transform: translateY(-2px);
    border-color: var(--admin-primary);
    box-shadow: 0 12px 28px rgba(23, 43, 77, 0.08);
  }
}

.shortcut-icon {
  width: 44px;
  height: 44px;
  border-radius: 13px;
  font-size: 22px;
}

.shortcut-copy {
  flex: 1;
}

.shortcut-copy h3 {
  margin: 0 0 6px;
  color: var(--admin-text);
  font-size: 15px;
}

.shortcut-copy p {
  margin: 0;
  color: var(--admin-muted-text);
  font-size: 12px;
  line-height: 1.5;
}

.shortcut-arrow {
  color: #98a2b3;
}

@media (max-width: 720px) {
  .welcome-card {
    flex-wrap: wrap;
    padding: 22px;
  }

  .ready-badge {
    margin-left: 78px;
  }

  .shortcut-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
