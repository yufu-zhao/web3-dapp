import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";

interface PublicInstallationConfig {
  chainId: number | null;
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
}

type AdminInitializationStatus =
  | { state: "ready"; installation: PublicInstallationConfig }
  | { state: "migration-required"; installation: null }
  | { state: "uninitialized" | "incomplete"; installation: null };

@Injectable()
export class PublicConfigService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getInstallationIdentity(): Promise<PublicInstallationConfig> {
    const pool = this.databaseService.getPool();

    try {
      const result = await pool.query<{
        config_key: string;
        config_value: string;
      }>(
        "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('installation_chain_id', 'system_name', 'token_name', 'token_symbol')",
      );
      const configs = new Map(
        result.rows.map((item) => [item.config_key, item.config_value]),
      );
      const identity: PublicInstallationConfig = {
        chainId: configs.has("installation_chain_id")
          ? Number(configs.get("installation_chain_id"))
          : null,
        systemName: configs.get("system_name")?.trim() ?? "",
        tokenName: configs.get("token_name")?.trim() ?? "",
        tokenSymbol: configs.get("token_symbol")?.trim() ?? "",
      };
      if (
        (identity.chainId !== null &&
          (!Number.isSafeInteger(identity.chainId) || identity.chainId <= 0)) ||
        !identity.systemName ||
        !identity.tokenName ||
        !identity.tokenSymbol
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
        "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('installed_at', 'installation_chain_id', 'system_name', 'token_name', 'token_symbol')",
      );
      const configs = new Map(
        result.rows.map((item) => [item.config_key, item.config_value]),
      );
      if (!configs.has("installed_at")) {
        return { state: "uninitialized", installation: null };
      }

      const chainIdValue = configs.get("installation_chain_id");
      const installation: PublicInstallationConfig = {
        chainId: chainIdValue === undefined ? null : Number(chainIdValue),
        systemName: configs.get("system_name")?.trim() ?? "",
        tokenName: configs.get("token_name")?.trim() ?? "",
        tokenSymbol: configs.get("token_symbol")?.trim() ?? "",
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
}
