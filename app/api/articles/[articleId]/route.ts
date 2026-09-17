import { NextResponse } from "next/server";
import { readArticle } from "../../../lib/article-store";

export async function GET(_request: Request, { params }: { params: { articleId: string } }) {
  const article = await readArticle(params.articleId);
  return article
    ? NextResponse.json({ article })
    : NextResponse.json({ error: "文章不存在或 Markdown 文件无法读取" }, { status: 404 });
}
