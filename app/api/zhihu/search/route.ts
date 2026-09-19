import { NextResponse } from "next/server";
import { appendRequestLog } from "../../../lib/request-log";
import { clamp, fetchZhihuSearch, resolveZhihuSecret, ZHIHU_ENDPOINTS, zhihuErrorPayload } from "../../../lib/zhihu";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    query?: string;
    count?: number;
    sortBy?: string;
    config?: { zhihuAccessSecret?: string };
  };
  const secret = resolveZhihuSecret(body.config);
  if (!secret) return NextResponse.json({ error: "请先在配置中心填写知乎数据 Access Secret" }, { status: 400 });
  const query = body.query?.trim();
  if (!query) return NextResponse.json({ error: "请输入搜索关键词" }, { status: 400 });
  const count = clamp(body.count, 1, 10, 10);
  const sortBy = body.sortBy?.trim();
  await appendRequestLog({
    type: "text",
    operation: "知乎搜索",
    endpoint: ZHIHU_ENDPOINTS.zhihuSearch,
    model: "zhihu",
    requestBody: { query, count, sortBy: sortBy || undefined },
  });
  try {
    return NextResponse.json(await fetchZhihuSearch(secret, { query, count, sortBy }));
  } catch (error) {
    const payload = zhihuErrorPayload(error);
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
}
