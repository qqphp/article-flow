import { getDatabase } from "./database";
import { REQUEST_LOG_PAGE_SIZE, resolvePage } from "./pagination";

export type RequestLog = {
  id: string;
  timestamp: string;
  type: "text" | "image";
  operation: string;
  endpoint: string;
  model: string;
  requestBody: unknown;
};

const REQUEST_LOG_KEEP = 1000;
const REQUEST_LOG_PRUNE_SLACK = 100;
const REQUEST_LOG_PRUNE_EVERY = 50;
const MAX_JSON_CHARS = 8000;
const MAX_STRING_CHARS = 500;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_DEPTH = 8;

let insertsSincePrune = REQUEST_LOG_PRUNE_EVERY;

function summarizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_OBJECT_DEPTH) return "[…]";
  if (typeof value === "string") {
    return value.length > MAX_STRING_CHARS ? `${value.slice(0, MAX_STRING_CHARS)}…(共 ${value.length} 字)` : value;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => summarizeValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`…另有 ${value.length - MAX_ARRAY_ITEMS} 项`);
    return items;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, summarizeValue(item, depth + 1)]));
  }
  return value;
}

function serializeRequestBody(requestBody: unknown) {
  let json = "";
  try {
    json = JSON.stringify(summarizeValue(requestBody, 0) ?? null);
  } catch {
    json = "\"[无法序列化的请求内容]\"";
  }
  if (json.length <= MAX_JSON_CHARS) return json;
  return JSON.stringify({
    truncated: true,
    chars: json.length,
    preview: json.slice(0, MAX_JSON_CHARS),
  });
}

function parseRequestBody(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function pruneRequestLogs(database: ReturnType<typeof getDatabase>) {
  if (++insertsSincePrune < REQUEST_LOG_PRUNE_EVERY) return;
  insertsSincePrune = 0;
  const count = Number((database.prepare("SELECT COUNT(*) AS count FROM request_logs").get() as { count: number }).count || 0);
  const extra = count - REQUEST_LOG_KEEP;
  if (extra <= REQUEST_LOG_PRUNE_SLACK) return;
  database.prepare(`
    DELETE FROM request_logs WHERE id IN (
      SELECT id FROM request_logs ORDER BY timestamp ASC LIMIT ?
    )
  `).run(extra);
}

export async function appendRequestLog(log: Omit<RequestLog, "id" | "timestamp">) {
  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();
    const database = getDatabase();
    database.prepare(`INSERT INTO request_logs (id, timestamp, type, operation, endpoint, model, request_body)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, timestamp, log.type, log.operation, log.endpoint, log.model, serializeRequestBody(log.requestBody));
    pruneRequestLogs(database);
  } catch {
    // Logging must not interrupt an AI request.
  }
}

export async function readRequestLogs(input: { page?: unknown; pageSize?: unknown; type?: string; query?: string } = {}) {
  const database = getDatabase();
  const filters: string[] = [];
  const values: Array<string> = [];
  if (input.type === "text" || input.type === "image") {
    filters.push("type = ?");
    values.push(input.type);
  }
  const query = input.query?.trim();
  if (query) {
    filters.push("(operation LIKE ? OR model LIKE ? OR endpoint LIKE ?)");
    const like = `%${query}%`;
    values.push(like, like, like);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const total = Number((database.prepare(`SELECT COUNT(*) AS count FROM request_logs ${where}`).get(...values) as { count: number }).count || 0);
  const pageSize = Number(input.pageSize);
  const paging = resolvePage(input.page, Number.isFinite(pageSize) ? pageSize : REQUEST_LOG_PAGE_SIZE, total);
  const records = database.prepare(`SELECT * FROM request_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...values, paging.pageSize, paging.offset) as Array<Record<string, string>>;
  return {
    logs: records.map((record) => ({
      id: record.id,
      timestamp: record.timestamp,
      type: record.type as RequestLog["type"],
      operation: record.operation,
      endpoint: record.endpoint,
      model: record.model,
      requestBody: parseRequestBody(record.request_body),
    })),
    ...paging,
  };
}

export async function clearRequestLogs() {
  const database = getDatabase();
  insertsSincePrune = REQUEST_LOG_PRUNE_EVERY;
  return database.prepare("DELETE FROM request_logs").run().changes;
}
