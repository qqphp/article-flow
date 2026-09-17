import { NextResponse } from "next/server";
import { readLatestArticle } from "../../lib/article-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const article = await readLatestArticle();
  return article
    ? NextResponse.json({ article })
    : NextResponse.json({ article: null }, { status: 404 });
}
