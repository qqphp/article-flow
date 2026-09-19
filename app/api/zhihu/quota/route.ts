import { NextResponse } from "next/server";
import { appendRequestLog } from "../../../lib/request-log";
import { fetchZhihuQuota, resolveZhihuSecret, ZHIHU_ENDPOINTS, zhihuErrorPayload } from "../../../lib/zhihu";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { apiIds?: string; config?: { zhihuAccessSecret?: string } };
  const secret = resolveZhihuSecret(body.config);
  if (!secret) return NextResponse.json({ error: "请先在配置中心填写知乎数据 Access Secret" }, { status: 400 });
  await appendRequestLog({ type: "text", operation: "知乎额度", endpoint: ZHIHU_ENDPOINTS.quota, model: "zhihu", requestBody: { apiIds: body.apiIds || "all" } });
  try {
    const items = await fetchZhihuQuota(secret, body.apiIds?.trim());
    return NextResponse.json({ items });
  } catch (error) {
    const payload = zhihuErrorPayload(error);
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
}
