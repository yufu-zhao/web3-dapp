import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { Pool } from "pg";
import { DatabaseService } from "./database.service.js";

interface PublicInstallationConfig {
  installationStatus: "not_initialized" | "deployment_pending" | "ready";
  chainId: number | null;
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
  themePalettes: ThemePalettes;
}

interface ThemePalettes {
  user: {
    accent: string;
    background: string;
    surface: string;
    text: string;
    mutedText: string;
  };
  admin: {
    primary: string;
    background: string;
    surface: string;
    text: string;
    mutedText: string;
    border: string;
  };
}

const DEFAULT_THEME_PALETTES: ThemePalettes = {
  user: {
    accent: "#ffc832",
    background: "#111827",
    surface: "#1b2434",
    text: "#f9fafb",
    mutedText: "#cbd5e1",
  },
  admin: {
    primary: "#ffc832",
    background: "#f3f6fa",
    surface: "#ffffff",
    text: "#202d42",
    mutedText: "#738096",
    border: "#d9e0e9",
  },
};

type AdminInitializationStatus =
  | { state: "ready"; installation: PublicInstallationConfig }
  | { state: "migration-required"; installation: null }
  | { state: "uninitialized" | "incomplete"; installation: null };

@Injectable()
export class PublicConfigService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getRuntimeContracts() {
    try {
      const pool = this.databaseService.getPool();
      const exists = await pool.query<{ ready: boolean }>(
        "SELECT to_regclass('public.runtime_contract_binding') IS NOT NULL AS ready",
      );
      if (!exists.rows[0]?.ready) return { state: "unbound" as const };
      const result = await pool.query<{
        chain_id: string;
        deployment_id: string;
        release_version: string;
        contracts: Record<string, { address?: unknown }>;
        pair_address: string;
      }>(`SELECT chain_id::text, deployment_id, release_version, contracts, pair_address
           FROM runtime_contract_binding WHERE singleton = TRUE`);
      const row = result.rows[0];
      if (!row) return { state: "unbound" as const };
      const chainId = Number(row.chain_id);
      const contracts = row.contracts;
      if (
        !Number.isSafeInteger(chainId) ||
        chainId <= 0 ||
        !contracts ||
        typeof contracts !== "object"
      ) {
        throw new ServiceUnavailableException("生效合约绑定数据无效。");
      }
      const addresses: Record<string, string> = {};
      for (const [name, item] of Object.entries(contracts)) {
        const address = item?.address;
        if (typeof address !== "string" || !/^0x[0-9a-f]{40}$/i.test(address)) {
          throw new ServiceUnavailableException("生效合约绑定地址无效。");
        }
        addresses[name] = address;
      }
      if (!addresses.ProjectToken || !addresses.FairSaleV2)
        throw new ServiceUnavailableException(
          "生效合约绑定缺少代币或私募模块。",
        );
      return {
        state: "bound" as const,
        chainId,
        deploymentId: row.deployment_id,
        releaseVersion: row.release_version,
        contracts: addresses,
        pairAddress: row.pair_address,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("无法读取生效合约绑定。");
    }
  }

  getWalletConnectConfig() {
    const projectId = process.env.WALLETCONNECT_PROJECT_ID?.trim();
    return { projectId: projectId || null };
  }

  async getInstallationIdentity(): Promise<PublicInstallationConfig> {
    const pool = this.databaseService.getPool();

    try {
      const result = await pool.query<{
        config_key: string;
        config_value: string;
      }>(
        "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('installed_at', 'system_name', 'token_name', 'token_symbol', 'theme_palettes')",
      );
      const configs = new Map(
        result.rows.map((item) => [item.config_key, item.config_value]),
      );
      const initialized = configs.has("installed_at");
      const chainId = await this.readRuntimeChainId(pool);
      // installed_at 代表数据库初始化，运行时绑定代表完整部署与核验。
      const installationStatus: PublicInstallationConfig["installationStatus"] =
        !initialized
          ? "not_initialized"
          : chainId === null
            ? "deployment_pending"
            : "ready";
      const identity: PublicInstallationConfig = {
        installationStatus,
        chainId,
        systemName: configs.get("system_name")?.trim() || "链构",
        tokenName: configs.get("token_name")?.trim() || "项目代币",
        tokenSymbol: configs.get("token_symbol")?.trim() || "TOKEN",
        themePalettes: this.parseThemePalettes(configs.get("theme_palettes")),
      };
      if (
        (identity.chainId !== null &&
          (!Number.isSafeInteger(identity.chainId) || identity.chainId <= 0)) ||
        (initialized &&
          (!configs.get("system_name")?.trim() ||
            !configs.get("token_name")?.trim() ||
            !configs.get("token_symbol")?.trim()))
      ) {
        throw new ServiceUnavailableException("安装身份配置尚未完成。");
      }
      return identity;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("无法读取系统安装配置。");
    }
  }

