import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomBytes, scryptSync } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient, type PoolConfig } from "pg";

export interface DatabaseSettings {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

export interface AdminPasswordPolicy {
  minimumLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export interface DatabaseCheck {
  connected: boolean;
  database: string;
  serverVersion: string;
  exists: boolean;
  empty: boolean;
  tableCount: number;
  tables: string[];
  canCreateDatabase: boolean;
}

interface InitializeInput {
  database: DatabaseSettings;
  administrator: { username: string; password: string };
  projectId?: string;
  passwordPolicy?: AdminPasswordPolicy;
  allowExistingNonEmpty?: boolean;
}

export interface DeploymentRecord {
  contractName: string;
  address: string;
  transactionHash: string;
  chainId: number;
  deployer: string;
  createdAt: string;
}

interface ContractPackagePlan {
  releaseVersion: string;
  nodes: Array<Record<string, unknown>>;
  postDeploymentActions: Array<Record<string, unknown>>;
  verificationRules: Array<Record<string, unknown>>;
}

@Injectable()
export class InstallerService {
  private runtimePool?: Pool;
  private databaseSettingsSaved = false;
  private databaseSummary?: {
    host: string;
    port: number;
    database: string;
    username: string;
  };
  private contractBuildInProgress = false;

  environment() {
    const nodeVersion = process.versions.node;
    const major = Number(nodeVersion.split(".")[0]);
    const minor = Number(nodeVersion.split(".")[1]);
    const supported = major === 22 && minor >= 22;

    return {
      status: "ok",
      service: "installer",
      nodeVersion,
      nodeSupported: supported,
      platform: process.platform,
      architecture: process.arch,
      availableMemoryBytes: process.availableMemory?.() ?? null,
      requiredNode: ">=22.22.0 <23",
    };
  }

  async checkDatabase(settings: DatabaseSettings) {
    try {
      this.validateDatabaseSettings(settings);
      return await this.inspectDatabase(settings);
    } catch (error) {
      throw new ServiceUnavailableException(this.describeError(error));
    }
  }

