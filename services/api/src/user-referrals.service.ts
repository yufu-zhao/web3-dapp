import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import { DatabaseService } from "./database.service.js";

export interface UserAccountQuery {
  page?: string;
  pageSize?: string;
  search?: string;
}

@Injectable()
export class UserReferralsService {
  constructor(private readonly database: DatabaseService) {}

  private async ready() {
    const migrationTable = await this.database
      .getPool()
      .query<{ ready: boolean }>(
        "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ready"
      );
    if (!migrationTable.rows[0]?.ready)
      throw new ServiceUnavailableException("用户注册服务等待数据库迁移。");
    const result = await this.database
      .getPool()
      .query<{ ready: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='0018_user_referrals') AS ready"
      );
    if (!result.rows[0]?.ready)
      throw new ServiceUnavailableException("用户注册服务等待数据库迁移。");
    const profileMigration = await this.database
      .getPool()
      .query<{ ready: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='0020_user_account_profile_access') AS ready"
      );
    if (!profileMigration.rows[0]?.ready)
      throw new ServiceUnavailableException("用户管理字段等待数据库迁移。");
    const sessionMigration = await this.database.getPool().query<{ ready: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='0021_user_wallet_sessions') AS ready"
    );
    if (!sessionMigration.rows[0]?.ready)
      throw new ServiceUnavailableException("钱包登录会话等待数据库迁移。");
  }

  private address(value: unknown) {
    if (typeof value !== "string")
      throw new BadRequestException("钱包地址无效。");
    try {
      return getAddress(value).toLowerCase();
    } catch {
      throw new BadRequestException("钱包地址无效。");
    }
  }

  async account(addressInput: unknown, clientIp: string) {
    await this.ready();
    const address = this.address(addressInput);
    // 用户端钱包连接后会核验账户；在此记录最近一次会话来源 IP。
    const result = await this.database.getPool().query(
      `UPDATE user_accounts SET last_login_ip = $2::inet
          WHERE wallet_address = $1
          RETURNING id::text, wallet_address, invitation_code, inviter_id::text,
                    created_at, is_active AS "isActive"`,
      [address, clientIp]
    );
    return {
      exists: Boolean(result.rowCount),
      account: result.rows[0] ?? null
    };
  }

  async challenge(addressInput: unknown) {
    await this.ready();
    const address = this.address(addressInput);
    const existing = await this.database
      .getPool()
      .query<{ is_active: boolean }>(
        "SELECT is_active FROM user_accounts WHERE wallet_address=$1",
        [address]
      );
    if (existing.rowCount)
      return {
        exists: true,
        isActive: existing.rows[0]!.is_active,
        message: null
      };
    await this.database
      .getPool()
      .query(
        "DELETE FROM user_registration_challenges WHERE wallet_address=$1 AND expires_at<=NOW()",
        [address]
      );
    const nonce = randomBytes(24).toString("hex");
    const message = `ChainForge 用户注册\n钱包：${address}\n随机数：${nonce}\n有效期：5 分钟\n仅用于验证钱包所有权，不会发起链上交易。`;
    await this.database
      .getPool()
      .query(
        "INSERT INTO user_registration_challenges(wallet_address,nonce,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')",
        [address, nonce]
      );
    return { exists: false, message };
  }

  async loginChallenge(addressInput: unknown) {
    await this.ready();
    const address = this.address(addressInput);
    const account = await this.database.getPool().query<{ id: string; is_active: boolean }>(
      "SELECT id::text,is_active FROM user_accounts WHERE wallet_address=$1",
      [address]
    );
    if (!account.rowCount || !account.rows[0]!.is_active)
      throw new BadRequestException("用户不存在或已被禁用，请先完成注册或联系管理员。");
    const nonce = randomBytes(24).toString("hex");
    const message = `ChainForge 钱包登录\\n钱包：${address}\\n随机数：${nonce}\\n有效期：5 分钟\\n仅用于登录验证，不会发起链上交易。`;
    await this.database.getPool().query(
      `INSERT INTO user_login_challenges(wallet_address,nonce,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')
       ON CONFLICT(wallet_address) DO UPDATE SET nonce=EXCLUDED.nonce,expires_at=EXCLUDED.expires_at,created_at=NOW()`,
      [address, nonce]
    );
    return { message };
  }

  async login(input: unknown) {
    await this.ready();
    const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const address = this.address(body.address);
    if (typeof body.message !== "string" || typeof body.signature !== "string")
      throw new BadRequestException("登录签名参数无效。");
    if (verifyMessage(body.message, body.signature).toLowerCase() !== address)
      throw new BadRequestException("钱包签名无效。");
    const client = await this.database.getPool().connect();
    try {
      await client.query("BEGIN");
      const challenge = await client.query<{ nonce: string }>(
        "SELECT nonce FROM user_login_challenges WHERE wallet_address=$1 AND expires_at>NOW() FOR UPDATE", [address]
      );
      const expected = challenge.rowCount ? `ChainForge 钱包登录\\n钱包：${address}\\n随机数：${challenge.rows[0]!.nonce}\\n有效期：5 分钟\\n仅用于登录验证，不会发起链上交易。` : "";
      if (!challenge.rowCount || body.message !== expected) throw new BadRequestException("登录签名已过期，请重试。");
      const account = await client.query<{ id: string }>("SELECT id::text FROM user_accounts WHERE wallet_address=$1 AND is_active=TRUE FOR UPDATE", [address]);
      if (!account.rowCount) throw new BadRequestException("用户不存在或已被禁用。");
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await client.query("INSERT INTO user_wallet_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')", [tokenHash, account.rows[0]!.id]);
      await client.query("DELETE FROM user_login_challenges WHERE wallet_address=$1", [address]);
      await client.query("COMMIT");
      return { token, expiresIn: 604800 };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async authorize(token: unknown) {
    if (typeof token !== "string" || !token) throw new BadRequestException("请先登录。");
    const hash = createHash("sha256").update(token).digest("hex");
    const result = await this.database.getPool().query(
      `SELECT account.id::text,account.wallet_address AS "walletAddress",account.name,account.avatar_url AS "avatarUrl"
         FROM user_wallet_sessions session JOIN user_accounts account ON account.id=session.user_id
        WHERE session.token_hash=$1 AND session.expires_at>NOW() AND account.is_active=TRUE`, [hash]
    );
    if (!result.rowCount) throw new BadRequestException("登录已失效或账户已禁用，请重新连接钱包。");
    return result.rows[0];
  }

  async register(input: unknown, clientIp: string) {
    await this.ready();
    const body =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const address = this.address(body.address);
    if (typeof body.message !== "string" || typeof body.signature !== "string")
      throw new BadRequestException("注册签名参数无效。");
    let signer: string;
    try {
      signer = verifyMessage(body.message, body.signature).toLowerCase();
    } catch {
      throw new BadRequestException("钱包签名无效。");
    }
    if (signer !== address)
      throw new BadRequestException("签名钱包与注册钱包不一致。");

    const client = await this.database.getPool().connect();
    try {
      await client.query("BEGIN");
      const challenge = await client.query<{ nonce: string }>(
        "SELECT nonce FROM user_registration_challenges WHERE wallet_address=$1 AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [address]
      );
      const expectedMessage = challenge.rowCount
        ? `ChainForge 用户注册\n钱包：${address}\n随机数：${challenge.rows[0]!.nonce}\n有效期：5 分钟\n仅用于验证钱包所有权，不会发起链上交易。`
        : "";
      if (!challenge.rowCount || body.message !== expectedMessage)
        throw new BadRequestException("注册签名已过期或已使用，请重新获取。");
      const found = await client.query(
        `SELECT id::text,wallet_address,invitation_code,inviter_id::text,
                created_at,is_active AS "isActive"
           FROM user_accounts WHERE wallet_address=$1`,
        [address]
      );
      if (found.rowCount) {
        await client.query(
          "DELETE FROM user_registration_challenges WHERE wallet_address=$1",
          [address]
        );
        await client.query("COMMIT");
        return { exists: true, account: found.rows[0] };
      }

      const settings = await client.query<{ config_value: string }>(
        "SELECT config_value FROM system_configs WHERE config_key='require_invitation_for_registration'"
      );
      const required =
        settings.rows[0]?.config_value.trim().toLowerCase() === "true";
      const suppliedCode =
        typeof body.invitationCode === "string"
          ? body.invitationCode.trim().toUpperCase()
          : "";
      let inviterId: string | null = null;
      if (suppliedCode) {
        const inviter = await client.query<{ id: string }>(
          "SELECT id::text FROM user_accounts WHERE invitation_code=$1 FOR UPDATE",
          [suppliedCode]
        );
        if (!inviter.rowCount) throw new BadRequestException("邀请码无效。");
        inviterId = inviter.rows[0]!.id;
      } else if (required)
        throw new BadRequestException("注册需要有效的邀请码。");

      let invitationCode = "";
      for (let tries = 0; tries < 5; tries++) {
        invitationCode = randomBytes(6).toString("hex").toUpperCase();
        const inserted = await client.query(
          `INSERT INTO user_accounts(
             wallet_address, invitation_code, inviter_id, registration_ip, last_login_ip
           ) VALUES($1,$2,$3,$4::inet,$4::inet)
           ON CONFLICT DO NOTHING
           RETURNING id::text,wallet_address,invitation_code,inviter_id::text,
                     created_at,is_active AS "isActive"`,
          [address, invitationCode, inviterId, clientIp]
        );
        if (inserted.rowCount) {
          await client.query(
            "DELETE FROM user_registration_challenges WHERE wallet_address=$1",
            [address]
          );
          await client.query("COMMIT");
          return { exists: true, account: inserted.rows[0] };
        }
        // 唯一约束冲突（邀请码碰撞或并发注册）不会中止事务；并发注册时返回已创建账户。
        const concurrent = await client.query(
          `SELECT id::text,wallet_address,invitation_code,inviter_id::text,
                  created_at,is_active AS "isActive"
             FROM user_accounts WHERE wallet_address=$1`,
          [address]
        );
        if (concurrent.rowCount) {
          await client.query(
            "DELETE FROM user_registration_challenges WHERE wallet_address=$1",
            [address]
          );
          await client.query("COMMIT");
          return { exists: true, account: concurrent.rows[0] };
        }
      }
      throw new ServiceUnavailableException("生成邀请码失败，请重试。");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async referrals(addressInput: unknown) {
    await this.ready();
    const address = this.address(addressInput);
    const owner = await this.database
      .getPool()
      .query<{ id: string; invitation_code: string }>(
        "SELECT id::text,invitation_code FROM user_accounts WHERE wallet_address=$1",
        [address]
      );
    if (!owner.rowCount) throw new BadRequestException("请先完成用户注册。");
    const [direct, count] = await Promise.all([
      this.database
        .getPool()
        .query(
          `SELECT wallet_address,created_at FROM user_accounts WHERE inviter_id=$1 ORDER BY created_at DESC LIMIT 200`,
          [owner.rows[0]!.id]
        ),
      this.database
        .getPool()
        .query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM user_accounts WHERE inviter_id=$1",
          [owner.rows[0]!.id]
        )
    ]);
    return {
      invitationCode: owner.rows[0]!.invitation_code,
      directCount: Number(count.rows[0]?.count ?? 0),
      direct: direct.rows
    };
  }

  async listAccounts(query: UserAccountQuery) {
    await this.ready();
    const page = this.parsePage(query.page, 1, 1_000_000);
    const pageSize = this.parsePage(query.pageSize, 10, 100);
    const search = query.search?.trim() ?? "";
    if (search.length > 100)
      throw new BadRequestException("search 最长为 100 个字符。");
    const pool = this.database.getPool();
    const pattern = `%${search}%`;
    const filter = `($1 = '' OR account.wallet_address ILIKE $2
      OR account.invitation_code ILIKE $2 OR inviter.wallet_address ILIKE $2
      OR account.name ILIKE $2 OR account.remark ILIKE $2
      OR account.registration_ip::text ILIKE $2 OR account.last_login_ip::text ILIKE $2)`;
    const [items, count] = await Promise.all([
      pool.query(
        `SELECT account.id::text AS id,
                account.wallet_address AS "walletAddress",
                account.name,
                account.remark,
                account.avatar_url AS "avatarUrl",
                account.invitation_code AS "invitationCode",
                inviter.wallet_address AS "inviterWalletAddress",
                (SELECT COUNT(*)::text FROM user_accounts child
                  WHERE child.inviter_id = account.id) AS "invitedCount",
                account.created_at AS "createdAt",
                account.registration_ip::text AS "registrationIp",
                account.last_login_ip::text AS "lastLoginIp",
                account.is_active AS "isActive"
           FROM user_accounts account
           LEFT JOIN user_accounts inviter ON inviter.id = account.inviter_id
          WHERE ${filter}
          ORDER BY account.created_at DESC, account.id DESC
          LIMIT $3 OFFSET $4`,
        [search, pattern, pageSize, (page - 1) * pageSize]
      ),
      pool.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total
           FROM user_accounts account
           LEFT JOIN user_accounts inviter ON inviter.id = account.inviter_id
          WHERE ${filter}`,
        [search, pattern]
      )
    ]);
    return {
      items: items.rows,
      total: Number(count.rows[0]?.total ?? 0),
      page,
      pageSize
    };
  }

  async updateAccount(idInput: string, input: unknown) {
    await this.ready();
    const id = this.parsePage(idInput, 1, Number.MAX_SAFE_INTEGER);
    const body =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const updates: string[] = [];
    const values: unknown[] = [];
    const textFields = [
      ["name", 128, true],
      ["remark", 2000, true],
      ["avatarUrl", 2048, true]
    ] as const;
    for (const [field, maximum, allowEmpty] of textFields) {
      if (!Object.hasOwn(body, field)) continue;
      if (typeof body[field] !== "string")
        throw new BadRequestException(`${field} 须为文本。`);
      const value = body[field].trim();
      if ((!allowEmpty && !value) || value.length > maximum)
        throw new BadRequestException(`${field} 内容无效或超过长度限制。`);
      if (field === "avatarUrl" && value && !/^https?:\/\//i.test(value))
        throw new BadRequestException(
          "avatarUrl 须为 HTTP 或 HTTPS 图片地址。"
        );
      const column = field === "avatarUrl" ? "avatar_url" : field;
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    }
    if (Object.hasOwn(body, "isActive")) {
      if (typeof body.isActive !== "boolean")
        throw new BadRequestException("isActive 须为布尔值。");
      values.push(body.isActive);
      updates.push(`is_active = $${values.length}`);
    }
    if (!updates.length) throw new BadRequestException("没有可保存的字段。");
    values.push(id);
    const result = await this.database.getPool().query(
      `UPDATE user_accounts SET ${updates.join(", ")}
          WHERE id = $${values.length}
          RETURNING id::text AS id, wallet_address AS "walletAddress", name,
                    remark, avatar_url AS "avatarUrl", is_active AS "isActive"`,
      values
    );
    if (!result.rowCount) throw new BadRequestException("用户账号不存在。");
    return result.rows[0];
  }

  private parsePage(
    raw: string | undefined,
    fallback: number,
    maximum: number
  ) {
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
      throw new BadRequestException("分页参数超出有效范围。");
    return value;
  }
}
