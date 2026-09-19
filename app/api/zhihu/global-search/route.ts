import { NextResponse } from "next/server";
import { appendRequestLog } from "../../../lib/request-log";
import { clamp, fetchZhihuGlobalSearch, resolveZhihuSecret, ZHIHU_ENDPOINTS, zhihuErrorPayload } from "../../../lib/zhihu";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    query?: string;
    count?: number;
    searchDB?: string;
    filter?: string;
  };
  const secret = resolveZhihuSecret();
  if (!secret) return NextResponse.json({ error: "请先在配置中心填写知乎数据 Access Secret" }, { status: 400 });
  const query = body.query?.trim();
  if (!query) return NextResponse.json({ error: "请输入搜索关键词" }, { status: 400 });
  const searchDB = ["all", "realtime", "static"].includes(body.searchDB || "") ? body.searchDB : "all";
  const count = clamp(body.count, 1, 20, 10);
  const filter = body.filter?.trim();
  await appendRequestLog({
    type: "text",
    operation: "知乎全网搜索",
    endpoint: ZHIHU_ENDPOINTS.globalSearch,
    model: "zhihu",
    requestBody: { query, count, searchDB, filter: filter || undefined },
  });
  try {
    return NextResponse.json(await fetchZhihuGlobalSearch(secret, { query, count, searchDB, filter }));
  } catch (error) {
    const payload = zhihuErrorPayload(error);
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
}
