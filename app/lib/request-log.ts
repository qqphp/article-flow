import { promises as fs } from "fs";
import path from "path";

export type RequestLog = {
  id: string;
  timestamp: string;
  type: "text" | "image";
  operation: string;
  endpoint: string;
  model: string;
  requestBody: unknown;
};

const logFile = path.join(process.cwd(), "tmp", "request-logs.json");

export async function appendRequestLog(log: Omit<RequestLog, "id" | "timestamp">) {
  try {
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    let logs: RequestLog[] = [];
    try {
      logs = JSON.parse(await fs.readFile(logFile, "utf8"));
    } catch {
      logs = [];
    }
    logs.unshift({ ...log, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString() });
    await fs.writeFile(logFile, JSON.stringify(logs.slice(0, 1000), null, 2), "utf8");
  } catch {
    // Logging must not interrupt an AI request.
  }
}

export async function readRequestLogs() {
  try {
    return JSON.parse(await fs.readFile(logFile, "utf8")) as RequestLog[];
  } catch {
    return [] as RequestLog[];
  }
}
