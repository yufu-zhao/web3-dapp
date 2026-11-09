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

export interface InstallationIdentity {
  chainId: number | null;
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
}

type InstallationIdentityInput = Pick<
  InstallationIdentity,
  "systemName" | "tokenName" | "tokenSymbol"
>;

export interface DatabaseCheck {
  connected: boolean;
  database: string;
  serverVersion: string;
  exists: boolean;
  empty: boolean;
  tableCount: number;
  tables: string[];
  canCreateDatabase: boolean;
  existingInstallation?: {
    administrator: string;
    installation: InstallationIdentity;
  };
}

interface InitializeInput {
  database: DatabaseSettings;
  administrator: { username: string; password: string };
  installation: InstallationIdentityInput;
  passwordPolicy?: AdminPasswordPolicy;
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
  private databaseSettingsSaveAttempted = false;
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
      walletConnectConfigured: Boolean(this.walletConnectProjectId()),
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

  async migrateDatabase() {
    const pool = await this.getPool();
    if (!pool) {
      throw new ServiceUnavailableException("请先初始化数据库并保存连接配置。");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const schema = await client.query<{ exists: boolean }>(
        "SELECT to_regclass('public.system_configs') IS NOT NULL AS exists",
      );
      if (!schema.rows[0]?.exists) {
        throw new ConflictException(
          "当前数据库尚未完成首次安装，不能执行后续迁移。",
        );
      }
      const installed = await client.query(
        "SELECT 1 FROM system_configs WHERE config_key = 'installed_at'",
      );
      if (!installed.rowCount) {
        throw new ConflictException(
          "当前数据库尚未完成首次安装，不能执行后续迁移。",
        );
      }
      const applied = await this.applyPendingMigrations(client);
      await client.query("COMMIT");
      return { applied };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(this.describeError(error));
    } finally {
      client.release();
    }
  }

  async useExistingDatabase(settings?: DatabaseSettings) {
    if (settings) this.validateDatabaseSettings(settings);
    const pool = settings
      ? new Pool(this.createPoolConfig(settings))
      : await this.getPool();
    if (!pool) throw new ConflictException("请先检查目标数据库连接。");
    try {
      // 跳过只读取并绑定已有安装，不执行迁移、不创建管理员、不覆盖系统配置。
      const existing = await this.recognizeInstallation(pool);
      if (!existing) {
        throw new ConflictException(
          "目标数据库非空，但未识别到完整的链构安装，请更换数据库。",
        );
      }
      if (settings) {
        this.databaseSettingsSaveAttempted = true;
        this.databaseSettingsSaved = await this.persistDatabaseUrl(
          settings,
        ).catch(() => false);
        this.replaceRuntimePool(pool);
        this.databaseSummary = {
          host: settings.host.trim(),
          port: settings.port,
          database: settings.database.trim(),
          username: settings.username.trim(),
        };
      }
      return await this.installationSummary();
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(this.describeError(error));
    } finally {
      if (pool !== this.runtimePool) await pool.end();
    }
  }

  private async recognizeInstallation(pool: Pool) {
    try {
      // 核心表、首版迁移、管理员和安装身份共同识别，避免仅凭同名表误认其他系统。
      const tables = await pool.query<{ total: string }>(
        "SELECT COUNT(*)::text AS total FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
        [
          [
            "schema_migrations",
            "admin_users",
            "roles",
            "menus",
            "system_configs",
          ],
        ],
      );
      if (Number(tables.rows[0]?.total) !== 5) return undefined;
      const [migration, admin, configs] = await Promise.all([
        pool.query(
          "SELECT 1 FROM public.schema_migrations WHERE version = '0001_installer_core'",
        ),
        pool.query<{ username: string }>(
          "SELECT username FROM public.admin_users ORDER BY id LIMIT 1",
        ),
        pool.query<{ config_key: string; config_value: string }>(
          "SELECT config_key, config_value FROM public.system_configs WHERE config_key IN ('installed_at', 'system_name', 'token_name', 'token_symbol')",
        ),
      ]);
      const values = new Map(
        configs.rows.map((row) => [row.config_key, row.config_value]),
      );
      const installation = this.parseInstallationIdentity(values);
      if (
        !migration.rowCount ||
        !admin.rows[0] ||
        !values.get("installed_at") ||
        !installation
      )
        return undefined;
      this.validateInstallationIdentity(installation);
      installation.chainId =
        (await this.readRuntimeBinding(pool))?.chainId ?? null;
      return { administrator: admin.rows[0].username, installation };
    } catch {
      return undefined;
    }
  }