  async initialize(input: InitializeInput) {
    this.validateInitializeInput(input);
    const databaseState = await this.inspectDatabase(input.database);
    if (!databaseState.exists) await this.createDatabase(input.database);
    if (
      databaseState.exists &&
      !databaseState.empty &&
      !input.allowExistingNonEmpty
    ) {
      throw new ConflictException(
        "目标数据库已有数据，请先检查表清单并确认后再初始化。",
      );
    }

    const pool = new Pool(this.createPoolConfig(input.database));
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (error) {
      await pool.end();
      throw new ServiceUnavailableException(this.describeError(error));
    }

    try {
      const adminTable = await client.query<{ exists: boolean }>(
        "SELECT to_regclass('public.admin_users') IS NOT NULL AS exists",
      );
      if (adminTable.rows[0]?.exists) {
        const admins = await client.query<{ total: string }>(
          "SELECT COUNT(*)::text AS total FROM admin_users",
        );
        if (Number(admins.rows[0]?.total ?? 0) > 0) {
          throw new ConflictException(
            "数据库中已存在管理员；为避免覆盖，请使用现有安装或选择新数据库。",
          );
        }
      }

      await client.query("BEGIN");
      const migrationPath = await this.findMigrationPath();
      await client.query(await readFile(migrationPath, "utf8"));

      const current = await client.query<{ total: string }>(
        "SELECT COUNT(*)::text AS total FROM admin_users",
      );
      if (Number(current.rows[0]?.total ?? 0) > 0) {
        throw new ConflictException(
          "数据库中已存在管理员，不能重复创建首位管理员。",
        );
      }

      const storedPasswordPolicy = await client.query<{
        config_value: string;
      }>(
        "SELECT config_value FROM system_configs WHERE config_key = 'admin_password_policy'",
      );
      const passwordPolicy = storedPasswordPolicy.rows[0]?.config_value
        ? this.parsePasswordPolicy(storedPasswordPolicy.rows[0].config_value)
        : this.normalizePasswordPolicy(input.passwordPolicy);
      this.validateAdminPassword(input.administrator.password, passwordPolicy);

      await client.query(
        `INSERT INTO menus (code, name, path, icon, sort_order)
         VALUES
           ('overview', '概览', '/', 'dashboard', 10),
           ('administrators', '管理员', '/administrators', 'admin_panel_settings', 20),
           ('system-settings', '系统设置', '/settings', 'settings', 30)
         ON CONFLICT (code) DO NOTHING`,
      );
      await client.query(
        `INSERT INTO roles (code, name, description, permissions)
         VALUES ('super_admin', '超级管理员', '安装时创建的首位管理员角色', '["*"]'::jsonb)
         ON CONFLICT (code) DO NOTHING`,
      );
      const roleResult = await client.query<{ id: string; is_active: boolean }>(
        "SELECT id::text, is_active FROM roles WHERE code = 'super_admin'",
      );
      if (!roleResult.rows[0]?.is_active) {
        throw new ConflictException(
          "已有超级管理员角色处于停用状态；为避免更改既有数据，请先由数据库管理员处理。",
        );
      }
      const passwordHash = this.hashPassword(input.administrator.password);
      await client.query(
        `INSERT INTO admin_users (username, password_hash, role_id)
         VALUES ($1, $2, $3)`,
        [
          input.administrator.username.trim(),
          passwordHash,
          roleResult.rows[0]?.id,
        ],
      );

      if (input.projectId?.trim()) {
        await client.query(
          `INSERT INTO system_configs (config_key, config_value, description)
           VALUES ('project_id', $1, 'WalletConnect Cloud 项目 ID')
           ON CONFLICT (config_key) DO NOTHING`,
          [input.projectId.trim()],
        );
      }
      await client.query(
        `INSERT INTO system_configs (config_key, config_value, description)
         VALUES ('admin_password_policy', $1, '管理员密码强度策略')
         ON CONFLICT (config_key) DO NOTHING`,
        [JSON.stringify(passwordPolicy)],
      );
      await client.query(
        `INSERT INTO system_configs (config_key, config_value, description)
         VALUES ('installed_at', NOW()::text, '安装器完成初始化的时间')
         ON CONFLICT (config_key) DO NOTHING`,
      );
      await client.query("COMMIT");

      this.replaceRuntimePool(pool);
      this.databaseSummary = {
        host: input.database.host.trim(),
        port: input.database.port,
        database: input.database.database.trim(),
        username: input.database.username.trim(),
      };
      const settingsSaved = await this.persistDatabaseUrl(input.database).catch(
        () => false,
      );
      this.databaseSettingsSaved = settingsSaved;
      return {
        initialized: true,
        database: input.database.database,
        administrator: input.administrator.username.trim(),
        projectIdConfigured: Boolean(input.projectId?.trim()),
        settingsSaved,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(this.describeError(error));
    } finally {
      client.release();
      if (this.runtimePool !== pool) await pool.end();
    }
  }

  async publicConfig() {
    const pool = await this.getPool();
    if (!pool) return { projectId: null, installed: false };

    try {
      const result = await pool.query<{
        config_key: string;
        config_value: string;
      }>(
        "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('project_id', 'admin_password_policy')",
      );
      const installed = await pool.query(
        "SELECT 1 FROM system_configs WHERE config_key = 'installed_at'",
      );
      const configs = new Map(
        result.rows.map((item) => [item.config_key, item.config_value]),
      );
      return {
        projectId: configs.get("project_id") ?? null,
        passwordPolicy: this.parsePasswordPolicy(
          configs.get("admin_password_policy"),
        ),
        installed: installed.rowCount === 1,
      };
    } catch {
      return { projectId: null, installed: false };
    }
  }

  async installationSummary() {
    const pool = await this.getPool();
    if (!pool) return { installed: false };

    try {
      const [database, administrator, records, configs] = await Promise.all([
        pool.query<{ database_name: string }>(
          "SELECT current_database() AS database_name",
        ),
        pool.query<{ username: string }>(
          "SELECT username FROM admin_users ORDER BY id LIMIT 1",
        ),
        pool.query<{ config_value: string }>(
          "SELECT config_value FROM system_configs WHERE config_key = 'deployment_records'",
        ),
        pool.query<{ config_key: string; config_value: string }>(
          "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('project_id', 'admin_password_policy', 'installed_at')",
        ),
      ]);
      const configValues = new Map(
        configs.rows.map((item) => [item.config_key, item.config_value]),
      );
      return {
        installed: true,
        database: database.rows[0]?.database_name ?? "",
        databaseConnection: this.databaseSummary,
        administrator: administrator.rows[0]?.username ?? "",
        deployments: this.parseDeploymentRecords(records.rows[0]?.config_value),
        projectId: configValues.get("project_id") ?? null,
        passwordPolicy: this.parsePasswordPolicy(
          configValues.get("admin_password_policy"),
        ),
        installedAt: configValues.get("installed_at") ?? null,
        settingsSaved:
          this.databaseSettingsSaved || (await this.hasSavedDatabaseUrl()),
      };
    } catch {
      return { installed: false };
    }
  }

  async appendDeploymentRecord(record: DeploymentRecord) {
    if (
      !record.contractName.trim() ||
      !/^0x[a-fA-F0-9]{40}$/.test(record.address) ||
      !/^0x[a-fA-F0-9]{64}$/.test(record.transactionHash) ||
      !/^0x[a-fA-F0-9]{40}$/.test(record.deployer) ||
      !Number.isSafeInteger(record.chainId) ||
      record.chainId <= 0
    ) {
      throw new ServiceUnavailableException("合约部署记录字段无效。");
    }

    const pool = await this.getPool();
    if (!pool) throw new ServiceUnavailableException("请先初始化数据库。");

    const current = await pool.query<{ config_value: string }>(
      "SELECT config_value FROM system_configs WHERE config_key = 'deployment_records'",
    );
    const records = this.parseDeploymentRecords(current.rows[0]?.config_value);
    records.push({ ...record, createdAt: new Date().toISOString() });
    await pool.query(
      `INSERT INTO system_configs (config_key, config_value, description)
       VALUES ('deployment_records', $1, '安装器记录的合约部署结果')
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = EXCLUDED.config_value, updated_at = NOW()`,
      [JSON.stringify(records)],
    );
    return { saved: true, records };
  }

  async getContractPackage(chainId: number) {
    const root = await this.findWorkspaceRoot();
    const packageRoot = join(root, "contracts", "code");
    const planPath = join(packageRoot, "config", "deployment-plan.json");
    try {
      await access(planPath);
    } catch {
      return { exists: false, chainId };
    }

    const plan = JSON.parse(
      await readFile(planPath, "utf8"),
    ) as ContractPackagePlan;
    const networkPath = join(
      packageRoot,
      "config",
      "networks",
      `${this.validateChainId(chainId)}.json`,
    );
    const networkConfig =
      await this.readJsonFile<Record<string, unknown>>(networkPath);
    const artifacts = await this.loadContractArtifacts(packageRoot, plan.nodes);
    const externalAbis: Record<string, unknown> = {};
    for (const name of [
      "PancakeV2Factory",
      "PancakeV2Router",
      "PancakeV2Pair",
      "PaymentToken",
    ]) {
      externalAbis[name] = await this.readJsonFile(
        join(packageRoot, "external-abi", `${name}.json`),
      );
    }

    return {
      exists: true,
      chainId,
      releaseVersion: plan.releaseVersion,
      plan,
      networkConfig,
      artifacts,
      artifactsReady: plan.nodes
        .filter((node) => node.kind === "transaction")
        .every((node) => Boolean(artifacts[String(node.contractName)])),
      mockArtifact: await this.findArtifact(packageRoot, "MockUSDT"),
      externalAbis,
      outputRoot: `contracts/deploy/${chainId}`,
    };
  }

  async compileContracts() {
    const root = await this.findWorkspaceRoot();
    const packageRoot = join(root, "contracts", "code");
    if (this.contractBuildInProgress) {
      throw new ConflictException("合约正在编译，请稍后查看编译结果。");
    }

    this.contractBuildInProgress = true;
    try {
      let output = "";
      try {
        await access(join(packageRoot, "node_modules", ".bin", "hardhat"));
      } catch {
        // 用户点击“编译合约包”后，按锁文件安装当前合约包依赖。
        output += await this.runPackageCommand(packageRoot, ["ci"], 8);
      }
      output += await this.runPackageCommand(packageRoot, ["run", "build"], 6);
      return { compiled: true, output: output.slice(-16000) };
    } catch (error) {
      throw new ServiceUnavailableException(this.describeError(error));
    } finally {
      this.contractBuildInProgress = false;
    }
  }

  async getSavedDeployments(chainId: number) {
    const directory = await this.chainDeployDirectory(chainId);
    const runsDirectory = join(directory, "runs");
    const entries = await readdir(runsDirectory, { withFileTypes: true }).catch(
      () => [],
    );
    const deployments = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const deployment = await this.readJsonFile<Record<string, unknown>>(
            join(runsDirectory, entry.name, "deployment.json"),
          );
          return deployment?.status === "complete" ? deployment : undefined;
        }),
    );
    return {
      deployments: deployments
        .filter((item) => Boolean(item))
        .sort((left, right) =>
          String(right?.completedAt ?? "").localeCompare(
            String(left?.completedAt ?? ""),
          ),
        ),
    };
  }

