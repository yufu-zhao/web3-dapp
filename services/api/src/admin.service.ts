import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomBytes, scryptSync } from "node:crypto";
import type { PoolClient } from "pg";
import { ADMIN_PASSWORD_MAX_LENGTH } from "./admin.types.js";
import { DatabaseService } from "./database.service.js";

export interface PageQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  isActive?: string;
  isVisible?: string;
  parentId?: string;
  roleId?: string;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface AdminUserRecord {
  id: string;
  username: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface RoleRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  permissions: unknown;
  isActive: boolean;
  createdAt: string;
}

interface MenuRecord {
  id: string;
  code: string;
  name: string;
  path: string;
  icon: string;
  parentId: string | null;
  parentName: string | null;
  sortOrder: number;
  isVisible: boolean;
  isActive: boolean;
  createdAt: string;
}

interface AdminPasswordPolicy {
  minimumLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

interface AdminSettings {
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
  projectId: string;
  passwordPolicy: AdminPasswordPolicy;
  installationChainId: number | null;
}

const DEFAULT_PASSWORD_POLICY: AdminPasswordPolicy = {
  minimumLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
};

const ALLOWED_ROLE_PERMISSIONS = new Set([
  "admins:read",
  "admins:write",
  "menus:read",
  "menus:write",
  "roles:read",
  "roles:write",
  "settings:read",
  "settings:write",
]);

@Injectable()
export class AdminService {
  constructor(private readonly databaseService: DatabaseService) {}

