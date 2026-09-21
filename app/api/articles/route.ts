import { NextResponse } from "next/server";
import { getArticlePublishStats, listArticleQueue, listRecentArticles } from "../../lib/article-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const recent = searchParams.get("recent");
  if (recent !== null) {
    const limit = Number(recent);
    return NextResponse.json({ articles: await listRecentArticles(Number.isFinite(limit) ? limit : 3) });
  }

  if (searchParams.get("summary") === "1") {
    return NextResponse.json({ stats: getArticlePublishStats() });
  }

  if (searchParams.get("queue") === "1") {
    const page = Number(searchParams.get("page"));
    const queue = await listArticleQueue(Number.isFinite(page) ? page : 1);
    return NextResponse.json({ ...queue, stats: getArticlePublishStats() });
  }

  return NextResponse.json({ error: "请指定 recent、summary 或 queue 参数" }, { status: 400 });
}
