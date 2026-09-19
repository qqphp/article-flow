import { NextResponse } from "next/server";
import { appendRequestLog } from "../../lib/request-log";
import { modelFetch } from "../../lib/model-fetch";
import { getAppConfig } from "../../lib/config-store";

type ModelsBody = { type?: "text" | "image"; baseUrl?: string; apiKey?: string };

function modelsEndpoint(baseUrl: string, type: "text" | "image") {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (type === "image") return `${trimmed.replace(/\/images\/generations$/, "")}/models`;
  return `${trimmed}/models`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ModelsBody;
  const type = body.type === "image" ? "image" : "text";
  const config = getAppConfig();
  const apiKey = body.apiKey?.trim() || (type === "image" ? config.imageKey : config.textKey);
  const baseUrl = body.baseUrl?.trim() || (type === "image" ? config.imageUrl || config.textBase : config.textBase);
  if (!baseUrl || !apiKey) return NextResponse.json({ error: "请先填写接口地址和 API Key" }, { status: 400 });
  const endpoint = modelsEndpoint(baseUrl, type);
  await appendRequestLog({ type, operation: "获取可用模型", endpoint, model: "-", requestBody: { method: "GET" } });
  try {
    const response = await modelFetch(endpoint, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) return NextResponse.json({ error: `获取模型失败（${response.status}）` }, { status: response.status });
    const payload = await response.json();
    const items = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : Array.isArray(payload) ? payload : [];
    const models = Array.from(new Set(items.map((item: unknown) => typeof item === "string" ? item : (item as { id?: string; name?: string; model?: string }).id || (item as { name?: string }).name || (item as { model?: string }).model).filter(Boolean))) as string[];
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ error: "无法连接模型服务，请检查地址、密钥和网络" }, { status: 502 });
  }
}
