import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { FetchRequest, JsonRpcProvider } from "ethers";
import type { Pool, PoolClient } from "pg";

export interface RpcConfiguration {
  chainId: number | null;
  chainName: string;
  nodes: string[];
  activeUrl: string;
  metrics: Record<string, RpcNodeMetric>;
  source: "database" | "environment" | "defaults" | "unavailable";
}

export interface RpcNodeMetric {
  status: "success" | "failed";
  latencyMs: number | null;
  testedAt: string;
  blockNumber?: number;
  message?: string;
}

interface ChainCatalogEntry {
  name?: unknown;
  chainId?: unknown;
  rpc?: Array<{ url?: unknown }>;
}

let catalogPromise: Promise<ChainCatalogEntry[]> | undefined;

async function readChainCatalog() {
  catalogPromise ??= readFile(new URL("./rpcs.json", import.meta.url), "utf8")
    .then((content) => JSON.parse(content) as ChainCatalogEntry[])
    .catch(() => {
      catalogPromise = undefined;
      return [];
    });
  return catalogPromise;
}

export function normalizeRpcUrl(input: unknown) {
  if (typeof input !== "string" || input.trim().length > 2048) {
    throw new BadRequestException("RPC 地址无效。");
  }
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new BadRequestException("RPC 地址格式无效。");
  }
  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new BadRequestException(
      "RPC 地址须使用 HTTPS；仅本机地址允许 HTTP，且不能包含账号、密码或片段。",
    );
  }
  return url.toString();
}

async function getDefaultNodes(chainId: number) {
  const catalog = await readChainCatalog();
  const chain = catalog.find((entry) => entry.chainId === chainId);
  const nodes = (chain?.rpc ?? [])
    .map((entry) => entry.url)
    .filter((url): url is string => typeof url === "string")
    .filter((url) => !url.includes("${"))
    .flatMap((url) => {
      try {
        return [normalizeRpcUrl(url)];
      } catch {
        return [];
      }
    });
  return {
    chainName:
      typeof chain?.name === "string" ? chain.name : `Chain ${chainId}`,
    nodes: [...new Set(nodes)],
  };
}

function parseSavedConfiguration(value: string, chainId: number) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ServiceUnavailableException("已保存的 RPC 配置格式无效。");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { chainId?: unknown }).chainId !== chainId ||
    !Array.isArray((parsed as { nodes?: unknown }).nodes) ||
    typeof (parsed as { activeUrl?: unknown }).activeUrl !== "string"
  ) {
    throw new ServiceUnavailableException("已保存的 RPC 配置与安装链不匹配。");
  }
  const saved = parsed as { nodes: unknown[]; activeUrl: string };
  const nodes = saved.nodes.map((url) => normalizeRpcUrl(url));
  const activeUrl = normalizeRpcUrl(saved.activeUrl);
  if (!nodes.includes(activeUrl)) {
    throw new ServiceUnavailableException(
      "当前 RPC 节点不在已保存的节点列表中。",
    );
  }
  return { nodes: [...new Set(nodes)], activeUrl };
}

function parseRpcMetrics(
  value: string | undefined,
  chainId: number,
  nodes: string[],
) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as {
      chainId?: unknown;
      metrics?: Record<string, unknown>;
    };
    if (parsed.chainId !== chainId || !parsed.metrics) return {};
    return Object.fromEntries(
      nodes.flatMap((url) => {
        const value = parsed.metrics?.[url];
        if (!value || typeof value !== "object") return [];
        const metric = value as Partial<RpcNodeMetric>;
        if (
          (metric.status !== "success" && metric.status !== "failed") ||
          typeof metric.testedAt !== "string" ||
          (metric.latencyMs !== null &&
            (!Number.isFinite(metric.latencyMs) || metric.latencyMs! < 0))
        ) {
          return [];
        }
        return [[url, metric as RpcNodeMetric]];
      }),
    );
  } catch {
    return {};
  }
}

