import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const globalForDatabase = globalThis as unknown as { articleFlowDatabase?: Database.Database };
export function getDatabase() {
  if (globalForDatabase.articleFlowDatabase) return globalForDatabase.articleFlowDatabase;
  const dataDirectory = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDirectory, { recursive: true });
  const database = new Database(path.join(dataDirectory, "article-flow.sqlite"), { timeout: 5000 });
  database.pragma("busy_timeout = 5000");
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
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS articles_created_at_idx ON articles(created_at DESC);
  `);
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
  ] as const;
  for (const [column, sql] of migrations) {
    if (!articleColumns.has(column)) database.exec(sql);
  }
  globalForDatabase.articleFlowDatabase = database;
  return database;
}