  async getAdminInitializationStatus(): Promise<AdminInitializationStatus> {
    const pool = this.databaseService.getPool();

    try {
      const schema = await pool.query<{ exists: boolean }>(
        "SELECT to_regclass('public.system_configs') IS NOT NULL AS exists",
      );
      if (!schema.rows[0]?.exists) {
        return { state: "uninitialized", installation: null };
      }

      const result = await pool.query<{
        config_key: string;
        config_value: string;
      }>(
        "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('installed_at', 'system_name', 'token_name', 'token_symbol', 'theme_palettes')",
      );
      const configs = new Map(
        result.rows.map((item) => [item.config_key, item.config_value]),
      );
      if (!configs.has("installed_at")) {
        return { state: "uninitialized", installation: null };
      }

      const chainId = await this.readRuntimeChainId(pool);
      // 数据库初始化完成但尚未锁定目标链时，管理端仍可登录并继续部署。
      const installation: PublicInstallationConfig = {
        installationStatus: chainId === null ? "deployment_pending" : "ready",
        chainId,
        systemName: configs.get("system_name")?.trim() ?? "",
        tokenName: configs.get("token_name")?.trim() ?? "",
        tokenSymbol: configs.get("token_symbol")?.trim() ?? "",
        themePalettes: this.parseThemePalettes(configs.get("theme_palettes")),
      };
      if (
        (installation.chainId !== null &&
          (!Number.isSafeInteger(installation.chainId) ||
            installation.chainId <= 0)) ||
        !installation.systemName ||
        !installation.tokenName ||
        !installation.tokenSymbol
      ) {
        return { state: "incomplete", installation: null };
      }
      const adminSchema = await pool.query<{ ready: boolean }>(
        `SELECT to_regclass('public.admin_sessions') IS NOT NULL
                  AND to_regclass('public.admin_login_attempts') IS NOT NULL
           AS ready`,
      );
      if (!adminSchema.rows[0]?.ready) {
        return { state: "migration-required", installation: null };
      }
      return { state: "ready", installation };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("无法读取管理后台初始化状态。");
    }
  }

  private parseThemePalettes(value?: string): ThemePalettes {
    if (!value) return structuredClone(DEFAULT_THEME_PALETTES);
    try {
      const parsed = JSON.parse(value) as Partial<ThemePalettes>;
      const user = parsed.user;
      const admin = parsed.admin;
      if (!user || !admin) return structuredClone(DEFAULT_THEME_PALETTES);
      const isColor = (color: unknown): color is string =>
        typeof color === "string" && /^#[\da-f]{6}$/i.test(color);
      const userColors = [
        user.accent,
        user.background,
        user.surface,
        user.text,
        user.mutedText,
      ];
      const adminColors = [
        admin.primary,
        admin.background,
        admin.surface,
        admin.text,
        admin.mutedText,
        admin.border,
      ];
      if (![...userColors, ...adminColors].every(isColor)) {
        return structuredClone(DEFAULT_THEME_PALETTES);
      }
      return {
        user: {
          accent: user.accent,
          background: user.background,
          surface: user.surface,
          text: user.text,
          mutedText: user.mutedText,
        },
        admin: {
          primary: admin.primary,
          background: admin.background,
          surface: admin.surface,
          text: admin.text,
          mutedText: admin.mutedText,
          border: admin.border,
        },
      };
    } catch {
      return structuredClone(DEFAULT_THEME_PALETTES);
    }
  }

  private async readRuntimeChainId(pool: Pool) {
    const table = await pool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.runtime_contract_binding') IS NOT NULL AS exists",
    );
    const result = table.rows[0]?.exists
      ? await pool.query<{ chain_id: string }>(
          "SELECT chain_id::text FROM runtime_contract_binding WHERE singleton = TRUE",
        )
      : { rows: [] as Array<{ chain_id: string }> };
    let value = result.rows[0]?.chain_id;
    if (value === undefined) {
      // 兼容尚未由安装器回填到运行时绑定表的旧安装。
      const legacy = await pool.query<{ config_value: string }>(
        "SELECT config_value FROM system_configs WHERE config_key = 'installation_chain_id'",
      );
      value = legacy.rows[0]?.config_value;
    }
    if (value === undefined) return null;
    const chainId = Number(value);
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      throw new ServiceUnavailableException("生效合约绑定的 ChainId 无效。");
    }
    return chainId;
  }
}