export async function resolveRpcConfiguration(
  chainId: number | null,
  savedValue?: string,
  metricsValue?: string,
): Promise<RpcConfiguration> {
  if (!chainId) {
    return {
      chainId: null,
      chainName: "尚未锁定",
      nodes: [],
      activeUrl: "",
      metrics: {},
      source: "unavailable",
    };
  }
  const defaults = await getDefaultNodes(chainId);
  if (savedValue !== undefined) {
    const saved = parseSavedConfiguration(savedValue, chainId);
    return {
      chainId,
      chainName: defaults.chainName,
      ...saved,
      metrics: parseRpcMetrics(metricsValue, chainId, saved.nodes),
      source: "database",
    };
  }
  const environmentUrl = process.env.CHAIN_RPC_URL?.trim();
  if (environmentUrl) {
    try {
      const activeUrl = normalizeRpcUrl(environmentUrl);
      return {
        chainId,
        chainName: defaults.chainName,
        nodes: [
          activeUrl,
          ...defaults.nodes.filter((url) => url !== activeUrl),
        ],
        activeUrl,
        metrics: parseRpcMetrics(metricsValue, chainId, [
          activeUrl,
          ...defaults.nodes,
        ]),
        source: "environment",
      };
    } catch {
      throw new ServiceUnavailableException("CHAIN_RPC_URL 格式无效。");
    }
  }
  const nodes = defaults.nodes;
  return {
    chainId,
    chainName: defaults.chainName,
    nodes,
    activeUrl: nodes[0] ?? "",
    metrics: parseRpcMetrics(metricsValue, chainId, nodes),
    source: nodes.length ? "defaults" : "unavailable",
  };
}

export async function probeRpcNode(
  urlInput: unknown,
  chainId: number,
  timeoutMs = 8000,
) {
  const url = normalizeRpcUrl(urlInput);
  const request = new FetchRequest(url);
  request.timeout = timeoutMs;
  const provider = new JsonRpcProvider(request, undefined, {
    batchMaxCount: 1,
  });
  const startedAt = performance.now();
  try {
    const [network, blockNumber] = await Promise.all([
      provider.getNetwork(),
      provider.getBlockNumber(),
    ]);
    if (network.chainId !== BigInt(chainId)) {
      return {
        url,
        chainId: Number(network.chainId),
        status: "failed" as const,
        latencyMs: null,
        blockNumber,
        message: `节点返回 ChainId ${network.chainId.toString()}，与安装链 ${chainId} 不一致。`,
      };
    }
    return {
      url,
      chainId,
      status: "success" as const,
      latencyMs: Math.round(performance.now() - startedAt),
      blockNumber,
    };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    return {
      url,
      chainId,
      status: "failed" as const,
      latencyMs: null,
      message: "连接失败或无法读取区块高度。",
    };
  } finally {
    provider.destroy();
  }
}

export async function getBoundRpcProvider(
  chainId: number,
  addresses: string[],
  database: Pool | PoolClient,
) {
  const result = await database.query<{
    config_key: string;
    config_value: string;
  }>(
    "SELECT config_key, config_value FROM system_configs WHERE config_key = ANY($1::text[])",
    [["rpc_nodes", "rpc_node_metrics"]],
  );
  const storedValues = new Map(
    result.rows.map((row) => [row.config_key, row.config_value]),
  );
  const configuration = await resolveRpcConfiguration(
    chainId,
    storedValues.get("rpc_nodes"),
    storedValues.get("rpc_node_metrics"),
  );
  if (!configuration.activeUrl) {
    throw new ServiceUnavailableException(
      "当前安装链没有可用 RPC 节点，请在系统设置中配置。",
    );
  }
  const fallbackNodes = configuration.nodes
    .filter((url) => url !== configuration.activeUrl)
    .sort((left, right) => {
      const leftMetric = configuration.metrics[left];
      const rightMetric = configuration.metrics[right];
      const speed = (metric?: RpcNodeMetric) =>
        metric?.status === "success" && metric.latencyMs !== null
          ? metric.latencyMs
          : metric?.status === "failed"
            ? Number.MAX_SAFE_INTEGER
            : Number.MAX_SAFE_INTEGER - 1;
      return speed(leftMetric) - speed(rightMetric);
    });
  for (const candidate of [configuration.activeUrl, ...fallbackNodes]) {
    let provider: JsonRpcProvider | undefined;
    try {
      const request = new FetchRequest(candidate);
      request.timeout = 8000;
      provider = new JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(chainId)) throw new Error("网络不匹配");
      const codes = await Promise.all(
        addresses.map((address) => provider!.getCode(address)),
      );
      if (codes.some((code) => code === "0x"))
        throw new Error("未找到绑定合约");
      return provider;
    } catch {
      provider?.destroy();
    }
  }
  throw new ServiceUnavailableException(
    "配置的 RPC 节点均不可用或无法读取绑定合约，请在系统设置中检查节点。",
  );
}
