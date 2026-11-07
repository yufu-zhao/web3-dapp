import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { DatabaseService } from "./database.service.js";
import {
  ADMIN_SESSION_TTL_SECONDS,
  ADMIN_PASSWORD_MAX_LENGTH,
  type AdminMenuNode,
  type AdminPermission,
  type AdminPrincipal,
} from "./admin.types.js";

export interface AdminAuthContext {
  user: AdminPrincipal;
  menus: AdminMenuNode[];
}

export interface AdminLoginResult {
  token: string;
  context: AdminAuthContext;
}

interface AdminRow {
  id: string;
  username: string;
  password_hash: string;
  is_active: boolean;
  role_id: string;
  role_code: string;
  role_name: string;
  role_permissions: unknown;
  role_active: boolean;
}

interface AdminMenuRow {
  id: string;
  code: string;
  name: string;
  path: string;
  icon: string;
  parent_id: string | null;
  sort_order: number;
  is_visible: boolean;
  is_active: boolean;
}

const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_FAILURE_LIMIT = 5;
const DUMMY_SALT = Buffer.alloc(16, 0x6a);
const DUMMY_HASH = scryptSync("not-a-real-admin-password", DUMMY_SALT, 64);
const MENU_PERMISSION: Record<string, AdminPermission> = {
  administrators: "admins:read",
  "system-menus": "menus:read",
  roles: "roles:read",
  "system-settings": "settings:read",
};

@Injectable()
export class AdminAuthService {
  constructor(private readonly databaseService: DatabaseService) {}

