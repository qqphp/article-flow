import { NextResponse } from "next/server";
import { listArticleStyles } from "../../lib/article-styles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ styles: await listArticleStyles() });
  } catch {
    return NextResponse.json({ error: "读取文章风格失败" }, { status: 500 });
  }
}
