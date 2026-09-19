import { NextResponse } from "next/server";
import { deleteStoredArticle, readArticle } from "../../../lib/article-store";

export async function GET(_request: Request, { params }: { params: { articleId: string } }) {
  const article = await readArticle(params.articleId);
  return article
    ? NextResponse.json({ article })
    : NextResponse.json({ error: "文章不存在或 Markdown 文件无法读取" }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: { params: { articleId: string } }) {
  try {
    const deleted = await deleteStoredArticle(params.articleId);
    return deleted
      ? NextResponse.json({ deleted: true })
      : NextResponse.json({ error: "文章不存在" }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "删除文章失败" }, { status: 500 });
  }
}
