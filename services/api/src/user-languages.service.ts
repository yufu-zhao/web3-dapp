import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { DatabaseService } from "./database.service.js";
import { AiModelConfigurationService } from "./ai-model-configuration.service.js";

interface UserLanguage {
  id: string;
  locale: string;
  name: string;
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  translationCount: number;
}

interface TranslationItem {
  key: string;
  value: string;
  sourceValue: string | null;
}

@Injectable()
// 语言目录和翻译共用事务锁，确保默认语言切换及词条复制在并发写入时保持一致。
export class UserLanguagesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly aiModelConfigurationService: AiModelConfigurationService,
  ) {}

  async list() {
    const result = await this.databaseService.getPool().query<UserLanguage>(
      `SELECT language.id::text, language.locale, language.name,
              language.is_enabled AS "isEnabled",
              language.is_default AS "isDefault",
              language.sort_order AS "sortOrder",
              COUNT(translation.translation_key)::int AS "translationCount"
         FROM user_languages AS language
         LEFT JOIN user_language_translations AS translation
           ON translation.language_id = language.id
        GROUP BY language.id
        ORDER BY language.sort_order, language.locale`,
    );
    return { items: result.rows };
  }

  async create(input: unknown) {
    const body = this.record(input);
    const locale = this.locale(body.locale);
    const name = this.name(body.name);
    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      await this.lock(client);
      const created = await client.query<{ id: string }>(
        `INSERT INTO user_languages (locale, name, is_enabled, is_default, sort_order)
         VALUES ($1, $2, FALSE, FALSE,
           COALESCE((SELECT MAX(sort_order) + 1 FROM user_languages), 0))
         RETURNING id::text`,
        [locale, name],
      );
      const languageId = created.rows[0]!.id;
      // 新语言先复制默认语言作为翻译底稿，并保持停用，避免未校对内容直接展示。
      await client.query(
        `INSERT INTO user_language_translations
           (language_id, translation_key, translation_value)
         SELECT $1, translation_key, translation_value
           FROM user_language_translations
          WHERE language_id = (
            SELECT id FROM user_languages WHERE is_default = TRUE
          )
         ON CONFLICT (language_id, translation_key) DO NOTHING`,
        [languageId],
      );
      await client.query("COMMIT");
      return { language: await this.getLanguage(languageId) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("该语言代码已经存在。");
      }
      throw this.translateDatabaseError(error, "无法创建语言。");
    } finally {
      client.release();
    }
  }

  async update(idInput: string, input: unknown) {
    const id = this.id(idInput);
    const body = this.record(input);
    const changes: Array<[string, unknown]> = [];
    // 语言代码只改变用户端语言标识，翻译词条仍由语言 ID 关联。
    if (Object.hasOwn(body, "locale"))
      changes.push(["locale", this.locale(body.locale)]);
    if (Object.hasOwn(body, "name"))
      changes.push(["name", this.name(body.name)]);
    if (Object.hasOwn(body, "isEnabled")) {
      if (typeof body.isEnabled !== "boolean")
        throw new BadRequestException("isEnabled 必须为布尔值。");
      changes.push(["is_enabled", body.isEnabled]);
    }
    if (Object.hasOwn(body, "isDefault")) {
      if (typeof body.isDefault !== "boolean")
        throw new BadRequestException("isDefault 必须为布尔值。");
      changes.push(["is_default", body.isDefault]);
    }
    if (!changes.length)
      throw new BadRequestException("没有可更新的语言字段。");

    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      await this.lock(client);
      const current = await client.query<{
        locale: string;
        is_enabled: boolean;
        is_default: boolean;
      }>(
        "SELECT locale, is_enabled, is_default FROM user_languages WHERE id = $1 FOR UPDATE",
        [id],
      );
      const language = current.rows[0];
      if (!language) throw new NotFoundException("语言不存在。");
      const nextDefault =
        (changes.find(([key]) => key === "is_default")?.[1] as
          boolean | undefined) ?? language.is_default;
      const nextEnabled =
        (changes.find(([key]) => key === "is_enabled")?.[1] as
          boolean | undefined) ?? language.is_enabled;
      if (nextDefault && !nextEnabled) {
        throw new BadRequestException("默认语言必须保持启用。");
      }
      if (language.is_default && !nextDefault) {
        throw new ConflictException("请先将另一种已启用语言设为默认语言。");
      }
      if (language.is_default && !nextEnabled) {
        throw new ConflictException("默认语言不能停用。");
      }
      if (nextDefault && !language.is_default) {
        await client.query("UPDATE user_languages SET is_default = FALSE");
      }
      const values: unknown[] = [];
      const assignments = changes.map(([key, value]) => {
        values.push(value);
        return `${key} = $${values.length}`;
      });
      values.push(id);
      await client.query(
        `UPDATE user_languages
            SET ${assignments.join(", ")}, updated_at = NOW()
          WHERE id = $${values.length}`,
        values,
      );
      await client.query("COMMIT");
      return { language: await this.getLanguage(id) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("该语言代码已经存在。");
      }
      throw this.translateDatabaseError(error, "无法更新语言。");
    } finally {
      client.release();
    }
  }

  async remove(idInput: string) {
    const id = this.id(idInput);
    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      await this.lock(client);
      const current = await client.query<{ is_default: boolean }>(
        "SELECT is_default FROM user_languages WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!current.rows[0]) throw new NotFoundException("语言不存在。");
      if (current.rows[0].is_default) {
        throw new ConflictException("默认语言不能删除。");
      }
      await client.query("DELETE FROM user_languages WHERE id = $1", [id]);
      await client.query("COMMIT");
      return { deleted: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw this.translateDatabaseError(error, "无法删除语言。");
    } finally {
      client.release();
    }
  }

  async translations(idInput: string) {
    const id = this.id(idInput);
    const language = await this.getLanguage(id);
    const result = await this.databaseService.getPool().query<TranslationItem>(
      `SELECT translation.translation_key AS key,
              translation.translation_value AS value,
              (SELECT source.translation_value
                 FROM user_languages AS source_language
                 JOIN user_language_translations AS source
                   ON source.language_id = source_language.id
                WHERE source_language.is_default = TRUE
                  AND source.translation_key = translation.translation_key
                LIMIT 1) AS "sourceValue"
         FROM user_language_translations AS translation
        WHERE translation.language_id = $1
        ORDER BY translation.translation_key`,
      [id],
    );
    return { language, items: result.rows };
  }

  async previewAiTranslations(idInput: string, input: unknown) {
    const id = this.id(idInput);
    const body = this.record(input);
    const language = await this.getLanguage(id);
    if (language.isDefault) {
      throw new BadRequestException("默认语言是翻译源语言，不能翻译自身。");
    }
    const rows = await this.databaseService.getPool().query<{
      key: string;
      sourceValue: string | null;
      currentValue: string;
      sourceLocale: string;
    }>(
      `SELECT default_language.locale AS "sourceLocale",
              source.translation_key AS key,
              source.translation_value AS "sourceValue",
              COALESCE(target.translation_value, '') AS "currentValue"
         FROM user_languages AS default_language
         JOIN user_language_translations AS source
           ON source.language_id = default_language.id
         LEFT JOIN user_language_translations AS target
           ON target.language_id = $1
          AND target.translation_key = source.translation_key
        WHERE default_language.is_default = TRUE
        ORDER BY source.translation_key`,
      [id],
    );
    // 新语言的初始值复制自默认语言，因此仍相同或为空的值作为待翻译候选。
    const candidates = rows.rows.filter(
      (row) => !row.currentValue.trim() || row.currentValue === row.sourceValue,
    );
    let selected: typeof rows.rows;
    if (body.keys !== undefined) {
      if (
        !Array.isArray(body.keys) ||
        body.keys.length < 1 ||
        body.keys.length > 20
      ) {
        throw new BadRequestException("每次请选择 1 至 20 条翻译词条。");
      }
      const keys = body.keys.map((key) => this.translationKey(key));
      if (new Set(keys).size !== keys.length) {
        throw new BadRequestException("待翻译词条键不能重复。");
      }
      const byKey = new Map(rows.rows.map((row) => [row.key, row]));
      selected = keys.map((key) => {
        const row = byKey.get(key);
        if (!row?.sourceValue) {
          throw new BadRequestException(`找不到词条 ${key} 的默认语言文本。`);
        }
        return row;
      });
    } else {
      selected = candidates.slice(0, 20);
    }
    if (!selected.length) {
      return { pendingCount: 0, items: [] };
    }
    const translated = await this.aiModelConfigurationService.translateBatch({
      sourceLocale: selected[0]!.sourceLocale,
      targetLocale: language.locale,
      items: selected.map((row) => ({
        key: row.key,
        sourceValue: row.sourceValue,
      })),
    });
    const values = new Map(
      translated.translations.map((item) => [item.key, item.value]),
    );
    return {
      pendingCount: candidates.length,
      items: selected.map((row) => ({
        key: row.key,
        sourceValue: row.sourceValue,
        currentValue: row.currentValue,
        translatedValue: values.get(row.key) ?? "",
      })),
    };
  }

  async saveTranslations(idInput: string, input: unknown) {
    const id = this.id(idInput);
    const body = this.record(input);
    if (!Array.isArray(body.items) || body.items.length > 2000) {
      throw new BadRequestException("翻译词条列表无效或超过 2000 条。");
    }
    const items = body.items.map((raw) => {
      const item = this.record(raw);
      if (
        typeof item.key !== "string" ||
        !/^[\w.-]{1,128}$/.test(item.key) ||
        typeof item.value !== "string" ||
        item.value.length > 5000
      ) {
        throw new BadRequestException("翻译词条格式无效。");
      }
      return { key: item.key, value: item.value };
    });
    if (new Set(items.map((item) => item.key)).size !== items.length) {
      throw new BadRequestException("翻译词条键不能重复。");
    }
    const client = await this.databaseService.getPool().connect();
    try {
      await client.query("BEGIN");
      await this.lock(client);
      await this.assertLanguageExists(client, id);
      for (const item of items) {
        await client.query(
          `INSERT INTO user_language_translations
             (language_id, translation_key, translation_value)
           VALUES ($1, $2, $3)
           ON CONFLICT (language_id, translation_key) DO UPDATE
             SET translation_value = EXCLUDED.translation_value,
                 updated_at = NOW()`,
          [id, item.key, item.value],
        );
      }
      await client.query("COMMIT");
      return this.translations(id);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw this.translateDatabaseError(error, "无法保存翻译词条。");
    } finally {
      client.release();
    }
  }

  async removeTranslation(idInput: string, keyInput: string) {
    const id = this.id(idInput);
    const key = this.translationKey(keyInput);
    await this.assertLanguageExists(this.databaseService.getPool(), id);
    await this.databaseService
      .getPool()
      .query(
        "DELETE FROM user_language_translations WHERE language_id = $1 AND translation_key = $2",
        [id, key],
      );
    return { deleted: true };
  }

  async publicLanguages() {
    const result = await this.databaseService.getPool().query<{
      locale: string;
      name: string;
      isDefault: boolean;
    }>(
      `SELECT locale, name, is_default AS "isDefault"
         FROM user_languages
        WHERE is_enabled = TRUE
        ORDER BY sort_order, locale`,
    );
    const languages = result.rows;
    const defaultLocale = languages.find(
      (language) => language.isDefault,
    )?.locale;
    if (!defaultLocale) {
      throw new ServiceUnavailableException("没有启用的用户端默认语言。");
    }
    return { defaultLocale, languages };
  }

  async publicTranslations(localeInput: string) {
    const locale = this.locale(localeInput);
    const result = await this.databaseService.getPool().query<{
      translation_key: string;
      translation_value: string;
    }>(
      `SELECT translation.translation_key, translation.translation_value
         FROM user_languages AS language
         JOIN user_language_translations AS translation
           ON translation.language_id = language.id
        WHERE language.locale = $1 AND language.is_enabled = TRUE`,
      [locale],
    );
    if (!result.rowCount) {
      const language = await this.databaseService
        .getPool()
        .query(
          "SELECT 1 FROM user_languages WHERE locale = $1 AND is_enabled = TRUE",
          [locale],
        );
      if (!language.rowCount)
        throw new NotFoundException("语言不存在或未启用。");
    }
    return Object.fromEntries(
      result.rows.map((row) => [row.translation_key, row.translation_value]),
    );
  }

  private async getLanguage(id: string) {
    const result = await this.databaseService.getPool().query<UserLanguage>(
      `SELECT language.id::text, language.locale, language.name,
              language.is_enabled AS "isEnabled",
              language.is_default AS "isDefault",
              language.sort_order AS "sortOrder",
              COUNT(translation.translation_key)::int AS "translationCount"
         FROM user_languages AS language
         LEFT JOIN user_language_translations AS translation
           ON translation.language_id = language.id
        WHERE language.id = $1
        GROUP BY language.id`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException("语言不存在。");
    return result.rows[0];
  }

  private async assertLanguageExists(client: Pool | PoolClient, id: string) {
    const result = await client.query(
      "SELECT 1 FROM user_languages WHERE id = $1",
      [id],
    );
    if (!result.rowCount) throw new NotFoundException("语言不存在。");
  }

  private async lock(client: PoolClient) {
    await client.query("SELECT pg_advisory_xact_lock(4102, 7)");
  }

  private id(input: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input,
      )
    ) {
      throw new BadRequestException("语言 ID 无效。");
    }
    return input;
  }

  private locale(input: unknown) {
    if (
      typeof input !== "string" ||
      !/^[a-z]{2,3}(-[A-Z]{2,4})?$/.test(input)
    ) {
      throw new BadRequestException("语言代码格式无效，例如 zh-CN 或 en-US。");
    }
    return input;
  }

  private name(input: unknown) {
    if (
      typeof input !== "string" ||
      !input.trim() ||
      input.trim().length > 64
    ) {
      throw new BadRequestException("语言名称必须为 1 到 64 个字符。");
    }
    return input.trim();
  }

  private translationKey(input: string) {
    if (!/^[\w.-]{1,128}$/.test(input)) {
      throw new BadRequestException("翻译词条键格式无效。");
    }
    return input;
  }

  private record(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("请求内容格式无效。");
    }
    return input as Record<string, unknown>;
  }

  private isUniqueViolation(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
    );
  }

  private translateDatabaseError(error: unknown, message: string) {
    if (
      error instanceof NotFoundException ||
      error instanceof ConflictException ||
      error instanceof BadRequestException
    )
      return error;
    return new ServiceUnavailableException(message);
  }
}
