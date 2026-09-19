import { NextResponse } from "next/server";
import { listRecentArticles, readLatestArticle } from "../../lib/article-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const recent = new URL(request.url).searchParams.get("recent");
  if (recent !== null) {
    const limit = Number(recent);
    return NextResponse.json({ articles: await listRecentArticles(Number.isFinite(limit) ? limit : 3) });
  }

  const article = await readLatestArticle();
  return article
    ? NextResponse.json({ article })
    : NextResponse.json({ article: null }, { status: 404 });
}
