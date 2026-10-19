import { createRequire } from "node:module";

if (process.version !== "v24.21.0") {
  console.error(`article-flow requires Node.js v24.21.0; current version is ${process.version}.`);
  process.exit(1);
}

const require = createRequire(import.meta.url);
let database;

try {
  const Database = require("better-sqlite3");
  database = new Database(":memory:");
  const { version } = database.prepare("SELECT sqlite_version() AS version").get();
  console.log(`Runtime OK: Node.js ${process.version}, SQLite ${version}`);
} catch (error) {
  console.error("better-sqlite3 cannot load under Node.js v24.21.0. Run npm ci using Node.js v24.21.0.");
  console.error(error);
  process.exitCode = 1;
} finally {
  database?.close();
}
