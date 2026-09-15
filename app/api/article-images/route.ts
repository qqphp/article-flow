import { NextResponse } from "next/server";
import { saveArticleImage } from "../../lib/article-store";
import { generateImage } from "../../lib/image-generation";
import { appendRequestLog } from "../../lib/request-log";
import { responseOutputText, responsesEndpoint } from "../../lib/responses";

type Config = Record<string, string | undefined>;
type ImagePlan = { prompt: string; anchor: string };

async function createParagraphPrompts(title: string, content: string, config?: Config) {
  const apiKey = config?.textKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = config?.textBase || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL;
  if (!apiKey || !baseUrl) throw new Error("请先在配置中心填写文本模型的地址和密钥");
  const requestBody = {
    model: config?.textModel || process.env.AI_TEXT_MODEL || "gpt-5-mini",
    store: false,
    max_output_tokens: 1200,
    input: [
      { role: "developer", content: "你是中文公众号文章的视觉编辑。根据完整文章，返回 JSON 对象：{\"images\":[{\"prompt\":\"...\",\"anchor\":\"...\"}]}。images 必须为 3 到 6 项；prompt 是中文图片生成提示词，每项对应文章中的一个具体段落或观点，描述可视主体、场景、构图和风格，不要包含文字、标题、水印或品牌标识；anchor 是该段落中连续的一小段原文，最多 24 个字，用于将图片插入对应位置。" },
      { role: "user", content: `文章标题：${title}\n\n文章全文：\n${content}` },
    ],
    text: { format: { type: "json_object" } },
  };
  const endpoint = responsesEndpoint(baseUrl);
  await appendRequestLog({ type: "text", operation: "提炼段落配图提示词", endpoint, model: requestBody.model, requestBody });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || data?.error || data?.message || "配图提示词服务返回错误");
  const raw = responseOutputText(data);
  let parsed: { images?: unknown };
  try { parsed = JSON.parse(raw); } catch { throw new Error("配图提示词未返回有效 JSON"); }
  const images = Array.isArray(parsed.images) ? parsed.images.filter((item): item is ImagePlan => Boolean(item && typeof item === "object" && typeof (item as ImagePlan).prompt === "string" && (item as ImagePlan).prompt.trim() && typeof (item as ImagePlan).anchor === "string" && (item as ImagePlan).anchor.trim())).slice(0, 6) : [];
  if (images.length < 3) throw new Error("配图提示词数量不足，请重试");
  return { images, demo: false };
}

export async function POST(request: Request) {
  const { title, content, config, articleId } = await request.json() as { title?: string; content?: string; config?: Config; articleId?: string };
  if (!title?.trim() || !content?.trim()) return NextResponse.json({ error: "缺少文章标题或正文" }, { status: 400 });
  try {
    const promptResult = await createParagraphPrompts(title, content, config);
    const coverPrompt = `公众号文章封面，主题：${title}。仅根据这个标题创作，现代编辑插画风，清晰单一视觉焦点，留白构图，无文字、无水印、无品牌标识。画面必须为 3:2 横向比例。`;
    const cover = await generateImage({ prompt: coverPrompt, size: "1536x1024", config, operation: "生成文章封面" });
    let savedCoverPath: string | null = null;
    if (cover.url && articleId) {
      try { savedCoverPath = await saveArticleImage(articleId, cover.url, "cover"); } catch { /* Keep the provider URL if archiving fails. */ }
    }
    const paragraphImages = await Promise.all(promptResult.images.map(async ({ prompt, anchor }, index) => {
      const image = await generateImage({ prompt, size: "1024x1024", config, operation: `生成段落配图 ${index + 1}` });
      let savedImagePath: string | null = null;
      if (image.url && articleId) {
        try { savedImagePath = await saveArticleImage(articleId, image.url, `paragraph-${index + 1}`); } catch { /* Keep the provider URL if archiving fails. */ }
      }
      return { prompt, anchor, url: image.url, savedImagePath };
    }));
    return NextResponse.json({ coverUrl: cover.url, savedCoverPath, paragraphImages, prompts: promptResult.images.map((image) => image.prompt), demo: promptResult.demo || cover.demo || paragraphImages.some((image) => !image.url) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "封面与配图生成失败" }, { status: 502 });
  }
}