  async listUsers(query: PageQuery): Promise<Page<AdminUserRecord>> {
    const page = this.parsePage(query.page, 1, 1_000_000);
    const pageSize = this.parsePage(query.pageSize, 10, 100);
    const search = this.parseSearch(query.search);
    const active = this.parseBooleanFilter(query.isActive, "isActive");
    const roleId = query.roleId?.trim()
      ? this.parseId(query.roleId, "roleId")
      : null;
    const where: string[] = [];
    const values: unknown[] = [];
    if (search) {
      values.push(`%${search}%`);
      where.push(
        `(u.username ILIKE $${values.length} OR r.name ILIKE $${values.length})`,
      );
    }
    if (active !== undefined) {
      values.push(active);
      where.push(`u.is_active = $${values.length}`);
    }
    if (roleId) {
      values.push(roleId);
      where.push(`u.role_id = $${values.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const pool = this.databaseService.getPool();
    try {
      const [items, count] = await Promise.all([
        pool.query<AdminUserRecord>(
          `SELECT u.id::text, u.username, u.role_id::text AS "roleId",
                  r.code AS "roleCode", r.name AS "roleName",
                  u.is_active AS "isActive", u.last_login_at AS "lastLoginAt",
                  u.created_at AS "createdAt"
             FROM admin_users u
             JOIN roles r ON r.id = u.role_id
             ${clause}
            ORDER BY u.id
            LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, pageSize, (page - 1) * pageSize],
        ),
        pool.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total
             FROM admin_users u
             JOIN roles r ON r.id = u.role_id
             ${clause}`,
          values,
        ),
      ]);
      return this.pageResult(items.rows, count.rows[0]?.total, page, pageSize);
    } catch {
      throw new ServiceUnavailableException("无法读取管理员列表。");
    }
  }

  async createUser(input: unknown) {
    const body = this.record(input);
    const username = this.validateUsername(body.username);
    const password = this.validatePasswordValue(body.password);
    const roleId = this.parseId(body.roleId, "roleId");
    const isActive = this.optionalBoolean(body.isActive, true, "isActive");
    const policy = await this.passwordPolicy();
    this.validatePasswordPolicy(password, policy);
    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      // 与角色停用/删除共用行锁，避免并发创建出绑定到已停用角色的管理员。
      const role = await client.query(
        "SELECT id FROM roles WHERE id = $1 AND is_active = TRUE FOR SHARE",
        [roleId],
      );
      if (!role.rowCount)
        throw new BadRequestException("所选角色不存在或已停用。");
      const result = await client.query<AdminUserRecord>(
        `INSERT INTO admin_users (username, password_hash, role_id, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING id::text, username, role_id::text AS "roleId",
                   (SELECT code FROM roles WHERE id = role_id) AS "roleCode",
                   (SELECT name FROM roles WHERE id = role_id) AS "roleName",
                   is_active AS "isActive", last_login_at AS "lastLoginAt",
                   created_at AS "createdAt"`,
        [username, this.hashPassword(password), roleId, isActive],
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw this.translateWriteError(error, "无法创建管理员。");
    } finally {
      client.release();
    }
  }

  async updateUser(idValue: string, input: unknown, actorId: string) {
    const id = this.parseId(idValue, "id");
    const body = this.record(input);
    const fields: string[] = [];
    const values: unknown[] = [];
    if (Object.hasOwn(body, "username")) {
      values.push(this.validateUsername(body.username));
      fields.push(`username = $${values.length}`);
    }
    if (Object.hasOwn(body, "roleId")) {
      const roleId = this.parseId(body.roleId, "roleId");
      values.push(roleId);
      fields.push(`role_id = $${values.length}`);
    }
    if (Object.hasOwn(body, "isActive")) {
      values.push(this.requireBoolean(body.isActive, "isActive"));
      fields.push(`is_active = $${values.length}`);
    }
    if (Object.hasOwn(body, "password")) {
      const password = this.validatePasswordValue(body.password);
      this.validatePasswordPolicy(password, await this.passwordPolicy());
      values.push(this.hashPassword(password));
      fields.push(`password_hash = $${values.length}`);
    }
    if (!fields.length)
      throw new BadRequestException("请至少提供一个可更新字段。");

    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(4102, 1)");
      const current = await client.query<{
        id: string;
        role_id: string;
        role_code: string;
        is_active: boolean;
      }>(
        `SELECT u.id::text, u.role_id::text, r.code AS role_code, u.is_active
           FROM admin_users u JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1 FOR UPDATE OF u`,
        [id],
      );
      const row = current.rows[0];
      if (!row) throw new NotFoundException("管理员不存在。");
      if (
        id === actorId &&
        ((Object.hasOwn(body, "isActive") && body.isActive === false) ||
          (Object.hasOwn(body, "roleId") &&
            String(body.roleId) !== row.role_id))
      ) {
        throw new ConflictException("不能停用自己或更改自己的角色。");
      }
      const targetActive = Object.hasOwn(body, "isActive")
        ? this.requireBoolean(body.isActive, "isActive")
        : row.is_active;
      const targetRoleId = Object.hasOwn(body, "roleId")
        ? this.parseId(body.roleId, "roleId")
        : row.role_id;
      const targetRoleCode = await this.roleCode(client, targetRoleId);
      if (
        row.role_code === "super_admin" &&
        row.is_active &&
        (!targetActive || targetRoleCode !== "super_admin")
      ) {
        await this.ensureAnotherActiveSuperAdmin(client, id);
      }

      values.push(id);
      const update = await client.query<AdminUserRecord>(
        `UPDATE admin_users SET ${fields.join(", ")}, updated_at = NOW()
          WHERE id = $${values.length}
        RETURNING id::text, username, role_id::text AS "roleId",
                  (SELECT code FROM roles WHERE id = role_id) AS "roleCode",
                  (SELECT name FROM roles WHERE id = role_id) AS "roleName",
                  is_active AS "isActive", last_login_at AS "lastLoginAt",
                  created_at AS "createdAt"`,
        values,
      );
      if (Object.hasOwn(body, "password")) {
        await client.query(
          "DELETE FROM admin_sessions WHERE admin_user_id = $1",
          [id],
        );
      }
      await client.query("COMMIT");
      return update.rows[0];
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw this.translateWriteError(error, "无法更新管理员。");
    } finally {
      client.release();
    }
  }

  async deleteUser(idValue: string, actorId: string) {
    const id = this.parseId(idValue, "id");
    if (id === actorId)
      throw new ConflictException("不能删除当前登录的管理员。");
    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(4102, 1)");
      const current = await client.query<{
        id: string;
        role_code: string;
        is_active: boolean;
      }>(
        `SELECT u.id::text, r.code AS role_code, u.is_active
           FROM admin_users u JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1 FOR UPDATE OF u`,
        [id],
      );
      const row = current.rows[0];
      if (!row) throw new NotFoundException("管理员不存在。");
      if (row.role_code === "super_admin" && row.is_active) {
        await this.ensureAnotherActiveSuperAdmin(client, id);
      }
      await client.query("DELETE FROM admin_users WHERE id = $1", [id]);
      await client.query("COMMIT");
      return { deleted: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw this.translateWriteError(error, "无法删除管理员。");
    } finally {
      client.release();
    }
  }

  async listRoles(query: PageQuery): Promise<Page<RoleRecord>> {
    const page = this.parsePage(query.page, 1, 1_000_000);
    const pageSize = this.parsePage(query.pageSize, 10, 100);
    const search = this.parseSearch(query.search);
    const active = this.parseBooleanFilter(query.isActive, "isActive");
    const where: string[] = [];
    const values: unknown[] = [];
    if (search) {
      values.push(`%${search}%`);
      where.push(
        `(code ILIKE $${values.length} OR name ILIKE $${values.length})`,
      );
    }
    if (active !== undefined) {
      values.push(active);
      where.push(`is_active = $${values.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const pool = this.databaseService.getPool();
    try {
      const [items, count] = await Promise.all([
        pool.query<RoleRecord>(
          `SELECT id::text, code, name, description, permissions,
                  is_active AS "isActive", created_at AS "createdAt"
             FROM roles ${clause}
            ORDER BY id
            LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, pageSize, (page - 1) * pageSize],
        ),
        pool.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total FROM roles ${clause}`,
          values,
        ),
      ]);
      return this.pageResult(
        items.rows.map((item) => ({
          ...item,
          permissions: this.parsePermissions(item.permissions),
        })),
        count.rows[0]?.total,
        page,
        pageSize,
      );
    } catch {
      throw new ServiceUnavailableException("无法读取角色列表。");
    }
  }

  async createRole(input: unknown) {
    const body = this.record(input);
    const value = this.validateRoleInput(body, false);
    if (value.code === "super_admin") {
      throw new ConflictException("超级管理员角色为系统保留角色。");
    }
    const result = await this.databaseService
      .getPool()
      .query<RoleRecord>(
        `INSERT INTO roles (code, name, description, permissions, is_active)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id::text, code, name, description, permissions,
                 is_active AS "isActive", created_at AS "createdAt"`,
        [
          value.code,
          value.name,
          value.description ?? "",
          JSON.stringify(value.permissions ?? []),
          value.isActive ?? true,
        ],
      )
      .catch((error: unknown) =>
        this.translateWriteError(error, "无法创建角色。"),
      );
    return {
      ...result.rows[0],
      permissions: this.parsePermissions(result.rows[0]?.permissions),
    };
  }

  async updateRole(idValue: string, input: unknown) {
    const id = this.parseId(idValue, "id");
    const body = this.record(input);
    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ code: string }>(
        "SELECT code FROM roles WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!current.rows[0]) throw new NotFoundException("角色不存在。");
      if (current.rows[0].code === "super_admin") {
        throw new ConflictException("超级管理员角色为系统保留角色。");
      }
      const value = this.validateRoleInput(body, true);
      if (value.code === "super_admin") {
        throw new ConflictException("超级管理员角色为系统保留角色。");
      }
      if (value.isActive === false) {
        const users = await client.query<{ total: string }>(
          "SELECT COUNT(*)::text AS total FROM admin_users WHERE role_id = $1 AND is_active = TRUE",
          [id],
        );
        if (Number(users.rows[0]?.total ?? 0) > 0) {
          throw new ConflictException("仍有启用中的管理员使用此角色。");
        }
      }
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [field, column] of [
        ["code", "code"],
        ["name", "name"],
        ["description", "description"],
        ["permissions", "permissions"],
        ["isActive", "is_active"],
      ] as const) {
        if (!Object.hasOwn(body, field)) continue;
        const fieldValue = value[field];
        values.push(
          field === "permissions" ? JSON.stringify(fieldValue) : fieldValue,
        );
        fields.push(
          `${column} = $${values.length}${field === "permissions" ? "::jsonb" : ""}`,
        );
      }
      if (!fields.length)
        throw new BadRequestException("请至少提供一个可更新字段。");
      values.push(id);
      const updated = await client.query<RoleRecord>(
        `UPDATE roles SET ${fields.join(", ")}, updated_at = NOW()
          WHERE id = $${values.length}
        RETURNING id::text, code, name, description, permissions,
                  is_active AS "isActive", created_at AS "createdAt"`,
        values,
      );
      await client.query("COMMIT");
      return {
        ...updated.rows[0],
        permissions: this.parsePermissions(updated.rows[0]?.permissions),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw this.translateWriteError(error, "无法更新角色。");
    } finally {
      client.release();
    }
  }

  async deleteRole(idValue: string) {
    const id = this.parseId(idValue, "id");
    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ code: string }>(
        "SELECT code FROM roles WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!current.rows[0]) throw new NotFoundException("角色不存在。");
      if (current.rows[0].code === "super_admin") {
        throw new ConflictException("超级管理员角色为系统保留角色。");
      }
      const users = await client.query<{ total: string }>(
        "SELECT COUNT(*)::text AS total FROM admin_users WHERE role_id = $1",
        [id],
      );
      if (Number(users.rows[0]?.total ?? 0) > 0) {
        throw new ConflictException("仍有管理员使用此角色，不能删除。");
      }
      await client.query("DELETE FROM roles WHERE id = $1", [id]);
      await client.query("COMMIT");
      return { deleted: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw this.translateWriteError(error, "无法删除角色。");
    } finally {
      client.release();
    }
  }

  async listMenus(query: PageQuery): Promise<Page<MenuRecord>> {
    const page = this.parsePage(query.page, 1, 1_000_000);
    const pageSize = this.parsePage(query.pageSize, 10, 100);
    const search = this.parseSearch(query.search);
    const active = this.parseBooleanFilter(query.isActive, "isActive");
    const visible = this.parseBooleanFilter(query.isVisible, "isVisible");
    const parentId = query.parentId?.trim()
      ? this.parseId(query.parentId, "parentId")
      : null;
    const where: string[] = [];
    const values: unknown[] = [];
    if (search) {
      values.push(`%${search}%`);
      where.push(
        `(m.code ILIKE $${values.length} OR m.name ILIKE $${values.length} OR m.path ILIKE $${values.length})`,
      );
    }
    if (active !== undefined) {
      values.push(active);
      where.push(`m.is_active = $${values.length}`);
    }
    if (visible !== undefined) {
      values.push(visible);
      where.push(`m.is_visible = $${values.length}`);
    }
    if (parentId) {
      values.push(parentId);
      where.push(`m.parent_id = $${values.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const pool = this.databaseService.getPool();
    try {
      const [items, count] = await Promise.all([
        pool.query<MenuRecord>(
          `SELECT m.id::text, m.code, m.name, m.path, m.icon,
                  m.parent_id::text AS "parentId", p.name AS "parentName",
                  m.sort_order AS "sortOrder", m.is_visible AS "isVisible",
                  m.is_active AS "isActive", m.created_at AS "createdAt"
             FROM menus m LEFT JOIN menus p ON p.id = m.parent_id
             ${clause}
            ORDER BY m.sort_order, m.id
            LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, pageSize, (page - 1) * pageSize],
        ),
        pool.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total FROM menus m ${clause}`,
          values,
        ),
      ]);
      return this.pageResult(items.rows, count.rows[0]?.total, page, pageSize);
    } catch {
      throw new ServiceUnavailableException("无法读取菜单列表。");
    }
  }

  async createMenu(input: unknown) {
    const body = this.record(input);
    const value = this.validateMenuInput(body, false);
    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      // 菜单树修改串行执行，防止并发调整同时构造出循环层级。
      await client.query("SELECT pg_advisory_xact_lock(4102, 2)");
      await this.assertMenuParent(value.parentId, undefined, client);
      const result = await client.query<MenuRecord>(
        `INSERT INTO menus AS target
         (code, name, path, icon, parent_id, sort_order, is_visible, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING target.id::text, target.code, target.name, target.path,
                 target.icon, target.parent_id::text AS "parentId",
                 (SELECT parent.name FROM menus parent WHERE parent.id = target.parent_id) AS "parentName",
                 target.sort_order AS "sortOrder", target.is_visible AS "isVisible",
                 target.is_active AS "isActive", target.created_at AS "createdAt"`,
        [
          value.code,
          value.name,
          value.path,
          value.icon,
          value.parentId,
          value.sortOrder,
          value.isVisible,
          value.isActive,
        ],
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw this.translateWriteError(error, "无法创建菜单。");
    } finally {
      client.release();
    }
  }

  async updateMenu(idValue: string, input: unknown) {
    const id = this.parseId(idValue, "id");
    const body = this.record(input);
    const value = this.validateMenuInput(body, true);
    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      // 与新增及删除菜单共用锁，保证环路校验使用稳定的菜单树。
      await client.query("SELECT pg_advisory_xact_lock(4102, 2)");
      const current = await client.query<{ id: string }>(
        "SELECT id::text FROM menus WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!current.rows[0]) throw new NotFoundException("菜单不存在。");
      if (Object.hasOwn(body, "parentId")) {
        await this.assertMenuParent(value.parentId, id, client);
      }
      const fields: string[] = [];
      const values: unknown[] = [];
      const fieldMap = [
        ["code", "code"],
        ["name", "name"],
        ["path", "path"],
        ["icon", "icon"],
        ["parentId", "parent_id"],
        ["sortOrder", "sort_order"],
        ["isVisible", "is_visible"],
        ["isActive", "is_active"],
      ] as const;
      for (const [field, column] of fieldMap) {
        if (!Object.hasOwn(body, field)) continue;
        values.push(value[field]);
        fields.push(`${column} = $${values.length}`);
      }
      if (!fields.length)
        throw new BadRequestException("请至少提供一个可更新字段。");
      values.push(id);
      const updated = await client.query<MenuRecord>(
        `UPDATE menus AS target SET ${fields.join(", ")}, updated_at = NOW()
          WHERE id = $${values.length}
        RETURNING target.id::text, target.code, target.name, target.path,
                  target.icon, target.parent_id::text AS "parentId",
                  (SELECT parent.name FROM menus parent WHERE parent.id = target.parent_id) AS "parentName",
                  target.sort_order AS "sortOrder", target.is_visible AS "isVisible",
                  target.is_active AS "isActive", target.created_at AS "createdAt"`,
        values,
      );
      await client.query("COMMIT");
      return updated.rows[0];
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw this.translateWriteError(error, "无法更新菜单。");
    } finally {
      client.release();
    }
  }

  async deleteMenu(idValue: string) {
    const id = this.parseId(idValue, "id");
    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      // 与其他菜单树修改串行执行，避免检查子级后又并发插入引用。
      await client.query("SELECT pg_advisory_xact_lock(4102, 2)");
      const current = await client.query(
        "SELECT id FROM menus WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!current.rowCount) throw new NotFoundException("菜单不存在。");
      const children = await client.query(
        "SELECT 1 FROM menus WHERE parent_id = $1 LIMIT 1",
        [id],
      );
      if (children.rowCount)
        throw new ConflictException("请先移除或调整子菜单。");
      await client.query("DELETE FROM menus WHERE id = $1", [id]);
      await client.query("COMMIT");
      return { deleted: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw this.translateWriteError(error, "无法删除菜单。");
    } finally {
      client.release();
    }
  }

  async getSettings() {
    return { settings: await this.readSettings() };
  }

  async updateSettings(input: unknown) {
    const body = this.record(input);
    const allowed = new Set([
      "systemName",
      "tokenName",
      "tokenSymbol",
      "projectId",
      "passwordPolicy",
    ]);
    for (const key of Object.keys(body)) {
      if (!allowed.has(key))
        throw new BadRequestException(`不支持更新配置项 ${key}。`);
    }
    const changes: Array<[string, string, string]> = [];
    if (Object.hasOwn(body, "systemName")) {
      changes.push([
        "system_name",
        this.validateText(body.systemName, "systemName", 80),
        "安装时确认的系统名称",
      ]);
    }
    if (Object.hasOwn(body, "tokenName")) {
      const value = this.validateText(body.tokenName, "tokenName", 80);
      changes.push(["token_name", value, "链上主代币全称"]);
    }
    if (Object.hasOwn(body, "tokenSymbol")) {
      const value = this.validateText(body.tokenSymbol, "tokenSymbol", 16);
      if (!/^[\p{L}\p{N}._-]{1,16}$/u.test(value)) {
        throw new BadRequestException("tokenSymbol 格式无效。");
      }
      changes.push(["token_symbol", value, "链上主代币简称"]);
    }
    if (Object.hasOwn(body, "projectId")) {
      if (
        body.projectId !== null &&
        (typeof body.projectId !== "string" ||
          body.projectId.trim().length > 200)
      ) {
        throw new BadRequestException("projectId 长度无效。");
      }
      // 前端用 null 表示清空项目 ID，写入时统一为移除配置项。
      const value =
        typeof body.projectId === "string" ? body.projectId.trim() : "";
      changes.push(["project_id", value, "WalletConnect Cloud 项目 ID"]);
    }
    if (Object.hasOwn(body, "passwordPolicy")) {
      const policy = this.validatePasswordPolicyInput(body.passwordPolicy);
      changes.push([
        "admin_password_policy",
        JSON.stringify(policy),
        "管理员密码强度策略",
      ]);
    }

    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      // 与安装器锁定目标链共用事务锁，避免并发修改已部署的代币身份。
      await client.query("SELECT pg_advisory_xact_lock(4102, 4)");
      const current = await this.readSettings(client);
      for (const [key, value, description] of changes) {
        if (key === "token_name") {
          this.assertTokenIdentityChange(
            current.tokenName,
            value,
            current.installationChainId,
          );
        }
        if (key === "token_symbol") {
          this.assertTokenIdentityChange(
            current.tokenSymbol,
            value,
            current.installationChainId,
          );
        }
        if (key === "project_id" && !value) {
          await client.query(
            "DELETE FROM system_configs WHERE config_key = $1",
            [key],
          );
          continue;
        }
        await client.query(
          `INSERT INTO system_configs (config_key, config_value, description)
           VALUES ($1, $2, $3)
           ON CONFLICT (config_key) DO UPDATE
             SET config_value = EXCLUDED.config_value,
                 description = EXCLUDED.description,
                 updated_at = NOW()`,
          [key, value, description],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw this.translateWriteError(error, "无法保存系统设置。");
    } finally {
      client.release();
    }
    return { settings: await this.readSettings() };
  }

  private assertTokenIdentityChange(
    currentValue: string,
    nextValue: string,
    installationChainId: number | null,
  ) {
    if (installationChainId !== null && currentValue !== nextValue) {
      throw new ConflictException("已锁定目标链，不能更改链上代币名称或简称。");
    }
  }

  private async readSettings(client?: PoolClient): Promise<AdminSettings> {
    const database = client ?? this.databaseService.getPool();
    const result = await database.query<{
      config_key: string;
      config_value: string;
    }>(
      `SELECT config_key, config_value FROM system_configs
        WHERE config_key = ANY($1::text[])`,
      [
        [
          "system_name",
          "token_name",
          "token_symbol",
          "project_id",
          "admin_password_policy",
          "installation_chain_id",
        ],
      ],
    );
    const values = new Map(
      result.rows.map((row) => [row.config_key, row.config_value]),
    );
    const chainValue = values.get("installation_chain_id");
    const policy = this.parsePasswordPolicy(
      values.get("admin_password_policy"),
    );
    return {
      systemName: values.get("system_name") ?? "",
      tokenName: values.get("token_name") ?? "",
      tokenSymbol: values.get("token_symbol") ?? "",
      projectId: values.get("project_id") ?? "",
      passwordPolicy: policy,
      installationChainId: chainValue ? Number(chainValue) : null,
    };
  }

  private parsePasswordPolicy(value?: string): AdminPasswordPolicy {
    if (!value) return { ...DEFAULT_PASSWORD_POLICY };
    try {
      const parsed = JSON.parse(value) as Partial<AdminPasswordPolicy>;
      return {
        minimumLength:
          Number.isInteger(parsed.minimumLength) &&
          Number(parsed.minimumLength) >= 8 &&
          Number(parsed.minimumLength) <= 128
            ? Number(parsed.minimumLength)
            : DEFAULT_PASSWORD_POLICY.minimumLength,
        requireUppercase:
          typeof parsed.requireUppercase === "boolean"
            ? parsed.requireUppercase
            : DEFAULT_PASSWORD_POLICY.requireUppercase,
        requireLowercase:
          typeof parsed.requireLowercase === "boolean"
            ? parsed.requireLowercase
            : DEFAULT_PASSWORD_POLICY.requireLowercase,
        requireNumber:
          typeof parsed.requireNumber === "boolean"
            ? parsed.requireNumber
            : DEFAULT_PASSWORD_POLICY.requireNumber,
        requireSymbol:
          typeof parsed.requireSymbol === "boolean"
            ? parsed.requireSymbol
            : DEFAULT_PASSWORD_POLICY.requireSymbol,
      };
    } catch {
      return { ...DEFAULT_PASSWORD_POLICY };
    }
  }

  private validatePasswordPolicyInput(input: unknown): AdminPasswordPolicy {
    const value = this.record(input);
    const minimumLength = value.minimumLength;
    if (
      !Number.isInteger(minimumLength) ||
      Number(minimumLength) < 8 ||
      Number(minimumLength) > 128
    ) {
      throw new BadRequestException("密码最小长度须为 8 到 128 位整数。");
    }
    return {
      minimumLength: Number(minimumLength),
      requireUppercase: this.requireBoolean(
        value.requireUppercase,
        "requireUppercase",
      ),
      requireLowercase: this.requireBoolean(
        value.requireLowercase,
        "requireLowercase",
      ),
      requireNumber: this.requireBoolean(value.requireNumber, "requireNumber"),
      requireSymbol: this.requireBoolean(value.requireSymbol, "requireSymbol"),
    };
  }

  private async passwordPolicy() {
    const result = await this.databaseService
      .getPool()
      .query<{ config_value: string }>(
        "SELECT config_value FROM system_configs WHERE config_key = 'admin_password_policy'",
      );
    return this.parsePasswordPolicy(result.rows[0]?.config_value);
  }

  private validatePasswordPolicy(
    password: string,
    policy: AdminPasswordPolicy,
  ) {
    if (password.length < policy.minimumLength) {
      throw new BadRequestException(
        `密码至少需要 ${policy.minimumLength} 个字符。`,
      );
    }
    const requirements: Array<[boolean, RegExp, string]> = [
      [policy.requireUppercase, /[A-Z]/, "大写字母"],
      [policy.requireLowercase, /[a-z]/, "小写字母"],
      [policy.requireNumber, /[0-9]/, "数字"],
      [policy.requireSymbol, /[^A-Za-z0-9]/, "特殊字符"],
    ];
    const missing = requirements
      .filter(([required, pattern]) => required && !pattern.test(password))
      .map(([, , label]) => label);
    if (missing.length) {
      throw new BadRequestException(`密码还需要包含：${missing.join("、")}。`);
    }
  }

  private async assertMenuParent(
    parentId: string | null,
    currentId?: string,
    queryable?: PoolClient,
  ) {
    if (!parentId) return;
    if (parentId === currentId)
      throw new ConflictException("菜单不能以自身为父菜单。");
    const db = queryable ?? this.databaseService.getPool();
    const exists = await db.query("SELECT 1 FROM menus WHERE id = $1", [
      parentId,
    ]);
    if (!exists.rowCount) throw new BadRequestException("父菜单不存在。");
    if (!currentId) return;
    const descendant = await db.query(
      `WITH RECURSIVE descendants AS (
         SELECT id FROM menus WHERE id = $1
         UNION
         SELECT child.id FROM menus child
           JOIN descendants parent ON child.parent_id = parent.id
       )
       SELECT 1 FROM descendants WHERE id = $2 LIMIT 1`,
      [currentId, parentId],
    );
    if (descendant.rowCount)
      throw new ConflictException("不能将菜单移到自己的子级下。");
  }

  private validateMenuInput(body: Record<string, unknown>, partial: boolean) {
    const output: {
      code?: string;
      name?: string;
      path?: string;
      icon?: string;
      parentId?: string | null;
      sortOrder?: number;
      isVisible?: boolean;
      isActive?: boolean;
    } = {};
    const fields: Array<keyof typeof output> = [
      "code",
      "name",
      "path",
      "icon",
      "parentId",
      "sortOrder",
      "isVisible",
      "isActive",
    ];
    if (!partial) {
      for (const field of ["code", "name", "path", "icon"] as const) {
        if (!Object.hasOwn(body, field))
          throw new BadRequestException(`缺少字段 ${field}。`);
      }
    }
    for (const field of fields) {
      if (!Object.hasOwn(body, field)) continue;
      switch (field) {
        case "code": {
          const value = this.validateText(body.code, "code", 96);
          if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,95}$/.test(value)) {
            throw new BadRequestException("菜单 code 格式无效。");
          }
          output.code = value;
          break;
        }
        case "name":
          output.name = this.validateText(body.name, "name", 128);
          break;
        case "path": {
          const value = this.validateText(body.path, "path", 255, true);
          if (value && (!value.startsWith("/") || value.startsWith("//"))) {
            throw new BadRequestException("菜单 path 必须是站内绝对路径。");
          }
          output.path = value;
          break;
        }
        case "icon": {
          const value = this.validateText(body.icon, "icon", 96, true);
          if (value && !/^[a-zA-Z0-9_-]+$/.test(value)) {
            throw new BadRequestException("菜单 icon 格式无效。");
          }
          output.icon = value;
          break;
        }
        case "parentId":
          output.parentId =
            body.parentId === null || body.parentId === ""
              ? null
              : this.parseId(body.parentId, "parentId");
          break;
        case "sortOrder":
          output.sortOrder = this.parseInteger(
            body.sortOrder,
            "sortOrder",
            0,
            100_000,
          );
          break;
        case "isVisible":
          output.isVisible = this.requireBoolean(body.isVisible, "isVisible");
          break;
        case "isActive":
          output.isActive = this.requireBoolean(body.isActive, "isActive");
          break;
      }
    }
    return {
      code: output.code,
      name: output.name,
      path: output.path,
      icon: output.icon,
      parentId: output.parentId ?? null,
      sortOrder: output.sortOrder ?? 0,
      isVisible: output.isVisible ?? true,
      isActive: output.isActive ?? true,
    };
  }

  private validateRoleInput(body: Record<string, unknown>, partial: boolean) {
    const output: {
      code?: string;
      name?: string;
      description?: string;
      permissions?: string[];
      isActive?: boolean;
    } = {};
    if (!partial) {
      for (const field of ["code", "name"] as const) {
        if (!Object.hasOwn(body, field))
          throw new BadRequestException(`缺少字段 ${field}。`);
      }
    }
    if (Object.hasOwn(body, "code")) {
      const code = this.validateText(body.code, "code", 64);
      if (!/^[a-z][a-z0-9_-]{2,63}$/.test(code)) {
        throw new BadRequestException(
          "角色 code 须为 3 到 64 位小写字母、数字、下划线或短横线。",
        );
      }
      output.code = code;
    }
    if (Object.hasOwn(body, "name"))
      output.name = this.validateText(body.name, "name", 128);
    if (Object.hasOwn(body, "description")) {
      output.description = this.validateText(
        body.description,
        "description",
        1000,
        true,
      );
    }
    if (Object.hasOwn(body, "permissions")) {
      if (!Array.isArray(body.permissions) || body.permissions.length > 32) {
        throw new BadRequestException("permissions 须为最多 32 项的数组。");
      }
      const permissions = [
        ...new Set(
          body.permissions.map((permission) => {
            if (typeof permission !== "string") {
              throw new BadRequestException("角色权限须为文本编码。");
            }
            return permission;
          }),
        ),
      ];
      if (
        permissions.some(
          (permission) =>
            typeof permission !== "string" ||
            permission === "*" ||
            !ALLOWED_ROLE_PERMISSIONS.has(permission),
        )
      ) {
        throw new BadRequestException("角色权限包含未知或保留权限。");
      }
      output.permissions = permissions;
    }
    if (Object.hasOwn(body, "isActive")) {
      output.isActive = this.requireBoolean(body.isActive, "isActive");
    }
    return output;
  }

  private async roleCode(client: PoolClient, roleId: string) {
    const role = await client.query<{ code: string }>(
      "SELECT code FROM roles WHERE id = $1 AND is_active = TRUE FOR SHARE",
      [roleId],
    );
    if (!role.rows[0])
      throw new BadRequestException("所选角色不存在或已停用。");
    return role.rows[0].code;
  }

  private async ensureAnotherActiveSuperAdmin(
    client: PoolClient,
    excludingId: string,
  ) {
    const result = await client.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
         FROM admin_users u JOIN roles r ON r.id = u.role_id
        WHERE r.code = 'super_admin' AND r.is_active = TRUE
          AND u.is_active = TRUE AND u.id <> $1`,
      [excludingId],
    );
    if (Number(result.rows[0]?.total ?? 0) < 1) {
      throw new ConflictException("不能停用或移除最后一个有效超级管理员。");
    }
  }

  private parsePage(raw: unknown, fallback: number, maximum: number) {
    if (raw === undefined || raw === "") return fallback;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new BadRequestException("分页参数超出有效范围。");
    }
    return value;
  }

