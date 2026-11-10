import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { DatabaseService } from "./database.service.js";

interface CarouselItem {
  id: string;
  title: string;
  desktopImageUrl: string;
  mobileImageUrl: string;
  actionType: "route" | "external" | "none";
  actionTarget: string;
  widthMode: "default" | "full";
  desktopHeight: number;
  mobileHeight: number;
  sortOrder: number;
  isVisible: boolean;
}

interface Announcement {
  id: string;
  title: string;
  summary: string;
  contentType: "article" | "video";
  body: string;
  mediaUrl: string;
  mediaMode: "upload" | "external";
  isVisible: boolean;
}

interface ContentSettings {
  carouselItems: CarouselItem[];
  announcements: Announcement[];
  tickerSettings: {
    scrollDurationMs: number;
    itemDelayMs: number;
    fontSizePx: number;
  };
}

const DEFAULT_SETTINGS: ContentSettings = {
  carouselItems: [],
  announcements: [],
  tickerSettings: {
    scrollDurationMs: 12000,
    itemDelayMs: 500,
    fontSizePx: 14,
  },
};

const MIME_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
]);

@Injectable()
export class ContentManagementService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getSettings(): Promise<ContentSettings> {
    const result = await this.databaseService
      .getPool()
      .query<{ config_value: string }>(
        "SELECT config_value FROM system_configs WHERE config_key = 'content_management'",
      );
    const raw = result.rows[0]?.config_value;
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    try {
      return this.validate(JSON.parse(raw) as unknown);
    } catch {
      throw new ServiceUnavailableException(
        "首页内容配置格式无效，请联系管理员。",
      );
    }
  }

  async getPublicSettings() {
    const settings = await this.getSettings();
    return {
      carouselItems: settings.carouselItems
        .filter((item) => item.isVisible)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          id: item.id,
          title: item.title,
          desktopImageUrl: item.desktopImageUrl,
          mobileImageUrl: item.mobileImageUrl,
          linkType: item.actionType,
          linkTarget: item.actionTarget,
          widthMode: item.widthMode,
          desktopHeight: item.desktopHeight,
          mobileHeight: item.mobileHeight,
        })),
      announcements: settings.announcements
        .filter((item) => item.isVisible)
        .map((item) => item),
      tickerSettings: settings.tickerSettings,
    };
  }

  async updateSettings(input: unknown) {
    const settings = this.validate(input);
    const serialized = JSON.stringify(settings);
    if (Buffer.byteLength(serialized, "utf8") > 1_000_000) {
      throw new BadRequestException("首页内容配置不能超过 1 MB。");
    }
    await this.databaseService.getPool().query(
      `INSERT INTO system_configs (config_key, config_value, description)
       VALUES ('content_management', $1, '用户端轮播、公告与滚动参数')
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = EXCLUDED.config_value,
             description = EXCLUDED.description,
             updated_at = NOW()`,
      [serialized],
    );
    return settings;
  }

  async saveAsset(fileName: string, mimeType: string, content: Buffer) {
    const extension = MIME_EXTENSIONS.get(mimeType.toLowerCase());
    if (!extension) throw new BadRequestException("不支持此图片或视频格式。");
    if (content.length === 0 || content.length > 100 * 1024 * 1024) {
      throw new BadRequestException("上传文件须大于 0 且不超过 100 MB。");
    }
    const claimedExtension = extname(fileName).toLowerCase();
    const allowedExtension =
      extension === ".jpg" ? [".jpg", ".jpeg"] : [extension];
    if (claimedExtension && !allowedExtension.includes(claimedExtension)) {
      throw new BadRequestException("文件扩展名与文件内容类型不匹配。");
    }
    const name = `${randomUUID()}${extension}`;
    await mkdir(this.assetDirectory(), { recursive: true });
    await writeFile(join(this.assetDirectory(), name), content, { flag: "wx" });
    return { url: `/api/public/content-assets/${name}` };
  }

  async readAsset(name: string) {
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/.test(name)) {
      throw new NotFoundException("文件不存在。");
    }
    try {
      return {
        content: await readFile(join(this.assetDirectory(), name)),
        contentType:
          [...MIME_EXTENSIONS.entries()].find(
            ([, extension]) => extension === extname(name),
          )?.[0] ?? "application/octet-stream",
      };
    } catch {
      throw new NotFoundException("文件不存在。");
    }
  }

  private assetDirectory() {
    return resolve(
      process.env.CONTENT_ASSET_DIR?.trim() || "data/content-assets",
    );
  }

  private validate(input: unknown): ContentSettings {
    // 所有配置由同一处校验，确保管理端写入和公开端读取使用相同约束。
    const value = this.asRecord(input, "首页内容");
    const ticker = this.asRecord(value.tickerSettings, "公告滚动设置");
    const carouselRaw = this.asArray(value.carouselItems, "轮播列表");
    const announcementsRaw = this.asArray(value.announcements, "公告列表");
    if (carouselRaw.length > 100 || announcementsRaw.length > 200) {
      throw new BadRequestException("轮播最多 100 条，公告最多 200 条。");
    }
    const ids = new Set<string>();
    const id = (raw: unknown) => {
      if (
        typeof raw !== "string" ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(raw) ||
        ids.has(raw)
      ) {
        throw new BadRequestException("内容 ID 无效或重复。");
      }
      ids.add(raw);
      return raw;
    };
    const text = (
      raw: unknown,
      label: string,
      max: number,
      required = false,
    ) => {
      if (
        typeof raw !== "string" ||
        raw.length > max ||
        (required && !raw.trim())
      ) {
        throw new BadRequestException(`${label}无效或超出长度限制。`);
      }
      return raw.trim();
    };
    const integer = (raw: unknown, label: string, min: number, max: number) => {
      if (
        typeof raw !== "number" ||
        !Number.isSafeInteger(raw) ||
        raw < min ||
        raw > max
      ) {
        throw new BadRequestException(
          `${label}必须为 ${min} 至 ${max} 的整数。`,
        );
      }
      return raw;
    };
    const flag = (raw: unknown, label: string) => {
      if (typeof raw !== "boolean")
        throw new BadRequestException(`${label}必须为布尔值。`);
      return raw;
    };
    const mediaUrl = (raw: unknown, label: string) => {
      const url = text(raw, label, 2048);
      if (
        url &&
        !url.startsWith("/api/public/content-assets/") &&
        !/^https:\/\//i.test(url)
      ) {
        throw new BadRequestException(`${label}仅支持 HTTPS 或平台上传地址。`);
      }
      return url;
    };
    const carouselItems = carouselRaw.map((raw, index): CarouselItem => {
      const item = this.asRecord(raw, `第 ${index + 1} 条轮播`);
      const actionType = item.actionType;
      const widthMode = item.widthMode;
      if (!["route", "external", "none"].includes(String(actionType)))
        throw new BadRequestException("轮播点击动作无效。");
      if (!["default", "full"].includes(String(widthMode)))
        throw new BadRequestException("轮播宽度模式无效。");
      const actionTarget = text(item.actionTarget, "轮播动作地址", 2048);
      if (
        actionType === "route" &&
        actionTarget &&
        (!actionTarget.startsWith("/") || actionTarget.startsWith("//"))
      ) {
        throw new BadRequestException("站内轮播链接必须为站内路径。");
      }
      if (
        actionType === "external" &&
        actionTarget &&
        !/^https:\/\//i.test(actionTarget)
      ) {
        throw new BadRequestException("外部轮播链接必须使用 HTTPS。");
      }
      return {
        id: id(item.id),
        title: text(item.title, "轮播名称", 100),
        desktopImageUrl: mediaUrl(item.desktopImageUrl, "桌面端图片地址"),
        mobileImageUrl: mediaUrl(item.mobileImageUrl, "手机端图片地址"),
        actionType: actionType as CarouselItem["actionType"],
        actionTarget,
        widthMode: widthMode as CarouselItem["widthMode"],
        desktopHeight: integer(item.desktopHeight, "桌面端轮播高度", 0, 2000),
        mobileHeight: integer(item.mobileHeight, "手机端轮播高度", 0, 2000),
        sortOrder: integer(item.sortOrder, "轮播顺序", 0, 100000),
        isVisible: flag(item.isVisible, "轮播显示状态"),
      };
    });
    const announcements = announcementsRaw.map((raw, index): Announcement => {
      const item = this.asRecord(raw, `第 ${index + 1} 条公告`);
      if (!["article", "video"].includes(String(item.contentType)))
        throw new BadRequestException("公告内容类型无效。");
      if (!["upload", "external"].includes(String(item.mediaMode)))
        throw new BadRequestException("公告媒体来源无效。");
      return {
        id: id(item.id),
        title: text(item.title, "公告标题", 160, true),
        summary: text(item.summary, "公告摘要", 300),
        contentType: item.contentType as Announcement["contentType"],
        body: text(item.body, "公告正文", 100000),
        mediaUrl: mediaUrl(item.mediaUrl, "公告媒体地址"),
        mediaMode: item.mediaMode as Announcement["mediaMode"],
        isVisible: flag(item.isVisible, "公告显示状态"),
      };
    });
    return {
      carouselItems,
      announcements,
      tickerSettings: {
        scrollDurationMs: integer(
          ticker.scrollDurationMs,
          "公告滚动时长",
          1000,
          120000,
        ),
        itemDelayMs: integer(ticker.itemDelayMs, "公告切换间隔", 0, 60000),
        fontSizePx: integer(ticker.fontSizePx, "公告字号", 10, 48),
      },
    };
  }

  private asRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException(`${label}格式无效。`);
    }
    return value as Record<string, unknown>;
  }

  private asArray(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value))
      throw new BadRequestException(`${label}格式无效。`);
    return value;
  }
}
