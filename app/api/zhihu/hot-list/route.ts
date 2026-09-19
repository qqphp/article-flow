import { NextResponse } from "next/server";
import { appendRequestLog } from "../../../lib/request-log";
import { clamp, fetchZhihuHotList, resolveZhihuSecret, ZHIHU_ENDPOINTS, zhihuErrorPayload } from "../../../lib/zhihu";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { limit?: number; config?: { zhihuAccessSecret?: string } };
  const secret = resolveZhihuSecret(body.config);
  if (!secret) return NextResponse.json({ error: "请先在配置中心填写知乎数据 Access Secret" }, { status: 400 });
  const limit = clamp(body.limit, 1, 30, 30);
  await appendRequestLog({ type: "text", operation: "知乎热榜", endpoint: ZHIHU_ENDPOINTS.hotList, model: "zhihu", requestBody: { limit } });
  try {
    return NextResponse.json(await fetchZhihuHotList(secret, limit));
  } catch (error) {
    const payload = zhihuErrorPayload(error);
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
}
