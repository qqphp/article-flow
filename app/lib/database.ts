import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const globalForDatabase = globalThis as unknown as { articleFlowDatabase?: Database.Database };
let articleColumnsMigrated = false;
let dataPathsMigrated = false;

export function getDataDirectory() {
  return path.join(process.cwd(), "data");
}

function dataRoot() {
  return path.resolve(getDataDirectory());
}

function asPosixRelative(relativePath: string) {
  return relativePath.split(path.sep).join("/");
}

export function relativizeStoredPath(stored: string | null | undefined) {
  if (!stored) return stored ?? null;
  const root = dataRoot();
  const resolved = path.isAbsolute(stored)
    ? path.normalize(stored)
    : path.resolve(root, stored.split(/[\\/]/).join(path.sep));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return stored;
  return asPosixRelative(relative);
}

export function toStoredDataPath(absolutePath: string) {
  const stored = relativizeStoredPath(absolutePath);
  if (!stored || path.isAbsolute(stored) || stored.includes("..")) throw new Error("路径不在 data 目录内");
  return stored;
}

export function resolveDataPath(stored: string | null | undefined) {
  if (!stored) return null;
  const root = dataRoot();
  const resolved = path.isAbsolute(stored)
    ? path.normalize(stored)
    : path.resolve(root, stored.split(/[\\/]/).join(path.sep));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

function relativizeParagraphImagePlans(raw: string | null | undefined) {
  if (!raw) return raw ?? "[]";
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return raw;
    let changed = false;
    const next = parsed.map((item) => {
      if (!item || typeof item !== "object" || typeof (item as { filePath?: unknown }).filePath !== "string") return item;
      const filePath = relativizeStoredPath((item as { filePath: string }).filePath);
      if (filePath === (item as { filePath: string }).filePath) return item;
      changed = true;
      return { ...item, filePath };
    });
    return changed ? JSON.stringify(next) : raw;
  } catch {
    return raw;
  }
}

function migrateStoredDataPaths(database: Database.Database) {
  if (dataPathsMigrated) return;
  const articles = database.prepare(`
    SELECT id, directory, markdown_path, sources_path, cover_path, humanized_markdown_path, layout_markdown_path, paragraph_image_plans
    FROM articles
  `).all() as Array<{
    id: string;
    directory: string;
    markdown_path: string;
    sources_path: string;
    cover_path: string | null;
    humanized_markdown_path: string | null;
    layout_markdown_path: string | null;
    paragraph_image_plans: string | null;
  }>;
  const updateArticle = database.prepare(`
    UPDATE articles
    SET directory = ?, markdown_path = ?, sources_path = ?, cover_path = ?,
        humanized_markdown_path = ?, layout_markdown_path = ?, paragraph_image_plans = ?
    WHERE id = ?
  `);
  const materials = database.prepare("SELECT id, storage_path FROM material_assets").all() as Array<{ id: string; storage_path: string }>;
  const updateMaterial = database.prepare("UPDATE material_assets SET storage_path = ? WHERE id = ?");
  database.transaction(() => {
    for (const article of articles) {
      const directory = relativizeStoredPath(article.directory) || article.directory;
      const markdownPath = relativizeStoredPath(article.markdown_path) || article.markdown_path;
      const sourcesPath = relativizeStoredPath(article.sources_path) || article.sources_path;
      const coverPath = relativizeStoredPath(article.cover_path);
      const humanizedPath = relativizeStoredPath(article.humanized_markdown_path);
      const layoutPath = relativizeStoredPath(article.layout_markdown_path);
      const plans = relativizeParagraphImagePlans(article.paragraph_image_plans);
      if (
        directory === article.directory
        && markdownPath === article.markdown_path
        && sourcesPath === article.sources_path
        && coverPath === article.cover_path
        && humanizedPath === article.humanized_markdown_path
        && layoutPath === article.layout_markdown_path
        && plans === article.paragraph_image_plans
      ) continue;
      updateArticle.run(directory, markdownPath, sourcesPath, coverPath, humanizedPath, layoutPath, plans, article.id);
    }
    for (const material of materials) {
      const storagePath = relativizeStoredPath(material.storage_path);
      if (!storagePath || storagePath === material.storage_path) continue;
      updateMaterial.run(storagePath, material.id);
    }
  })();
  dataPathsMigrated = true;
}

function configureDatabase(database: Database.Database) {
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
  migrateArticleColumns(database);
  migrateStoredDataPaths(database);
}

