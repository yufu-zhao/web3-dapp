import type { FastifyRequest } from "fastify";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const ADMIN_PASSWORD_MAX_LENGTH = 1024;

export type AdminPermission =
  | "admins:read"
  | "admins:create"
  | "admins:update"
  | "admins:delete"
  | "menus:read"
  | "menus:update"
  | "roles:read"
  | "roles:create"
  | "roles:update"
  | "roles:delete"
  | "settings:read"
  | "settings:update"
  | "presale:read"
  | "presale:terms"
  | "presale:schedule"
  | "presale:finalize";

export type AdminMenuType = "directory" | "menu" | "button";

export interface AdminPrincipal {
  id: string;
  username: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
}

export interface AdminMenuNode {
  id: string;
  code: string;
  name: string;
  path: string;
  icon: string;
  type: AdminMenuType;
  permissionCode: string | null;
  parentId: string | null;
  sortOrder: number;
  isVisible: boolean;
  isActive: boolean;
  children: AdminMenuNode[];
}

export interface AdminRequest extends FastifyRequest {
  adminPrincipal?: AdminPrincipal;
}