  private parseSearch(raw?: string) {
    const search = raw?.trim() ?? "";
    if (search.length > 100)
      throw new BadRequestException("search 最长为 100 个字符。");
    return search;
  }

  private parseBooleanFilter(raw: unknown, field: string) {
    if (raw === undefined || raw === "") return undefined;
    if (raw === true || raw === "true") return true;
    if (raw === false || raw === "false") return false;
    throw new BadRequestException(`${field} 须为 true 或 false。`);
  }

  private optionalBoolean(raw: unknown, fallback: boolean, field: string) {
    return raw === undefined ? fallback : this.requireBoolean(raw, field);
  }

  private requireBoolean(raw: unknown, field: string) {
    if (typeof raw !== "boolean")
      throw new BadRequestException(`${field} 须为布尔值。`);
    return raw;
  }

  private parseId(raw: unknown, field: string) {
    const value =
      typeof raw === "number"
        ? String(raw)
        : typeof raw === "string"
          ? raw.trim()
          : "";
    if (!/^[1-9]\d{0,18}$/.test(value))
      throw new BadRequestException(`${field} 须为正整数 ID。`);
    if (BigInt(value) > 9_223_372_036_854_775_807n) {
      throw new BadRequestException(`${field} 超出数据库 ID 范围。`);
    }
    return value;
  }

