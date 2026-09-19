import { NextResponse } from "next/server";
import { appendRequestLog } from "../../../lib/request-log";
import {
  HOT_LIST_CACHE_TTL_MS,
  isZhihuHotListCacheFresh,
  readZhihuHotListCache,
  writeZhihuHotListCache,
} from "../../../lib/zhihu-hot-list-store";
import { clamp, fetchZhihuHotList, resolveZhihuSecret, ZHIHU_ENDPOINTS, zhihuErrorPayload } from "../../../lib/zhihu";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    limit?: number;
    force?: boolean;
  };
  const secret = resolveZhihuSecret();
  if (!secret) return NextResponse.json({ error: "请先在配置中心填写知乎数据 Access Secret" }, { status: 400 });
  const limit = clamp(body.limit, 1, 30, 30);
  const force = Boolean(body.force);
  const cached = readZhihuHotListCache(limit);

  if (!force && cached && isZhihuHotListCacheFresh(cached.fetchedAt)) {
    return NextResponse.json({
      total: cached.total,
      items: cached.items,
      fetchedAt: cached.fetchedAt,
      fromCache: true,
      nextRefreshAt: cached.fetchedAt + HOT_LIST_CACHE_TTL_MS,
    });
  }

  await appendRequestLog({
    type: "text",
    operation: force ? "知乎热榜（强制刷新）" : "知乎热榜",
    endpoint: ZHIHU_ENDPOINTS.hotList,
    model: "zhihu",
    requestBody: { limit, force },
  });

  try {
    const data = await fetchZhihuHotList(secret, limit);
    const saved = writeZhihuHotListCache({
      limit,
      total: data.total,
      items: data.items,
    });
    return NextResponse.json({
      total: saved.total,
      items: saved.items,
      fetchedAt: saved.fetchedAt,
      fromCache: false,
      nextRefreshAt: saved.fetchedAt + HOT_LIST_CACHE_TTL_MS,
    });
  } catch (error) {
    if (cached) {
      return NextResponse.json({
        total: cached.total,
        items: cached.items,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
        nextRefreshAt: cached.fetchedAt + HOT_LIST_CACHE_TTL_MS,
        stale: true,
        warning: "知乎热榜刷新失败，已返回本地缓存",
      });
    }
    const payload = zhihuErrorPayload(error);
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
}
