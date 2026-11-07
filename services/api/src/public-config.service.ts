import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Pool } from "pg";

interface PublicInstallationConfig {
  installationStatus: "not_initialized" | "deployment_pending" | "ready";
  chainId: number | null;
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
}

@Injectable()
export class PublicConfigService implements OnModuleDestroy {
  private pool?: Pool;

  async getInstallationIdentity(): Promise<PublicInstallationConfig> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new ServiceUnavailableException("业务 API 未配置数据库连接。");
    }
    this.pool ??= new Pool({
      connectionString,
      connectionTimeoutMillis: 3000,
      max: 3,
    });

    try {
      const table = await this.pool.query<{ has_system_configs: boolean }>(
        "SELECT to_regclass('public.system_configs') IS NOT NULL AS has_system_configs",
      );
      if (!table.rows[0]?.has_system_configs) {
        return this.emptyInstallationConfig("not_initialized");
      }

      const result = await this.pool.query<{
        config_key: string;
        config_value: string;
      }>(
        "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('installed_at', 'installation_chain_id', 'system_name', 'token_name', 'token_symbol')",
      );
      const configs = new Map(
        result.rows.map((item) => [item.config_key, item.config_value]),
      );
      const initialized = configs.has("installed_at");
      const chainIdValue = configs.get("installation_chain_id");
      const chainId = chainIdValue === undefined ? null : Number(chainIdValue);
      // installed_at 代表数据库初始化，installation_chain_id 代表完整部署与核验。
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

  async onModuleDestroy() {
    await this.pool?.end();
  }

  private emptyInstallationConfig(
    installationStatus: PublicInstallationConfig["installationStatus"],
  ): PublicInstallationConfig {
    return {
      installationStatus,
      chainId: null,
      systemName: "链构",
      tokenName: "项目代币",
      tokenSymbol: "TOKEN",
    };
  }
}
