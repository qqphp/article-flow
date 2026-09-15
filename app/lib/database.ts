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
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS articles_created_at_idx ON articles(created_at DESC);
  `);
  globalForDatabase.articleFlowDatabase = database;
  return database;
}