  private parseInteger(
    raw: unknown,
    field: string,
    minimum: number,
    maximum: number,
  ) {
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new BadRequestException(
        `${field} 须为 ${minimum} 到 ${maximum} 之间的整数。`,
      );
    }
    return value;
  }

  private validateUsername(raw: unknown) {
    const value = this.validateText(raw, "username", 64);
    if (!/^[\p{L}\p{N}_.-]{3,64}$/u.test(value)) {
      throw new BadRequestException(
        "管理员账号须为 3 到 64 位字母、数字或 . _ -。",
      );
    }
    return value;
  }

  private validatePasswordValue(raw: unknown) {
    if (
      typeof raw !== "string" ||
      raw.length < 1 ||
      raw.length > ADMIN_PASSWORD_MAX_LENGTH
    ) {
      throw new BadRequestException("管理员密码长度无效。");
    }
    return raw;
  }

  private validateText(
    raw: unknown,
    field: string,
    maximum: number,
    allowEmpty = false,
  ) {
    if (typeof raw !== "string")
      throw new BadRequestException(`${field} 须为文本。`);
    const value = raw.trim();
    if ((!allowEmpty && !value) || value.length > maximum) {
      throw new BadRequestException(
        `${field} 不能为空且最多为 ${maximum} 个字符。`,
      );
    }
    return value;
  }

