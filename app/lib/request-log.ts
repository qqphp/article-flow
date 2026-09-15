import { getDatabase } from "./database";

export type RequestLog = {
  id: string;
  timestamp: string;
  type: "text" | "image";
  operation: string;
  endpoint: string;
  model: string;
  requestBody: unknown;
};

export async function appendRequestLog(log: Omit<RequestLog, "id" | "timestamp">) {
  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();
    const database = getDatabase();
    database.prepare(`INSERT INTO request_logs (id, timestamp, type, operation, endpoint, model, request_body)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, timestamp, log.type, log.operation, log.endpoint, log.model, JSON.stringify(log.requestBody));
    database.prepare(`DELETE FROM request_logs WHERE id NOT IN (
      SELECT id FROM request_logs ORDER BY timestamp DESC LIMIT 1000
    )`).run();
  } catch {
    // Logging must not interrupt an AI request.
  }
}

export async function readRequestLogs() {
  const database = getDatabase();
  const records = database.prepare("SELECT * FROM request_logs ORDER BY timestamp DESC LIMIT 1000").all() as Array<Record<string, string>>;
  return records.map((record) => ({
    id: record.id,
    timestamp: record.timestamp,
    type: record.type as RequestLog["type"],
    operation: record.operation,
    endpoint: record.endpoint,
    model: record.model,
    requestBody: JSON.parse(record.request_body),
  }));
}