  async login(
    input: unknown,
    sourceAddress: string,
  ): Promise<AdminLoginResult> {
    const credentials = this.validateCredentials(input);
    const pool = this.databaseService.getPool();
    await this.assertAdminSchemaReady();
    const attemptKey = this.loginAttemptKey(
      credentials.username,
      sourceAddress,
    );
    await this.assertNotLocked(attemptKey);

    const result = await pool.query<AdminRow>(
      `SELECT u.id::text, u.username, u.password_hash, u.is_active,
              u.role_id::text, r.code AS role_code, r.name AS role_name,
              r.permissions AS role_permissions, r.is_active AS role_active
         FROM admin_users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.username = $1
        LIMIT 1`,
      [credentials.username],
    );
    const row = result.rows[0];
    const passwordMatches = this.verifyPassword(
      credentials.password,
      row?.password_hash,
    );
    if (!row || !row.is_active || !row.role_active || !passwordMatches) {
      const locked = await this.recordFailure(attemptKey);
      if (locked) {
        throw this.tooManyRequests();
      }
      throw new UnauthorizedException("账号或密码错误。");
    }

    const principal = this.toPrincipal(row);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const active = await client.query<{
        is_active: boolean;
        role_active: boolean;
      }>(
        `SELECT u.is_active, r.is_active AS role_active
           FROM admin_users u
           JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1
          FOR UPDATE OF u, r`,
        [principal.id],
      );
      if (!active.rows[0]?.is_active || !active.rows[0]?.role_active) {
        await client.query("ROLLBACK");
        throw new UnauthorizedException("账号或密码错误。");
      }
      await client.query(
        "UPDATE admin_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1",
        [principal.id],
      );
      await client.query(
        "DELETE FROM admin_sessions WHERE expires_at <= NOW()",
      );
      await client.query(
        `INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 second'))`,
        [principal.id, tokenHash, ADMIN_SESSION_TTL_SECONDS],
      );
      await client.query(
        "DELETE FROM admin_login_attempts WHERE attempt_key = $1",
        [attemptKey],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const authenticated = await this.authenticate(token);
    if (!authenticated) {
      throw new ServiceUnavailableException("无法创建有效的管理员会话。");
    }
    return { token, context: await this.context(authenticated) };
  }

  private async assertAdminSchemaReady() {
    let ready = false;
    try {
      const result = await this.databaseService.getPool().query<{
        ready: boolean;
      }>(
        `SELECT to_regclass('public.admin_sessions') IS NOT NULL
                  AND to_regclass('public.admin_login_attempts') IS NOT NULL
           AS ready`,
      );
      ready = Boolean(result.rows[0]?.ready);
    } catch {
      throw new ServiceUnavailableException("无法检查管理后台数据库结构。");
    }
    if (!ready) {
      throw new ServiceUnavailableException(
        "管理后台数据库迁移未完成，请在本机安装器的数据库连接页应用待执行迁移。",
      );
    }
  }

  async authenticate(token: string): Promise<AdminPrincipal | null> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const result = await this.databaseService.getPool().query<AdminRow>(
      `SELECT u.id::text, u.username, u.is_active,
              u.role_id::text, r.code AS role_code, r.name AS role_name,
              r.permissions AS role_permissions, r.is_active AS role_active
         FROM admin_sessions s
         JOIN admin_users u ON u.id = s.admin_user_id
         JOIN roles r ON r.id = u.role_id
        WHERE s.token_hash = $1 AND s.expires_at > NOW()
        LIMIT 1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row || !row.is_active || !row.role_active) return null;
    return this.toPrincipal(row);
  }

  async context(principal: AdminPrincipal): Promise<AdminAuthContext> {
    return {
      user: principal,
      menus: await this.visibleMenuTree(principal.permissions),
    };
  }

  async logout(token?: string) {
    if (!token) return;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await this.databaseService
      .getPool()
      .query("DELETE FROM admin_sessions WHERE token_hash = $1", [tokenHash]);
  }

  private validateCredentials(input: unknown) {
    if (!input || typeof input !== "object") {
      throw new UnauthorizedException("账号或密码错误。");
    }
    const body = input as Record<string, unknown>;
    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (
      !/^[\p{L}\p{N}_.-]{3,64}$/u.test(username) ||
      !password ||
      password.length > ADMIN_PASSWORD_MAX_LENGTH
    ) {
      throw new UnauthorizedException("账号或密码错误。");
    }
    return { username, password };
  }

  private verifyPassword(password: string, encoded?: string) {
    let salt = DUMMY_SALT;
    let expected = DUMMY_HASH;
    let validFormat = false;
    const parts = encoded?.split(":") ?? [];
    if (
      parts.length === 3 &&
      parts[0] === "scrypt" &&
      /^[a-fA-F0-9]{32}$/.test(parts[1] ?? "") &&
      /^[a-fA-F0-9]{128}$/.test(parts[2] ?? "")
    ) {
      salt = Buffer.from(parts[1] ?? "", "hex");
      expected = Buffer.from(parts[2] ?? "", "hex");
      validFormat = true;
    }
    const actual = scryptSync(password, salt, expected.length);
    return validFormat && timingSafeEqual(actual, expected);
  }

  private loginAttemptKey(username: string, sourceAddress: string) {
    // 登录节流表只保存组合摘要，不持久化原始账号或来源地址。
    return createHash("sha256")
      .update(
        `${sourceAddress.trim() || "unknown"}\0${username.toLocaleLowerCase()}`,
      )
      .digest("hex");
  }

  private async assertNotLocked(attemptKey: string) {
    const result = await this.databaseService
      .getPool()
      .query<{ locked: boolean }>(
        `SELECT locked_until > NOW() AS locked
         FROM admin_login_attempts
        WHERE attempt_key = $1`,
        [attemptKey],
      );
    if (result.rows[0]?.locked) {
      throw this.tooManyRequests();
    }
  }

  private tooManyRequests() {
    return new HttpException(
      "连续登录失败次数过多，请 15 分钟后重试。",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async recordFailure(attemptKey: string) {
    const result = await this.databaseService
      .getPool()
      .query<{ locked: boolean }>(
        `INSERT INTO admin_login_attempts
         (attempt_key, failure_count, window_started_at, locked_until)
       VALUES ($1, 1, NOW(), NULL)
       ON CONFLICT (attempt_key) DO UPDATE
         SET failure_count = CASE
               WHEN admin_login_attempts.window_started_at <= NOW() - ($2 * INTERVAL '1 minute') THEN 1
               ELSE admin_login_attempts.failure_count + 1
             END,
             window_started_at = CASE
               WHEN admin_login_attempts.window_started_at <= NOW() - ($2 * INTERVAL '1 minute') THEN NOW()
               ELSE admin_login_attempts.window_started_at
             END,
             locked_until = CASE
               WHEN CASE
                 WHEN admin_login_attempts.window_started_at <= NOW() - ($2 * INTERVAL '1 minute') THEN 1
                 ELSE admin_login_attempts.failure_count + 1
               END >= $3
               THEN NOW() + ($2 * INTERVAL '1 minute')
               ELSE NULL
             END,
             updated_at = NOW()
       RETURNING locked_until > NOW() AS locked`,
        [attemptKey, LOGIN_WINDOW_MINUTES, LOGIN_FAILURE_LIMIT],
      );
    return Boolean(result.rows[0]?.locked);
  }

  private toPrincipal(row: AdminRow): AdminPrincipal {
    let permissions: unknown = row.role_permissions;
    if (typeof permissions === "string") {
      try {
        permissions = JSON.parse(permissions) as unknown;
      } catch {
        permissions = [];
      }
    }
    return {
      id: row.id,
      username: row.username,
      roleId: row.role_id,
      roleCode: row.role_code,
      roleName: row.role_name,
      permissions: Array.isArray(permissions)
        ? permissions.filter((item): item is string => typeof item === "string")
        : [],
    };
  }

  private async visibleMenuTree(permissions: string[]) {
    const result = await this.databaseService.getPool().query<AdminMenuRow>(
      `SELECT id::text, code, name, path, icon, parent_id::text,
              sort_order, is_visible, is_active
         FROM menus
        WHERE is_active = TRUE AND is_visible = TRUE
        ORDER BY sort_order, id`,
    );
    const canRead = (menu: AdminMenuRow) => {
      if (menu.code === "system-management") return true;
      const permission = MENU_PERMISSION[menu.code] ?? "menus:read";
      return permissions.includes("*") || permissions.includes(permission);
    };
    const nodes = new Map<string, AdminMenuNode>();
    for (const row of result.rows.filter(canRead)) {
      nodes.set(row.id, {
        id: row.id,
        code: row.code,
        name: row.name,
        path: row.path,
        icon: row.icon,
        parentId: row.parent_id,
        sortOrder: row.sort_order,
        isVisible: row.is_visible,
        isActive: row.is_active,
        children: [],
      });
    }
    const roots: AdminMenuNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else if (!node.parentId || !nodes.has(node.parentId)) roots.push(node);
    }
    const pruneEmptyGroups = (items: AdminMenuNode[]): AdminMenuNode[] =>
      items
        .map((item) => ({ ...item, children: pruneEmptyGroups(item.children) }))
        .filter((item) => item.path || item.children.length > 0);
    return pruneEmptyGroups(roots);
  }
}