  private parsePermissions(raw: unknown) {
    let permissions = raw;
    if (typeof permissions === "string") {
      try {
        permissions = JSON.parse(permissions) as unknown;
      } catch {
        permissions = [];
      }
    }
    return Array.isArray(permissions)
      ? permissions.filter((item): item is string => typeof item === "string")
      : [];
  }

  private record(input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("请求内容须为 JSON 对象。");
    }
    return input as Record<string, unknown>;
  }

  private hashPassword(password: string) {
    // 管理员密码继续使用安装器一致的 scrypt 格式，便于首位管理员直接登录。
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
  }

  private pageResult<T>(
    items: T[],
    totalValue: string | undefined,
    page: number,
    pageSize: number,
  ): Page<T> {
    return { items, total: Number(totalValue ?? 0), page, pageSize };
  }

  private translateWriteError(error: unknown, fallback: string): never {
    if (error instanceof HttpException) throw error;
    const code = (error as { code?: string })?.code;
    if (code === "23505") throw new ConflictException("唯一编码或账号已存在。");
    if (code === "23503")
      throw new ConflictException("记录仍被其他数据引用，不能删除或更改。");
    if (code === "22P02" || code === "23514")
      throw new BadRequestException("提交的数据格式无效。");
    throw new ServiceUnavailableException(fallback);
  }
}
