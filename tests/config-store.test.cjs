const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const Database = require("better-sqlite3");
const ts = require("typescript");

test("model keys use database values or their own .env.local entries only", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/lib/config-store.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const database = new Database(":memory:");
  database.exec("CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)");
  const configModule = { exports: {} };
  new Function("require", "exports", "module", compiled)(
    (id) => id === "./database" ? { getDatabase: () => database } : require(id),
    configModule.exports,
    configModule,
  );
  const { getAppConfig, getSafeAppConfig, updateAppConfig } = configModule.exports;
  const originalDirectory = process.cwd();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "article-flow-config-"));
  const envKeys = ["AI_API_KEY", "AI_IMAGE_API_KEY", "OPENAI_API_KEY", "AI_BASE_URL"];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const localEnvPath = path.join(directory, ".env.local");

  try {
    process.chdir(directory);
    process.env.AI_API_KEY = "system-text-key";
    process.env.AI_IMAGE_API_KEY = "system-image-key";
    process.env.OPENAI_API_KEY = "system-legacy-key";
    process.env.AI_BASE_URL = "https://example.com/v1";
    fs.writeFileSync(".env", "AI_API_KEY=other-text\nAI_IMAGE_API_KEY=other-image\n");
    fs.writeFileSync(".env.production", "AI_API_KEY=prod-text\nAI_IMAGE_API_KEY=prod-image\n");
    assert.equal(getAppConfig().textKey, "", "ignore system env and other env files");
    assert.equal(getAppConfig().imageKey, "");
    assert.equal(getAppConfig().textBase, "https://example.com/v1", "other config keeps env support");

    fs.writeFileSync(localEnvPath, 'AI_API_KEY=" local-text-key "\nOPENAI_API_KEY=local-legacy-key\n');
    assert.equal(getAppConfig().textKey, "local-text-key");
    assert.equal(getAppConfig().imageKey, "", "image key cannot fall back to text or legacy key");

    fs.writeFileSync(localEnvPath, "AI_IMAGE_API_KEY=local-image-key\nOPENAI_API_KEY=local-legacy-key\n");
    assert.equal(getAppConfig().textKey, "", "text key cannot fall back to image or legacy key");
    assert.equal(getAppConfig().imageKey, "local-image-key");

    fs.writeFileSync(localEnvPath, "AI_API_KEY=local-text-key\nAI_IMAGE_API_KEY=local-image-key\n");
    updateAppConfig({ textKey: "saved-text-key", imageKey: "saved-image-key" });
    assert.equal(getAppConfig().textKey, "saved-text-key", "database takes priority");
    assert.equal(getAppConfig().imageKey, "saved-image-key");
    updateAppConfig({ textKey: "", imageKey: "" });
    assert.equal(getAppConfig().textKey, "saved-text-key", "blank form fields preserve saved keys");
    assert.equal(getAppConfig().imageKey, "saved-image-key");
    const safe = getSafeAppConfig();
    assert.equal(safe.configured.textKey, true);
    assert.equal(safe.configured.imageKey, true);
    assert.equal("textKey" in safe.values, false);
    assert.equal("imageKey" in safe.values, false);
    assert.equal(JSON.stringify(safe).includes("saved-text-key"), false);
    assert.equal(JSON.stringify(safe).includes("saved-image-key"), false);

    database.exec("DELETE FROM app_config");
    fs.writeFileSync(localEnvPath, 'AI_API_KEY=" "\nAI_IMAGE_API_KEY=\n');
    assert.equal(getAppConfig().textKey, "", "empty local keys do not use system keys");
    assert.equal(getAppConfig().imageKey, "");
  } finally {
    process.chdir(originalDirectory);
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
