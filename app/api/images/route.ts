import { NextResponse } from "next/server";
import { appendRequestLog } from "../../lib/request-log";
import { saveArticleImage } from "../../lib/article-store";

export async function POST(request: Request) {
  const { prompt, size = "1024x1024", config, articleId } = await request.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "缺少图片描述" }, { status: 400 });
  const apiKey = config?.imageKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const base = (config?.imageUrl || process.env.AI_IMAGE_URL || `${config?.textBase || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || ""}/images/generations`).replace(/([^:]\/)\/+/g, "$1");
  if (!apiKey || !base) return NextResponse.json({ url: null, demo: true });
  try {
    const requestBody = { model: config?.imageModel || process.env.AI_IMAGE_MODEL || "gpt-image-2.5-flare", prompt, size };
    await appendRequestLog({ type: "image", operation: "封面与配图", endpoint: base, model: requestBody.model, requestBody });
    const response = await fetch(base, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error("image failed");
    const data = await response.json();
    const url = data.data?.[0]?.url || null;
    let savedImagePath: string | null = null;
    if (url && articleId) {
      try { savedImagePath = await saveArticleImage(articleId, url); } catch { /* The remote URL is still usable even if archive fails. */ }
    }
    return NextResponse.json({ url, savedImagePath, demo: false });
  } catch { return NextResponse.json({ url: null, demo: true }); }
}
