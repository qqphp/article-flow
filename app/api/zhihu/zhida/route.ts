import { NextResponse } from "next/server";
import { appendRequestLog } from "../../../lib/request-log";
import { parseZhidaResponse, resolveZhihuSecret, ZHIHU_ENDPOINTS, zhidaChat, zhihuErrorPayload } from "../../../lib/zhihu";

export const dynamic = "force-dynamic";

const MODELS = new Set(["zhida-fast-1p5", "zhida-thinking-1p5", "zhida-agent"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    model?: string;
    messages?: Array<{ role?: string; content?: string }>;
    stream?: boolean;
    config?: { zhihuAccessSecret?: string };
  };
  const secret = resolveZhihuSecret(body.config);
  if (!secret) return NextResponse.json({ error: "请先在配置中心填写知乎数据 Access Secret" }, { status: 400 });
  const model = body.model?.trim() || "";
  if (!MODELS.has(model)) return NextResponse.json({ error: "请选择有效的直答模型" }, { status: 400 });
  const messages = (body.messages || [])
    .map((message) => ({ role: String(message.role || "").trim(), content: String(message.content || "").trim() }))
    .filter((message) => message.role && message.content);
  if (!messages.length) return NextResponse.json({ error: "请输入问题" }, { status: 400 });
  const stream = body.stream !== false;
  await appendRequestLog({
    type: "text",
    operation: "知乎直答",
    endpoint: ZHIHU_ENDPOINTS.zhida,
    model,
    requestBody: { model, stream, messages },
  });
  try {
    const upstream = await zhidaChat({ secret, model, messages, stream });
    if (stream && upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }
    return NextResponse.json(await parseZhidaResponse(upstream));
  } catch (error) {
    const payload = zhihuErrorPayload(error);
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
}
