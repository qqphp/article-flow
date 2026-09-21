import { NextResponse } from "next/server";
import { getArticleStyle, listArticleStyles } from "../../lib/article-styles";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const styleId = new URL(request.url).searchParams.get("id");
    if (styleId) {
      const style = await getArticleStyle(styleId);
      return style
        ? NextResponse.json({ style })
        : NextResponse.json({ error: "文章风格不存在" }, { status: 404 });
    }
    return NextResponse.json({ styles: await listArticleStyles() });
  } catch {
    return NextResponse.json({ error: "读取文章风格失败" }, { status: 500 });
  }
}
