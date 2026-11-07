import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Pool } from "pg";

interface PublicInstallationConfig {
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
      const result = await this.pool.query<{
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

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
