import type { ThemePalettes } from "@chainforge/shared-types";

export interface AdminUser extends Record<string, unknown> {
  id: string;
  username: string;
  roleId: string;
  roleName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminRole extends Record<string, unknown> {
  id: string;
  code: string;
  name: string;
  description: string;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
}

export interface AdminMenu extends Record<string, unknown> {
  id: string;
  code: string;
  name: string;
  path: string;
  icon: string;
  type: "directory" | "menu" | "button";
  permissionCode: string | null;
  parentId: string | null;
  sortOrder: number;
  isVisible: boolean;
  isActive: boolean;
  createdAt?: string;
  children?: AdminMenu[];
}

export interface AdminIdentity {
  id: string;
  username: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
}

export interface AdminSessionPayload {
  user: AdminIdentity;
  menus: AdminMenu[];
}

export function getPermissionTree() {
  return adminRequest<AdminMenu[]>("/permissions");
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminPasswordPolicy {
  minimumLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export interface AdminSettings {
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
  passwordPolicy: AdminPasswordPolicy;
  installationChainId: number | null;
  themePalettes: ThemePalettes;
  rpcConfiguration: {
    chainId: number | null;
    chainName: string;
    nodes: string[];
    activeUrl: string;
    metrics: Record<
      string,
      {
        status: "success" | "failed";
        latencyMs: number | null;
        testedAt: string;
        blockNumber?: number;
        message?: string;
      }
    >;
    source: "database" | "environment" | "defaults" | "unavailable";
  };
}

export interface ManagedCarouselItem {
  id: string;
  title: string;
  desktopImageUrl: string;
  mobileImageUrl: string;
  actionType: "route" | "external" | "none";
  actionTarget: string;
  widthMode: "default" | "full";
  desktopHeight: number;
  mobileHeight: number;
  sortOrder: number;
  isVisible: boolean;
}

export interface ManagedAnnouncement {
  id: string;
  title: string;
  summary: string;
  contentType: "article" | "video";
  body: string;
  mediaUrl: string;
  mediaMode: "upload" | "external";
  isVisible: boolean;
}

export interface AnnouncementTickerSettings {
  scrollDurationMs: number;
  itemDelayMs: number;
  fontSizePx: number;
}

export interface ContentManagementSettings {
  carouselItems: ManagedCarouselItem[];
  announcements: ManagedAnnouncement[];
  tickerSettings: AnnouncementTickerSettings;
}

export interface UploadedContentAsset {
  url: string;
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

// 管理端请求统一走同源代理，并携带 HttpOnly 会话 Cookie。
export async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(init.body && !(init.body instanceof FormData)
          ? { "content-type": "application/json" }
          : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new AdminApiError("无法连接业务 API，请检查服务后重试。", 0);
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      window.dispatchEvent(new Event("admin-session-expired"));
    }
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? (payload as { message: unknown }).message
        : undefined;
    throw new AdminApiError(
      Array.isArray(message)
        ? message.join("；")
        : typeof message === "string"
          ? message
          : `业务 API 返回 HTTP ${response.status}。`,
      response.status,
    );
  }
  return payload as T;
}

export function getPage<T>(
  resource: "users" | "roles" | "menus",
  page: number,
  pageSize: number,
  search: string,
  filters: Record<string, string | boolean> = {},
) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    search,
  });
  for (const [key, value] of Object.entries(filters)) {
    if (String(value).trim()) query.set(key, String(value));
  }
  return adminRequest<PageResult<T>>(`/${resource}?${query.toString()}`);
}

export function createRecord<T>(resource: "users" | "roles", value: unknown) {
  return adminRequest<T>(`/${resource}`, {
    method: "POST",
    body: JSON.stringify(value),
  });
}

export function updateRecord<T>(
  resource: "users" | "roles" | "menus",
  id: string,
  value: unknown,
) {
  return adminRequest<T>(`/${resource}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(value),
  });
}

export function deleteRecord(resource: "users" | "roles", id: string) {
  return adminRequest<void>(`/${resource}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
