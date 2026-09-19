import { getDatabase } from "./database";

export const CONFIG_KEYS = [
  "textBase",
  "textKey",
  "textModel",
  "imageUrl",
  "imageKey",
  "imageModel",
  "firecrawlKey",
  "zhihuAccessSecret",
  "wechatAppId",
  "wechatSecret",
  "wechatAuthor",
  "wechatAutoPublish",
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type AppConfig = Record<ConfigKey, string>;

const SECRET_CONFIG_KEYS = [
  "textKey",
  "imageKey",
  "firecrawlKey",
  "zhihuAccessSecret",
  "wechatSecret",
] as const;
const secretConfigKeySet = new Set<ConfigKey>(SECRET_CONFIG_KEYS);

const ENV_FALLBACKS: Record<ConfigKey, string[]> = {
  textBase: ["AI_BASE_URL", "OPENAI_BASE_URL"],
  textKey: ["AI_API_KEY", "OPENAI_API_KEY"],
  textModel: ["AI_TEXT_MODEL"],
  imageUrl: ["AI_IMAGE_URL"],
  imageKey: ["AI_API_KEY", "OPENAI_API_KEY"],
  imageModel: ["AI_IMAGE_MODEL"],
  firecrawlKey: ["FIRECRAWL_API_KEY"],
  zhihuAccessSecret: ["ZHIHU_ACCESS_SECRET"],
  wechatAppId: ["WECHAT_APPID"],
  wechatSecret: ["WECHAT_SECRET"],
  wechatAuthor: ["WECHAT_AUTHOR"],
  wechatAutoPublish: ["WECHAT_AUTO_PUBLISH"],
};

type ConfigRow = { key: ConfigKey; value: string };

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function storedValues() {
  const rows = getDatabase().prepare("SELECT key, value FROM app_config").all() as ConfigRow[];
  return new Map(rows.filter((row) => CONFIG_KEYS.includes(row.key) && Boolean(asString(row.value))).map((row) => [row.key, asString(row.value)]));
}

export function getAppConfig(): AppConfig {
  const stored = storedValues();
  return Object.fromEntries(CONFIG_KEYS.map((key) => {
    const value = stored.get(key);
    if (value) return [key, value];
    return [key, ENV_FALLBACKS[key].map((envKey) => asString(process.env[envKey])).find(Boolean) || ""];
  })) as AppConfig;
}

export function getSafeAppConfig() {
  const config = getAppConfig();
  const values = {
    textBase: config.textBase,
    textModel: config.textModel,
    imageUrl: config.imageUrl,
    imageModel: config.imageModel,
    wechatAppId: config.wechatAppId,
    wechatAuthor: config.wechatAuthor,
    wechatAutoPublish: config.wechatAutoPublish,
  };
  const configured = Object.fromEntries(SECRET_CONFIG_KEYS.map((key) => [key, Boolean(config[key])])) as Record<ConfigKey, boolean>;
  return { values, configured, storedKeys: Array.from(storedValues().keys()) };
}

export function updateAppConfig(values: unknown, options?: { onlyMissing?: boolean }) {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("配置内容无效");
  const entries = Object.entries(values as Record<string, unknown>);
  const invalidKeys = entries.map(([key]) => key).filter((key) => !CONFIG_KEYS.includes(key as ConfigKey));
  if (invalidKeys.length) throw new Error(`不支持的配置项：${invalidKeys.join("、")}`);
  if (entries.some(([, value]) => typeof value !== "string")) throw new Error("配置值必须为字符串");

  const stored = storedValues();
  const database = getDatabase();
  const upsert = database.prepare("INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at");
  const remove = database.prepare("DELETE FROM app_config WHERE key = ?");
  const now = new Date().toISOString();
  const updated: ConfigKey[] = [];
  const skipped: ConfigKey[] = [];

  const transaction = database.transaction(() => {
    for (const [rawKey, rawValue] of entries) {
      const key = rawKey as ConfigKey;
      const value = asString(rawValue);
      if (options?.onlyMissing && stored.has(key)) {
        skipped.push(key);
        continue;
      }
      if (secretConfigKeySet.has(key) && !value) {
        skipped.push(key);
        continue;
      }
      if (!value) {
        remove.run(key);
      } else {
        upsert.run(key, value, now);
      }
      updated.push(key);
    }
  });
  transaction();
  return { updated, skipped };
}
