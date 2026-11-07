import type { RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: () => import("../pages/IndexPage.vue"),
    meta: { title: "初始化检查" },
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
        meta: { permission: "admins:read", title: "管理员" },
      },
    ],
  },
  {
    path: "/menus",
    component: () => import("../layouts/AdminLayout.vue"),
    meta: { requiresAuth: true, permission: "menus:read", title: "系统菜单" },
    children: [
      {
        path: "",
        component: () => import("../pages/MenusPage.vue"),
        meta: { permission: "menus:read", title: "系统菜单" },
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
        meta: { permission: "roles:read", title: "角色" },
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
        meta: { permission: "settings:read", title: "系统设置" },
      },
    ],
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