  private async readRuntimeBinding(pool: Pool) {
    const table = await pool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.runtime_contract_binding') IS NOT NULL AS exists",
    );
    const result = table.rows[0]?.exists
      ? await pool.query<{ chain_id: string; deployment_id: string }>(
          "SELECT chain_id::text, deployment_id FROM runtime_contract_binding WHERE singleton = TRUE",
        )
      : { rows: [] as Array<{ chain_id: string; deployment_id: string }> };
    const row = result.rows[0];
    if (row) {
      const chainId = Number(row.chain_id);
      if (
        !Number.isSafeInteger(chainId) ||
        chainId <= 0 ||
        !row.deployment_id
      ) {
        throw new ServiceUnavailableException("生效合约绑定数据无效。");
      }
      return { chainId, deploymentId: row.deployment_id };
    }
    // 兼容尚未完成回填的旧安装；绑定成功后安装器会删除旧配置键。
    const legacy = await pool.query<{
      config_key: string;
      config_value: string;
    }>(
      "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('installation_chain_id', 'deployment_id')",
    );
    const values = new Map(
      legacy.rows.map((item) => [item.config_key, item.config_value]),
    );
    const chainId = Number(values.get("installation_chain_id"));
    if (!Number.isSafeInteger(chainId) || chainId <= 0) return null;
    const deploymentId = values.get("deployment_id") ?? "";
    if (deploymentId && !/^[0-9]+-[a-f0-9]{8}$/.test(deploymentId)) {
      throw new ServiceUnavailableException("生效合约绑定数据无效。");
    }
    return { chainId, deploymentId };
  }

  async initialize(input: InitializeInput) {
    this.validateInitializeInput(input);
    this.validateAdminPassword(
      input.administrator.password,
      this.normalizePasswordPolicy(input.passwordPolicy),
    );
    const databaseState = await this.inspectDatabase(input.database);
    if (databaseState.exists && !databaseState.empty) {
      throw new ConflictException(
        "目标数据库非空，不能初始化。链构已有安装请确认后跳过，否则请更换数据库。",
      );
    }
    if (!databaseState.exists) await this.createDatabase(input.database);

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
      // 与迁移共用锁，并再次检查空库，防止检查后被另一安装请求抢先初始化。
      await client.query("SELECT pg_advisory_xact_lock(4102, 3)");
      const occupied = await client.query(
        "SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') LIMIT 1",
      );
      if (occupied.rowCount) {
        throw new ConflictException(
          "目标数据库已非空，请重新检查后选择跳过或更换数据库。",
        );
      }
      await this.applyPendingMigrations(client);

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

      const installation = await this.persistInstallationIdentity(
        client,
        input.installation,
      );

      // 管理端 MVP 以系统管理菜单为主入口，保留概览记录但不在侧栏显示。
      await client.query(
        `INSERT INTO menus (code, name, path, icon, sort_order, is_visible)
         VALUES
           ('overview', '概览', '/', 'dashboard', 10, FALSE),
           ('administrators', '管理员', '/administrators', 'admin_panel_settings', 20, TRUE),
           ('system-settings', '系统设置', '/settings', 'settings', 30, TRUE)
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
      this.databaseSettingsSaveAttempted = true;
      this.databaseSettingsSaved = settingsSaved;
      return {
        initialized: true,
        database: input.database.database,
        administrator: input.administrator.username.trim(),
        walletConnectConfigured: Boolean(this.walletConnectProjectId()),
        installation,
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
    const projectId = this.walletConnectProjectId();
    if (!pool) {
      return {
        walletConnectConfigured: Boolean(projectId),
        installed: false,
      };
    }

    try {
      const result = await pool.query<{
        config_key: string;
        config_value: string;
      }>(
        "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('admin_password_policy', 'system_name', 'token_name', 'token_symbol')",
      );
      const installed = await pool.query(
        "SELECT 1 FROM system_configs WHERE config_key = 'installed_at'",
      );
      const configs = new Map(
        result.rows.map((item) => [item.config_key, item.config_value]),
      );
      const installation = this.parseInstallationIdentity(configs);
      if (installation) {
        installation.chainId =
          (await this.readRuntimeBinding(pool))?.chainId ?? null;
      }
      return {
        walletConnectConfigured: Boolean(projectId),
        passwordPolicy: this.parsePasswordPolicy(
          configs.get("admin_password_policy"),
        ),
        installation,
        installed: installed.rowCount === 1,
      };
    } catch {
      return {
        walletConnectConfigured: Boolean(projectId),
        installation: null,
        installed: false,
      };
    }
  }

  walletConnectConfig() {
    const projectId = this.walletConnectProjectId();
    return { projectId: projectId || null };
  }

  async saveInstallationIdentity(identity: InstallationIdentityInput) {
    this.validateInstallationIdentity(identity);
    const pool = await this.getPool();
    if (!pool) throw new ServiceUnavailableException("请先初始化数据库。");
    const installed = await pool.query(
      "SELECT 1 FROM system_configs WHERE config_key = 'installed_at'",
    );
    if (installed.rowCount !== 1) {
      throw new ConflictException("数据库尚未完成初始化，不能补录安装配置。");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const installation = await this.persistInstallationIdentity(
        client,
        identity,
      );
      await client.query("COMMIT");
      return { saved: true, installation };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(this.describeError(error));
    } finally {
      client.release();
    }
  }

  async installationSummary() {
    const pool = await this.getPool();
    if (!pool) return { installed: false };

    try {
      const [database, administrator, records, configs, binding] =
        await Promise.all([
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
            "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('admin_password_policy', 'installed_at', 'system_name', 'token_name', 'token_symbol')",
          ),
          this.readRuntimeBinding(pool),
        ]);
      const configValues = new Map(
        configs.rows.map((item) => [item.config_key, item.config_value]),
      );
      // 只有写入 installed_at 才算初始化完成；仅能连接数据库不足以解锁后续安装步骤。
      const initialized = Boolean(configValues.get("installed_at"));
      const installation = this.parseInstallationIdentity(configValues);
      if (installation) installation.chainId = binding?.chainId ?? null;
      return {
        installed: initialized,
        database: database.rows[0]?.database_name ?? "",
        databaseConnection: this.databaseSummary,
        administrator: administrator.rows[0]?.username ?? "",
        deployments: this.parseDeploymentRecords(records.rows[0]?.config_value),
        walletConnectConfigured: Boolean(this.walletConnectProjectId()),
        passwordPolicy: this.parsePasswordPolicy(
          configValues.get("admin_password_policy"),
        ),
        installation,
        installedAt: configValues.get("installed_at") ?? null,
        // 切换保存失败时不能把原目标库的 .env 误报为当前目标已保存。
        settingsSaved: this.databaseSettingsSaveAttempted
          ? this.databaseSettingsSaved
          : await this.hasSavedDatabaseUrl(),
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

  async activateSavedDeployment(chainId: number, deploymentId: string) {
    const safeChainId = this.validateChainId(chainId);
    const deployment = await this.getSavedDeployment(safeChainId, deploymentId);
    if (
      Number(deployment.chainId) !== safeChainId ||
      deployment.deploymentId !== deploymentId
    ) {
      throw new ConflictException("部署资料与当前网络或部署标识不匹配。");
    }
    // 完成页允许对已归档部署幂等登记，修复旧服务版本漏写的数据库配置。
    const installation = await this.lockCompletedInstallationDeployment(
      safeChainId,
      deploymentId,
      deployment,
      true,
    );
    return { deploymentId, chainId: safeChainId, installation };
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

  async getPendingDeployments() {
    const root = await this.findWorkspaceRoot();
    const deploymentRoot = join(root, "contracts", "deploy");
    const entries = await readdir(deploymentRoot, {
      withFileTypes: true,
    }).catch((error: unknown) => {
      if ((error as { code?: string }).code === "ENOENT") return [];
      throw error;
    });
    const pending = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && /^\d{1,9}$/.test(entry.name))
        .map(async (entry) => {
          const chainId = Number(entry.name);
          if (
            !Number.isSafeInteger(chainId) ||
            chainId <= 0 ||
            chainId > 999999999
          )
            return undefined;
          const record = await this.readJsonFile<Record<string, unknown>>(
            join(deploymentRoot, entry.name, ".pending-deployment.json"),
          );
          if (record?.status !== "in_progress") return undefined;
          return {
            chainId,
            deployer: String(record.deployer ?? ""),
            releaseVersion: String(record.releaseVersion ?? ""),
            updatedAt: String(record.updatedAt ?? ""),
          };
        }),
    );
    return { pending: pending.filter((item) => item !== undefined) };
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
    const deploymentFile = join(directory, "deployment.json");
    await this.writeJsonFile(deploymentFile, saved);
    let installation: InstallationIdentity;
    try {
      // 只有归档文件写入成功后，才在同一数据库事务中登记运行时合约绑定。
      installation = await this.lockCompletedInstallationDeployment(
        safeChainId,
        deploymentId,
        saved,
        false,
      );
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(
        () => undefined,
      );
      throw error;
    }
    await this.clearPendingDeployment(safeChainId).catch(() => undefined);
    return { deploymentId, outputPath, deployment: saved, installation };
  }

  private async lockCompletedInstallationDeployment(
    chainId: number,
    deploymentId: string,
    deployment: Record<string, unknown>,
    allowLegacyVerification: boolean,
  ) {
    const pool = await this.getPool();
    if (!pool) throw new ServiceUnavailableException("请先初始化数据库。");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await this.applyPendingMigrations(client);
      // 与后台设置写入共用锁，确保当前合约绑定和身份设置串行完成。
      await client.query("SELECT pg_advisory_xact_lock(4102, 4)");
      const installed = await client.query(
        "SELECT 1 FROM system_configs WHERE config_key = 'installed_at'",
      );
      if (installed.rowCount !== 1) {
        throw new ConflictException("数据库尚未完成初始化，不能锁定目标链。");
      }
      const current = await client.query<{
        config_key: string;
        config_value: string;
      }>(
        "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('system_name', 'token_name', 'token_symbol')",
      );
      const configs = new Map(
        current.rows.map((item) => [item.config_key, item.config_value]),
      );
      const identity = this.parseInstallationIdentity(configs);
      if (!identity) {
        throw new ConflictException("请先确认系统名称和代币信息。");
      }
      const existingBinding = await client.query<{ chain_id: string }>(
        "SELECT chain_id::text FROM runtime_contract_binding WHERE singleton = TRUE FOR UPDATE",
      );
      const existingChainId = existingBinding.rows[0]
        ? Number(existingBinding.rows[0].chain_id)
        : null;
      if (existingChainId !== null && existingChainId !== chainId) {
        throw new ConflictException(
          `当前合约已绑定 ChainId ${existingChainId}，当前部署为 ${chainId}。`,
        );
      }
      if (
        Number(deployment.chainId) !== chainId ||
        deployment.status !== "complete"
      ) {
        throw new ConflictException(
          "部署归档与当前 ChainId 或完成状态不匹配。",
        );
      }
      const sourceContracts = deployment.contracts;
      if (
        !sourceContracts ||
        typeof sourceContracts !== "object" ||
        Array.isArray(sourceContracts)
      ) {
        throw new ConflictException("部署归档缺少合约地址映射。");
      }
      const runtimeContracts: Record<
        string,
        { address: string; transactionHash: string | null }
      > = {};
      for (const [name, value] of Object.entries(sourceContracts)) {
        const item = value as Record<string, unknown>;
        const address = String(item.address ?? "");
        const transactionHash = String(item.transactionHash ?? "");
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
          throw new ConflictException(`部署归档中的 ${name} 地址无效。`);
        }
        runtimeContracts[name] = {
          address,
          transactionHash: /^0x[a-fA-F0-9]{64}$/.test(transactionHash)
            ? transactionHash
            : null,
        };
      }
      if (!runtimeContracts.ProjectToken || !runtimeContracts.FairSaleV2) {
        throw new ConflictException("部署归档缺少主代币或预售合约地址。");
      }
      const pairAddress = String(deployment.pairAddress ?? "");
      if (!/^0x[a-fA-F0-9]{40}$/.test(pairAddress)) {
        throw new ConflictException("部署归档中的交易对地址无效。");
      }
      const releaseVersion = String(deployment.releaseVersion ?? "").trim();
      if (!releaseVersion || releaseVersion.length > 64) {
        throw new ConflictException("部署归档中的合约发布版本无效。");
      }
      const verifiedBlockValue = deployment.verifiedBlockNumber;
      const verifiedBlock =
        typeof verifiedBlockValue === "number" &&
        Number.isSafeInteger(verifiedBlockValue) &&
        verifiedBlockValue >= 0
          ? verifiedBlockValue
          : null;
      const verifiedBlockHashValue = String(deployment.verifiedBlockHash ?? "");
      const verifiedBlockHash = /^0x[a-fA-F0-9]{64}$/.test(
        verifiedBlockHashValue,
      )
        ? verifiedBlockHashValue
        : null;
      if (
        !allowLegacyVerification &&
        (verifiedBlock === null || !verifiedBlockHash)
      ) {
        throw new ConflictException(
          "部署归档缺少最终链上核验证据，请重新核验。",
        );
      }
      // 数据库只保留运行时需要的地址映射和部署核验摘要，不复制完整安装档案。
      await client.query(
        `INSERT INTO runtime_contract_binding (
           singleton, chain_id, deployment_id, release_version, contracts,
           pair_address, verified_block, verified_block_hash, bound_at
         ) VALUES (TRUE, $1, $2, $3, $4::jsonb, $5, $6, $7, NOW())
         ON CONFLICT (singleton) DO UPDATE
           SET chain_id = EXCLUDED.chain_id,
               deployment_id = EXCLUDED.deployment_id,
               release_version = EXCLUDED.release_version,
               contracts = EXCLUDED.contracts,
               pair_address = EXCLUDED.pair_address,
               verified_block = EXCLUDED.verified_block,
               verified_block_hash = EXCLUDED.verified_block_hash,
               bound_at = EXCLUDED.bound_at`,
        [
          chainId,
          deploymentId,
          releaseVersion,
          JSON.stringify(runtimeContracts),
          pairAddress,
          verifiedBlock,
          verifiedBlockHash,
        ],
      );
      // 完成绑定后清理由旧版本使用的配置键，ChainId 只保存在运行时绑定表。
      await client.query(
        "DELETE FROM system_configs WHERE config_key = ANY($1::text[])",
        [["installation_chain_id", "deployment_id", "chain_id"]],
      );
      await client.query("COMMIT");
      return { ...identity, chainId };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(this.describeError(error));
    } finally {
      client.release();
    }
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
        existingInstallation: tables.length
          ? await this.recognizeInstallation(targetPool)
          : undefined,
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
    this.validateInstallationIdentity(input.installation);
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
    if (
      typeof administrator.password !== "string" ||
      !administrator.password ||
      administrator.password.length > 1024
    ) {
      throw new ServiceUnavailableException(
        "首位管理员密码不能为空且最多为 1024 个字符。",
      );
    }
    if (!this.walletConnectProjectId()) {
      throw new ServiceUnavailableException(
        "缺少必填配置 WALLETCONNECT_PROJECT_ID，请在根目录 .env 中设置并重启安装服务。",
      );
    }
  }

  private walletConnectProjectId() {
    return process.env.WALLETCONNECT_PROJECT_ID?.trim() ?? "";
  }

  private validateInstallationIdentity(identity: InstallationIdentityInput) {
    if (
      !identity ||
      !identity.systemName?.trim() ||
      identity.systemName.trim().length > 80 ||
      !identity.tokenName?.trim() ||
      identity.tokenName.trim().length > 80 ||
      !/^[\p{L}\p{N}._-]{1,16}$/u.test(identity.tokenSymbol?.trim() ?? "")
    ) {
      throw new ServiceUnavailableException(
        "请填写有效的系统名称、代币名称和代币简称。",
      );
    }
  }

  private async persistInstallationIdentity(
    client: PoolClient,
    identity: InstallationIdentityInput,
  ): Promise<InstallationIdentity> {
    // 安装身份只允许首次写入；已有值不匹配时中止事务，避免覆盖旧部署配置。
    await client.query("SELECT pg_advisory_xact_lock(4102, 4)");
    const entries = [
      ["system_name", identity.systemName.trim(), "安装时确认的系统名称"],
      ["token_name", identity.tokenName.trim(), "链上主代币全称"],
      ["token_symbol", identity.tokenSymbol.trim(), "链上主代币简称"],
    ] as const;
    const current = await client.query<{
      config_key: string;
      config_value: string;
    }>(
      "SELECT config_key, config_value FROM system_configs WHERE config_key = ANY($1::text[])",
      [entries.map(([key]) => key)],
    );
    const existing = new Map(
      current.rows.map((item) => [item.config_key, item.config_value]),
    );
    for (const [key, value] of entries) {
      const saved = existing.get(key);
      if (saved !== undefined && saved !== value) {
        throw new ConflictException(
          `数据库中的安装配置 ${key} 已存在且与本次输入不同，请使用原配置。`,
        );
      }
      await client.query(
        `INSERT INTO system_configs (config_key, config_value, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (config_key) DO NOTHING`,
        [
          key,
          value,
          entries.find((entry) => entry[0] === key)?.[2] ?? "安装身份配置",
        ],
      );
    }
    const saved = await client.query<{
      config_key: string;
      config_value: string;
    }>(
      "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('system_name', 'token_name', 'token_symbol')",
    );
    const configs = new Map(
      saved.rows.map((item) => [item.config_key, item.config_value]),
    );
    const installation = this.parseInstallationIdentity(configs);
    if (!installation) {
      throw new ConflictException("安装身份配置未能完整保存，请重试。");
    }
    return installation;
  }

  private parseInstallationIdentity(
    configs: Map<string, string>,
  ): InstallationIdentity | null {
    const systemName = configs.get("system_name")?.trim() ?? "";
    const tokenName = configs.get("token_name")?.trim() ?? "";
    const tokenSymbol = configs.get("token_symbol")?.trim() ?? "";
    if (!systemName || !tokenName || !tokenSymbol) return null;
    return { chainId: null, systemName, tokenName, tokenSymbol };
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

  private async findMigrationsDirectory() {
    const startingPoints = [
      process.cwd(),
      dirname(fileURLToPath(import.meta.url)),
    ];
    for (const start of startingPoints) {
      let directory = resolve(start);
      for (let level = 0; level < 8; level += 1) {
        const candidate = join(directory, "db", "migrations");
        try {
          await access(join(candidate, "0001_installer_core.sql"));
          return candidate;
        } catch {
          directory = dirname(directory);
        }
      }
    }
    throw new Error("找不到 db/migrations 目录。");
  }

  private async applyPendingMigrations(client: PoolClient) {
    // 初始化和手动升级共享事务锁，确保并发请求不会重复执行同一迁移。
    await client.query("SELECT pg_advisory_xact_lock(4102, 3)");
    const migrationsDirectory = await this.findMigrationsDirectory();
    const files = (await readdir(migrationsDirectory))
      .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
      .sort((left, right) => left.localeCompare(right));
    const applied: string[] = [];

    for (const file of files) {
      const version = file.slice(0, -4);
      const table = await client.query<{ exists: boolean }>(
        "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
      );
      if (table.rows[0]?.exists) {
        const previous = await client.query(
          "SELECT 1 FROM schema_migrations WHERE version = $1",
          [version],
        );
        if (previous.rowCount) continue;
      }

      await client.query(
        await readFile(join(migrationsDirectory, file), "utf8"),
      );
      const created = await client.query<{ exists: boolean }>(
        "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
      );
      if (!created.rows[0]?.exists) {
        throw new Error(`迁移 ${version} 未创建 schema_migrations 表。`);
      }
      await client.query(
        `INSERT INTO schema_migrations (version)
         VALUES ($1) ON CONFLICT (version) DO NOTHING`,
        [version],
      );
      applied.push(version);
    }
    return applied;
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
