import { NextResponse } from "next/server";
import { saveArticleImage } from "../../lib/article-store";
import { generateImage } from "../../lib/image-generation";

export async function POST(request: Request) {
  const { prompt, size = "1024x1024", config, articleId } = await request.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "缺少图片描述" }, { status: 400 });
  try {
    const { url, demo } = await generateImage({ prompt, size, config, operation: "封面与配图" });
    let savedImagePath: string | null = null;
    if (url && articleId) {
      try { savedImagePath = await saveArticleImage(articleId, url); } catch { /* The remote URL is still usable even if archive fails. */ }
    }
    return NextResponse.json({ url, savedImagePath, demo });
  } catch (error: any) { return NextResponse.json({ error: error.message || "图片生成失败" }, { status: 502 }); }
}