  async getSavedDeployment(chainId: number, deploymentId: string) {
    const safeId = this.validateDeploymentId(deploymentId);
    const file = join(
      await this.chainDeployDirectory(chainId),
      "runs",
      safeId,
      "deployment.json",
    );
    const deployment = await this.readJsonFile<Record<string, unknown>>(file);
    if (deployment?.status !== "complete") {
      throw new ServiceUnavailableException("找不到已完成的同链部署资料。");
    }
    return deployment;
  }

  async getPendingDeployment(chainId: number) {
    return (
      (await this.readJsonFile<Record<string, unknown>>(
        join(
          await this.chainDeployDirectory(chainId),
          ".pending-deployment.json",
        ),
      )) ?? null
    );
  }

  async savePendingDeployment(
    chainId: number,
    pending: Record<string, unknown>,
  ) {
    await this.writeJsonFile(
      join(
        await this.chainDeployDirectory(chainId),
        ".pending-deployment.json",
      ),
      { ...pending, chainId, updatedAt: new Date().toISOString() },
    );
    return { saved: true };
  }

  async clearPendingDeployment(chainId: number) {
    await rm(
      join(
        await this.chainDeployDirectory(chainId),
        ".pending-deployment.json",
      ),
      { force: true },
    );
    return { cleared: true };
  }

