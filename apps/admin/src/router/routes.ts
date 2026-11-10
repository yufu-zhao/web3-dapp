import type { RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: () => import("../layouts/AdminLayout.vue"),
    meta: { requiresAuth: true, title: "概览" },
    children: [
      {
        path: "",
        component: () => import("../pages/OverviewPage.vue"),
        meta: {
          title: "概览",
          icon: "dashboard",
          keepAliveName: "OverviewPage",
        },
      },
    ],
  },
  {
    path: "/init",
    component: () => import("../pages/IndexPage.vue"),
    meta: { title: "初始化检查", public: true },
  },
  {
    path: "/login",
    component: () => import("../pages/LoginPage.vue"),
    meta: { title: "登录", public: true },
  },
  {
    path: "/administrators",
    component: () => import("../layouts/AdminLayout.vue"),
    meta: { requiresAuth: true, permission: "admins:read", title: "管理员" },
    children: [
      {
        path: "",
        component: () => import("../pages/AdministratorsPage.vue"),
        meta: {
          permission: "admins:read",
          title: "管理员",
          icon: "admin_panel_settings",
          keepAliveName: "AdministratorsPage",
        },
      },
    ],
  },
  {
    path: "/menus",
    component: () => import("../layouts/AdminLayout.vue"),
    meta: { requiresAuth: true, permission: "menus:read", title: "权限菜单" },
    children: [
      {
        path: "",
        component: () => import("../pages/MenusPage.vue"),
        meta: {
          permission: "menus:read",
          title: "权限菜单",
          icon: "account_tree",
          keepAliveName: "MenusPage",
        },
      },
    ],
  },
  {
    path: "/roles",
    component: () => import("../layouts/AdminLayout.vue"),
    meta: { requiresAuth: true, permission: "roles:read", title: "角色" },
    children: [
      {
        path: "",
        component: () => import("../pages/RolesPage.vue"),
        meta: {
          permission: "roles:read",
          title: "角色",
          icon: "badge",
          keepAliveName: "RolesPage",
        },
      },
    ],
  },
  {
    path: "/presale",
    component: () => import("../layouts/AdminLayout.vue"),
    meta: { requiresAuth: true, permission: "presale:read", title: "私募" },
    children: [
      {
        path: "",
        component: () => import("../pages/PresalePage.vue"),
        meta: {
          permission: "presale:read",
          title: "私募",
          icon: "payments",
          keepAliveName: "PresalePage",
        },
      },
    ],
  },
  {
    path: "/settings",
    component: () => import("../layouts/AdminLayout.vue"),
    meta: {
      requiresAuth: true,
      permission: "settings:read",
      title: "系统设置",
    },
    children: [
      {
        path: "",
        component: () => import("../pages/SettingsPage.vue"),
        meta: {
          permission: "settings:read",
          title: "系统设置",
          icon: "tune",
          keepAliveName: "SettingsPage",
        },
      },
    ],
  },
  {
    path: "/carousel",
    component: () => import("../layouts/AdminLayout.vue"),
    meta: { requiresAuth: true, permission: "content:read", title: "轮播管理" },
    children: [
      {
        path: "",
        component: () => import("../pages/ContentManagementPage.vue"),
        meta: {
          permission: "content:read",
          title: "轮播管理",
          icon: "view_carousel",
          keepAliveName: "ContentManagementPage",
        },
      },
    ],
  },
  {
    path: "/announcements",
    component: () => import("../layouts/AdminLayout.vue"),
    meta: { requiresAuth: true, permission: "content:read", title: "公告管理" },
    children: [
      {
        path: "",
        component: () => import("../pages/ContentManagementPage.vue"),
        meta: {
          permission: "content:read",
          title: "公告管理",
          icon: "campaign",
          keepAliveName: "ContentManagementPage",
        },
      },
    ],
  },
  {
    path: "/presale-records",
    component: () => import("../layouts/AdminLayout.vue"),
    meta: {
      requiresAuth: true,
      permission: "presale:records:read",
      title: "私募记录",
    },
    children: [
      {
        path: "",
        component: () => import("../pages/PresaleRecordsPage.vue"),
        meta: {
          permission: "presale:records:read",
          title: "私募记录",
          icon: "receipt_long",
          keepAliveName: "PresaleRecordsPage",
        },
      },
    ],
  },
  {
    path: "/content-management",
    redirect: "/carousel",
  },
  {
    path: "/forbidden",
    component: () => import("../pages/ForbiddenPage.vue"),
    meta: { requiresAuth: true, title: "无权访问" },
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
];

export default routes;
