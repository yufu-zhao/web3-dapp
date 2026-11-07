import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Pool } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool?: Pool;

  getPool() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new ServiceUnavailableException("业务 API 未配置数据库连接。");
    }
    this.pool ??= new Pool({
      connectionString,
      connectionTimeoutMillis: 3000,
      max: 10,
    });
    return this.pool;
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