  async saveCompletedDeployment(
    chainId: number,
    deployment: Record<string, unknown>,
  ) {
    const safeChainId = this.validateChainId(chainId);
    if (
      Number(deployment.chainId) !== safeChainId ||
      deployment.status !== "complete"
    ) {
      throw new ServiceUnavailableException("部署完成资料的链 ID 或状态无效。");
    }
    const deploymentId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const directory = join(
      await this.chainDeployDirectory(safeChainId),
      "runs",
      deploymentId,
    );
    const outputPath = `contracts/deploy/${safeChainId}/runs/${deploymentId}/deployment.json`;
    const saved = {
      ...deployment,
      deploymentId,
      outputPath,
      completedAt: new Date().toISOString(),
    };
    await this.writeJsonFile(join(directory, "deployment.json"), saved);
    await this.clearPendingDeployment(safeChainId).catch(() => undefined);
    return { deploymentId, outputPath, deployment: saved };
  }

  async getSavedTokens(chainId: number) {
    const file = join(await this.chainDeployDirectory(chainId), "tokens.json");
    return (
      (await this.readJsonFile<{ tokens: Array<Record<string, unknown>> }>(
        file,
      )) ?? { chainId, tokens: [] }
    );
  }

  async addSavedToken(chainId: number, token: Record<string, unknown>) {
    const safeChainId = this.validateChainId(chainId);
    if (
      Number(token.chainId) !== safeChainId ||
      !/^0x[a-fA-F0-9]{40}$/.test(String(token.address ?? "")) ||
      !/^0x[a-fA-F0-9]{64}$/.test(String(token.transactionHash ?? "")) ||
      !/^0x[a-fA-F0-9]{40}$/.test(String(token.deployer ?? ""))
    ) {
      throw new ServiceUnavailableException("支付 Token 记录字段无效。");
    }
    const current = await this.getSavedTokens(safeChainId);
    const tokens = current.tokens.filter(
      (item) =>
        String(item.address).toLowerCase() !==
        String(token.address).toLowerCase(),
    );
    tokens.unshift({ ...token, createdAt: new Date().toISOString() });
    const result = { chainId: safeChainId, tokens };
    await this.writeJsonFile(
      join(await this.chainDeployDirectory(safeChainId), "tokens.json"),
      result,
    );
    return result;
  }

  private validateChainId(chainId: number) {
    if (!Number.isSafeInteger(chainId) || chainId <= 0 || chainId > 999999999) {
      throw new ServiceUnavailableException("Chain ID 无效。");
    }
    return chainId;
  }

  private validateDeploymentId(deploymentId: string) {
    if (!/^[0-9]+-[a-f0-9]{8}$/.test(deploymentId)) {
      throw new ServiceUnavailableException("部署记录 ID 无效。");
    }
    return deploymentId;
  }

