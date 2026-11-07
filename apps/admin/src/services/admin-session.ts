import { reactive } from "vue";
import {
  AdminApiError,
  adminRequest,
  type AdminMenu,
  type AdminSessionPayload,
  type AdminIdentity,
} from "./admin-api";

export const adminSession = reactive({
  checked: false,
  loading: false,
  user: null as AdminIdentity | null,
  menus: [] as AdminMenu[],
});

let sessionRequest: Promise<AdminSessionPayload | null> | undefined;

// 认证信息只保存在内存；浏览器会话由服务端 HttpOnly Cookie 管理。
export function loadAdminSession(force = false) {
  if (sessionRequest && !force) return sessionRequest;
  if (adminSession.checked && !force) {
    return Promise.resolve(
      adminSession.user
        ? { user: adminSession.user, menus: adminSession.menus }
        : null,
    );
  }

  adminSession.loading = true;
  sessionRequest = adminRequest<AdminSessionPayload>("/auth/me")
    .then((session) => {
      adminSession.user = session.user;
      adminSession.menus = session.menus;
      adminSession.checked = true;
      return session;
    })
    .catch((error: unknown) => {
      adminSession.user = null;
      adminSession.menus = [];
      adminSession.checked =
        error instanceof AdminApiError && error.status === 401;
      if (adminSession.checked) return null;
      throw error;
    })
    .finally(() => {
      adminSession.loading = false;
      sessionRequest = undefined;
    });
  return sessionRequest;
}

export function saveAdminSession(session: AdminSessionPayload) {
  adminSession.user = session.user;
  adminSession.menus = session.menus;
  adminSession.checked = true;
}

export function clearAdminSession() {
  adminSession.user = null;
  adminSession.menus = [];
  adminSession.checked = true;
  sessionRequest = undefined;
}

export function canAccess(permission: string) {
  const permissions = adminSession.user?.permissions ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function firstMenuPath(
  nodes: AdminMenu[] = adminSession.menus,
): string | null {
  for (const node of nodes) {
    if (node.path) return node.path;
    const nested = firstMenuPath(node.children ?? []);
    if (nested) return nested;
  }
  return null;
}