function migrateArticleColumns(database: Database.Database) {
  if (articleColumnsMigrated) return;
  const articleColumns = new Set((database.prepare("PRAGMA table_info(articles)").all() as Array<{ name: string }>).map((column) => column.name));
  const migrations = [
    ["humanized_markdown_path", "ALTER TABLE articles ADD COLUMN humanized_markdown_path TEXT"],
    ["layout_markdown_path", "ALTER TABLE articles ADD COLUMN layout_markdown_path TEXT"],
    ["cover_image_url", "ALTER TABLE articles ADD COLUMN cover_image_url TEXT"],
    ["cover_prompt", "ALTER TABLE articles ADD COLUMN cover_prompt TEXT"],
    ["cover_error", "ALTER TABLE articles ADD COLUMN cover_error TEXT"],
    ["paragraph_image_urls", "ALTER TABLE articles ADD COLUMN paragraph_image_urls TEXT NOT NULL DEFAULT '[]'"],
    ["paragraph_image_plans", "ALTER TABLE articles ADD COLUMN paragraph_image_plans TEXT NOT NULL DEFAULT '[]'"],
    ["alternative_titles", "ALTER TABLE articles ADD COLUMN alternative_titles TEXT NOT NULL DEFAULT '[]'"],
    ["publish_status", "ALTER TABLE articles ADD COLUMN publish_status TEXT NOT NULL DEFAULT '未发布'"],
    ["published_at", "ALTER TABLE articles ADD COLUMN published_at TEXT"],
    ["wechat_draft_media_id", "ALTER TABLE articles ADD COLUMN wechat_draft_media_id TEXT"],
    ["word_count", "ALTER TABLE articles ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0"],
    ["selected_title", "ALTER TABLE articles ADD COLUMN selected_title TEXT"],
  ] as const;
  for (const [column, sql] of migrations) {
    if (!articleColumns.has(column)) database.exec(sql);
  }
  if (!articleColumns.has("publish_status")) {
    database.prepare("UPDATE articles SET publish_status = '未发布', published_at = NULL").run();
  }
  articleColumnsMigrated = true;
}

export function getDatabase() {
  if (globalForDatabase.articleFlowDatabase) {
    configureDatabase(globalForDatabase.articleFlowDatabase);
    return globalForDatabase.articleFlowDatabase;
  }
  const dataDirectory = getDataDirectory();
  fs.mkdirSync(dataDirectory, { recursive: true });
  const database = new Database(path.join(dataDirectory, "article-flow.sqlite"), { timeout: 5000 });
  database.exec(`
  CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    operation TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    model TEXT NOT NULL,
    request_body TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS request_logs_timestamp_idx ON request_logs(timestamp DESC);
  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    style TEXT NOT NULL,
    directory TEXT NOT NULL,
    markdown_path TEXT NOT NULL,
    sources_path TEXT NOT NULL,
    cover_path TEXT,
    humanized_markdown_path TEXT,
    layout_markdown_path TEXT,
    cover_image_url TEXT,
    cover_prompt TEXT,
    cover_error TEXT,
    paragraph_image_urls TEXT NOT NULL DEFAULT '[]',
    paragraph_image_plans TEXT NOT NULL DEFAULT '[]',
    alternative_titles TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    publish_status TEXT NOT NULL DEFAULT '未发布',
    published_at TEXT,
    wechat_draft_media_id TEXT,
    word_count INTEGER NOT NULL DEFAULT 0,
    selected_title TEXT
  );
  CREATE INDEX IF NOT EXISTS articles_created_at_idx ON articles(created_at DESC);
  CREATE TABLE IF NOT EXISTS material_assets (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    storage_filename TEXT NOT NULL UNIQUE,
    material_type TEXT NOT NULL CHECK(material_type IN ('cover', 'paragraph', 'ai')),
    size_bytes INTEGER NOT NULL,
    format TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS material_assets_created_at_idx ON material_assets(created_at DESC);
  CREATE INDEX IF NOT EXISTS material_assets_type_idx ON material_assets(material_type, created_at DESC);
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS zhihu_hot_list_cache (
    limit_count INTEGER PRIMARY KEY,
    total INTEGER NOT NULL,
    items_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS zhihu_hot_list_cache_fetched_at_idx ON zhihu_hot_list_cache(fetched_at DESC);
  `);
  configureDatabase(database);
  globalForDatabase.articleFlowDatabase = database;
  return database;
}