  private async chainDeployDirectory(chainId: number) {
    const root = await this.findWorkspaceRoot();
    return join(
      root,
      "contracts",
      "deploy",
      String(this.validateChainId(chainId)),
    );
  }

  private async readJsonFile<T>(file: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async writeJsonFile(file: string, value: unknown) {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporary, file);
  }

  private async loadContractArtifacts(
    packageRoot: string,
    nodes: Array<Record<string, unknown>>,
  ) {
    const artifacts: Record<string, Record<string, unknown>> = {};
    for (const node of nodes) {
      if (node.kind !== "transaction") continue;
      const name = String(node.contractName ?? "");
      if (!name) continue;
      const artifact = await this.findArtifact(packageRoot, name);
      if (artifact) artifacts[name] = artifact;
    }
    return artifacts;
  }

  private async runPackageCommand(
    packageRoot: string,
    args: string[],
    timeoutMinutes: number,
  ) {
    return new Promise<string>((resolveCommand, rejectCommand) => {
      const child = spawn("npm", args, {
        cwd: packageRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let combined = "";
      const append = (chunk: Buffer) => {
        combined = `${combined}${chunk.toString("utf8")}`.slice(-16000);
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      const timer = setTimeout(
        () => child.kill("SIGTERM"),
        timeoutMinutes * 60 * 1000,
      );
      child.on("error", (error) => {
        clearTimeout(timer);
        rejectCommand(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolveCommand(combined);
        else {
          rejectCommand(
            new Error(
              `命令 npm ${args.join(" ")} 失败（退出码 ${code ?? "unknown"}）。\n${combined}`,
            ),
          );
        }
      });
    });
  }

  private async findArtifact(packageRoot: string, contractName: string) {
    // Hardhat 3 把合约产物放在 artifacts/sources 下；递归查找以兼容源码子目录。
    const root = join(packageRoot, "artifacts", "sources");
    const visit = async (
      directory: string,
    ): Promise<Record<string, unknown> | undefined> => {
      const entries = await readdir(directory, { withFileTypes: true }).catch(
        () => [],
      );
      for (const entry of entries) {
        const candidate = join(directory, entry.name);
        if (entry.isDirectory()) {
          const match = await visit(candidate);
          if (match) return match;
        } else if (entry.name === `${contractName}.json`) {
          const parsed =
            await this.readJsonFile<Record<string, unknown>>(candidate);
          const bytecode = parsed?.bytecode;
          const hasBytecode =
            (typeof bytecode === "string" && bytecode.length > 2) ||
            (typeof bytecode === "object" &&
              bytecode !== null &&
              "object" in bytecode &&
              typeof bytecode.object === "string" &&
              bytecode.object.length > 2);
          if (parsed && Array.isArray(parsed.abi) && hasBytecode) return parsed;
        }
      }
      return undefined;
    };
    return visit(root);
  }

  private createPoolConfig(
    settings: DatabaseSettings,
    database = settings.database.trim(),
  ): PoolConfig {
    return {
      host: settings.host.trim(),
      port: settings.port,
      database,
      user: settings.username.trim(),
      password: settings.password,
      ssl: settings.ssl ? { rejectUnauthorized: true } : undefined,
      connectionTimeoutMillis: 8000,
      max: 3,
    };
  }

  private async inspectDatabase(
    settings: DatabaseSettings,
  ): Promise<DatabaseCheck> {
    const maintenancePool = new Pool(
      this.createPoolConfig(settings, "postgres"),
    );
    let serverVersion = "PostgreSQL";
    let canCreateDatabase = false;
    let exists = false;
    try {
      const server = await maintenancePool.query<{
        server_version: string;
        rolcreatedb: boolean;
        rolsuper: boolean;
      }>(
        `SELECT version() AS server_version,
                role.rolcreatedb,
                role.rolsuper
           FROM pg_roles AS role
          WHERE role.rolname = current_user`,
      );
      serverVersion = server.rows[0]?.server_version ?? serverVersion;
      canCreateDatabase = Boolean(
        server.rows[0]?.rolcreatedb || server.rows[0]?.rolsuper,
      );
      const database = await maintenancePool.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [settings.database.trim()],
      );
      exists = database.rowCount === 1;
    } finally {
      await maintenancePool.end();
    }

    if (!exists) {
      return {
        connected: true,
        database: settings.database.trim(),
        serverVersion,
        exists: false,
        empty: true,
        tableCount: 0,
        tables: [],
        canCreateDatabase,
      };
    }

    const targetPool = new Pool(this.createPoolConfig(settings));
    try {
      const tableResult = await targetPool.query<{ table_name: string }>(
        `SELECT schemaname || '.' || tablename AS table_name
           FROM pg_tables
          WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
          ORDER BY schemaname, tablename`,
      );
      const tables = tableResult.rows.map((row) => row.table_name);
      return {
        connected: true,
        database: settings.database.trim(),
        serverVersion,
        exists: true,
        empty: tables.length === 0,
        tableCount: tables.length,
        tables,
        canCreateDatabase,
      };
    } finally {
      await targetPool.end();
    }
  }

  private async createDatabase(settings: DatabaseSettings) {
    const pool = new Pool(this.createPoolConfig(settings, "postgres"));
    try {
      const permission = await pool.query<{ can_create: boolean }>(
        `SELECT rolcreatedb OR rolsuper AS can_create
           FROM pg_roles
          WHERE rolname = current_user`,
      );
      if (!permission.rows[0]?.can_create) {
        throw new ServiceUnavailableException(
          "目标数据库不存在；当前 PostgreSQL 用户没有 CREATEDB 权限。",
        );
      }

      // PostgreSQL 不允许参数化数据库标识符；双引号转义后再执行 CREATE DATABASE。
      const identifier = `"${settings.database.trim().replaceAll('"', '""')}"`;
      try {
        await pool.query(`CREATE DATABASE ${identifier}`);
      } catch (error) {
        if ((error as { code?: string })?.code !== "42P04") throw error;
      }
    } finally {
      await pool.end();
    }
  }

  private validateInitializeInput(input: InitializeInput) {
    const { database, administrator } = input;
    this.validateDatabaseSettings(database);
    if (
      input.passwordPolicy?.minimumLength !== undefined &&
      (!Number.isInteger(input.passwordPolicy.minimumLength) ||
        input.passwordPolicy.minimumLength < 8 ||
        input.passwordPolicy.minimumLength > 128)
    ) {
      throw new ServiceUnavailableException(
        "管理员密码最小长度须为 8 到 128 位整数。",
      );
    }
    if (!/^[\p{L}\p{N}_.-]{3,64}$/u.test(administrator.username.trim())) {
      throw new ServiceUnavailableException(
        "管理员账号须为 3 到 64 位字母、数字或 . _ -。",
      );
    }
    if (!administrator.password) {
      throw new ServiceUnavailableException("请填写首位管理员密码。");
    }
    if ((input.projectId?.length ?? 0) > 200) {
      throw new ServiceUnavailableException("WalletConnect 项目 ID 长度无效。");
    }
  }

  private validateDatabaseSettings(database: DatabaseSettings) {
    if (
      !database.host.trim() ||
      !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(database.database.trim()) ||
      !database.username.trim() ||
      !Number.isInteger(database.port) ||
      database.port < 1 ||
      database.port > 65535
    ) {
      throw new ServiceUnavailableException(
        "请填写有效的 PostgreSQL 连接信息；数据库名须为 1 到 63 位字母、数字、下划线或短横线。",
      );
    }
  }

  private normalizePasswordPolicy(
    input?: AdminPasswordPolicy,
  ): AdminPasswordPolicy {
    const configuredLength = input?.minimumLength;
    return {
      minimumLength:
        typeof configuredLength === "number" &&
        Number.isInteger(configuredLength) &&
        configuredLength >= 8 &&
        configuredLength <= 128
          ? configuredLength
          : 12,
      requireUppercase: input?.requireUppercase ?? true,
      requireLowercase: input?.requireLowercase ?? true,
      requireNumber: input?.requireNumber ?? true,
      requireSymbol: input?.requireSymbol ?? true,
    };
  }

  private parsePasswordPolicy(value?: string): AdminPasswordPolicy {
    try {
      const parsed = value
        ? (JSON.parse(value) as AdminPasswordPolicy)
        : undefined;
      return this.normalizePasswordPolicy(parsed);
    } catch {
      return this.normalizePasswordPolicy();
    }
  }

  private validateAdminPassword(password: string, policy: AdminPasswordPolicy) {
    if (password.length < policy.minimumLength) {
      throw new ServiceUnavailableException(
        `管理员密码至少需要 ${policy.minimumLength} 个字符。`,
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
      throw new ServiceUnavailableException(
        `管理员密码还需要包含：${missing.join("、")}。`,
      );
    }
  }

  private hashPassword(password: string) {
    // 首位管理员密码只存储 scrypt 哈希，不以明文或可逆形式写入数据库。
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
  }

  private async findMigrationPath() {
    const startingPoints = [
      process.cwd(),
      dirname(fileURLToPath(import.meta.url)),
    ];
    for (const start of startingPoints) {
      let directory = resolve(start);
      for (let level = 0; level < 8; level += 1) {
        const candidate = join(
          directory,
          "db",
          "migrations",
          "0001_installer_core.sql",
        );
        try {
          await access(candidate);
          return candidate;
        } catch {
          directory = dirname(directory);
        }
      }
    }
    throw new Error("找不到 db/migrations/0001_installer_core.sql。");
  }

  private async persistDatabaseUrl(settings: DatabaseSettings) {
    const credentials = `${encodeURIComponent(settings.username)}:${encodeURIComponent(settings.password)}`;
    const host = `${settings.host.trim()}:${settings.port}`;
    const database = encodeURIComponent(settings.database.trim());
    const ssl = settings.ssl ? "?sslmode=require" : "";
    const value = `postgresql://${credentials}@${host}/${database}${ssl}`;
    const root = await this.findWorkspaceRoot();
    const envPath = join(root, ".env");
    const original = await readFile(envPath, "utf8").catch(() => "");
    const escaped = value.replaceAll("'", "'\\''");
    const line = `DATABASE_URL='${escaped}'`;
    const databaseUrlLine = /^\s*(?:export\s+)?DATABASE_URL=.*$/m;
    const contents = databaseUrlLine.test(original)
      ? original.replace(databaseUrlLine, line)
      : `${original}${original && !original.endsWith("\n") ? "\n" : ""}${line}\n`;
    const tempPath = `${envPath}.tmp`;
    await writeFile(tempPath, contents, { mode: 0o600 });
    await rename(tempPath, envPath);
    return true;
  }

  private async findWorkspaceRoot() {
    const start = resolve(process.cwd());
    let directory = start;
    for (let level = 0; level < 8; level += 1) {
      try {
        await access(join(directory, "pnpm-workspace.yaml"));
        return directory;
      } catch {
        directory = dirname(directory);
      }
    }
    throw new Error("找不到 pnpm workspace 根目录。");
  }

  private async hasSavedDatabaseUrl() {
    try {
      const root = await this.findWorkspaceRoot();
      const contents = await readFile(join(root, ".env"), "utf8");
      return /^\s*(?:export\s+)?DATABASE_URL=.+$/m.test(contents);
    } catch {
      return false;
    }
  }

  private async getPool() {
    if (this.runtimePool) return this.runtimePool;
    const connectionString =
      process.env.DATABASE_URL ?? (await this.readSavedDatabaseUrl());
    if (!connectionString) return undefined;
    const pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 3000,
      max: 3,
    });
    try {
      await pool.query("SELECT 1");
      this.runtimePool = pool;
      const databaseUrl = new URL(connectionString);
      this.databaseSummary = {
        host: databaseUrl.hostname,
        port: Number(databaseUrl.port || 5432),
        database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, "")),
        username: decodeURIComponent(databaseUrl.username),
      };
      return pool;
    } catch {
      await pool.end();
      return undefined;
    }
  }

  private async readSavedDatabaseUrl() {
    try {
      const root = await this.findWorkspaceRoot();
      const contents = await readFile(join(root, ".env"), "utf8");
      const match = contents.match(
        /^\s*(?:export\s+)?DATABASE_URL\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s#]+))\s*$/m,
      );
      return match?.[1] ?? match?.[2] ?? match?.[3];
    } catch {
      return undefined;
    }
  }

  private replaceRuntimePool(pool: Pool) {
    const previousPool = this.runtimePool;
    this.runtimePool = pool;
    if (previousPool && previousPool !== pool) void previousPool.end();
  }

  private parseDeploymentRecords(value?: string) {
    if (!value) return [] as DeploymentRecord[];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as DeploymentRecord[]) : [];
    } catch {
      return [] as DeploymentRecord[];
    }
  }

  private describeError(error: unknown) {
    return error instanceof Error
      ? error.message
      : "无法连接数据库，请检查连接信息。";
  }
}
