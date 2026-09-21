import { NextResponse } from "next/server";
import { articleAssetUrl, beginArticleImageGeneration, CoverImage, ParagraphImage, readArticle, readArticleImageState, readArticleSource, replaceArticleImageWithMaterial, saveArticleImage, saveArticleLayout } from "../../lib/article-store";
import { generateImage } from "../../lib/image-generation";
import { appendRequestLog } from "../../lib/request-log";
import { responseOutputText, responsesEndpoint } from "../../lib/responses";
import { modelFetch } from "../../lib/model-fetch";
import { AppConfig, getAppConfig } from "../../lib/config-store";
import { abortedJsonResponse, isAbortError, mergeSignals, throwIfAborted } from "../../lib/abort";

export const maxDuration = 360;

type ImagePlan = { prompt: string; anchor: string };
type ImageTarget = { type: "cover" } | { type: "paragraph"; index: number };

async function createParagraphPrompts(title: string, content: string, config: AppConfig, signal?: AbortSignal) {
  const apiKey = config.textKey;
  const baseUrl = config.textBase;
  if (!apiKey || !baseUrl) throw new Error("请先在配置中心填写文本模型的地址和密钥");
  const requestBody = {
    model: config.textModel || "gpt-5-mini",
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
  const response = await modelFetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: mergeSignals(90000, signal),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || data?.error || data?.message || "配图提示词服务返回错误");
  const raw = responseOutputText(data);
  let parsed: { images?: unknown };
  try { parsed = JSON.parse(raw); } catch { throw new Error("配图提示词未返回有效 JSON，可能是输出被截断，请重试"); }
  const images = Array.isArray(parsed.images) ? parsed.images.filter((item): item is ImagePlan => Boolean(item && typeof item === "object" && typeof (item as ImagePlan).prompt === "string" && (item as ImagePlan).prompt.trim() && typeof (item as ImagePlan).anchor === "string" && (item as ImagePlan).anchor.trim())).slice(0, 6) : [];
  if (images.length < 3) throw new Error("配图提示词数量不足，请重试");
  return { images, demo: false };
}

const IMAGE_GENERATION_CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  if (!items.length) return { results: [] as Array<R | undefined> };
  const results = new Array<R | undefined>(items.length);
  let nextIndex = 0;
  let firstError: unknown;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (!firstError) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        if (!firstError) firstError = error;
      }
    }
  }));
  return { results, error: firstError };
}

async function generateAndSaveImage(articleId: string, prompt: string, size: string, name: string, operation: string, signal?: AbortSignal) {
  try {
    throwIfAborted(signal);
    const image = await generateImage({ prompt, size, operation, signal });
    if (!image.url) throw new Error("图片服务未返回地址");
    const filePath = await saveArticleImage(articleId, image.url, name, signal);
    if (!filePath) throw new Error("无法保存本地图片");
    return { url: articleAssetUrl(articleId, filePath), filePath };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error;
    return { error: error instanceof Error ? error.message : "图片生成失败" };
  }
}

export async function POST(request: Request) {
  const { title: requestedTitle, articleId, mode = "all", target, materialId } = await request.json() as { title?: string; articleId?: string; mode?: "all" | "single" | "replace"; target?: ImageTarget; materialId?: string };
  if (!articleId) return NextResponse.json({ error: "缺少文章存档，无法保存本地图片" }, { status: 400 });
  if (mode === "replace") {
    if (!target || !materialId) return NextResponse.json({ error: "缺少图片位置或素材" }, { status: 400 });
    try {
      const article = await replaceArticleImageWithMaterial(articleId, target, materialId);
      if (!article) return NextResponse.json({ error: "文章不存在" }, { status: 404 });
      return NextResponse.json({ article, layoutContent: article.layoutContent, coverUrl: article.imageUrl, paragraphImages: article.paragraphImages, assetVersion: `${Date.now()}-${materialId}`, failed: 0 });
    } catch (error: any) {
      return NextResponse.json({ error: error.message || "替换素材失败" }, { status: 400 });
    }
  }
  const source = await readArticleSource(articleId, true);
  if (!source?.content.trim()) return NextResponse.json({ error: "文章 Markdown 文件不存在或内容为空" }, { status: 404 });
  const title = requestedTitle?.trim() || source.article.selected_title || source.article.title;
  const content = source.content;
  const config = getAppConfig();
  const signal = request.signal;
  try {
    let cover: CoverImage;
    let paragraphImages: ParagraphImage[];

    if (mode === "single") {
      const imageState = await readArticleImageState(articleId);
      if (!imageState || !target) return NextResponse.json({ error: "图片提示词不存在，请先生成封面与配图" }, { status: 400 });
      cover = imageState.cover;
      paragraphImages = imageState.paragraphImages;
      if (target.type === "cover") {
        const result = await generateAndSaveImage(articleId, cover.prompt, "1536x1024", "cover", "重新生成文章封面", signal);
        cover = "error" in result ? { ...cover, error: result.error } : { prompt: cover.prompt, ...result };
      } else if (Number.isInteger(target.index) && target.index >= 0 && target.index < paragraphImages.length) {
        const current = paragraphImages[target.index];
        const result = await generateAndSaveImage(articleId, current.prompt, "1024x1024", `paragraph-${target.index + 1}`, `重新生成段落配图 ${target.index + 1}`, signal);
        paragraphImages[target.index] = "error" in result ? { ...current, error: result.error } : { prompt: current.prompt, anchor: current.anchor, ...result };
      } else {
        return NextResponse.json({ error: "段落配图不存在" }, { status: 400 });
      }
    } else {
      const promptResult = await createParagraphPrompts(title, content, config, signal);
      throwIfAborted(signal);
      const coverPrompt = `公众号文章封面，主题：${title}。仅根据这个标题创作，现代编辑插画风，清晰单一视觉焦点，留白构图，无文字、无水印、无品牌标识。画面必须为 3:2 横向比例。`;
      cover = { prompt: coverPrompt };
      paragraphImages = promptResult.images.map(({ prompt, anchor }) => ({ prompt, anchor }));
      await beginArticleImageGeneration(articleId, coverPrompt, paragraphImages);
      const imageJobs = [
        { prompt: coverPrompt, size: "1536x1024", name: "cover", operation: "生成文章封面" },
        ...paragraphImages.map((image, index) => ({ prompt: image.prompt, size: "1024x1024", name: `paragraph-${index + 1}`, operation: `生成段落配图 ${index + 1}` })),
      ];
      const mapped = await mapWithConcurrency(imageJobs, IMAGE_GENERATION_CONCURRENCY, (job) =>
        generateAndSaveImage(articleId, job.prompt, job.size, job.name, job.operation, signal)
      );
      if (mapped.error && !(signal.aborted || isAbortError(mapped.error))) throw mapped.error;
      const imageResults = mapped.results;
      cover = { prompt: coverPrompt, ...(imageResults[0] || {}) };
      paragraphImages = paragraphImages.map((image, index) => ({ ...image, ...(imageResults[index + 1] || {}) }));
    }

    const savedAny = Boolean(cover.url) || paragraphImages.some((image) => image.url);
    if (signal.aborted && !savedAny) return abortedJsonResponse();
    const layoutContent = await saveArticleLayout(articleId, content, cover, paragraphImages);
    if (!layoutContent) throw new Error("无法保存排版预览 Markdown");
    const article = await readArticle(articleId);
    const failed = [cover, ...paragraphImages].filter((image) => image.error).length;
    return NextResponse.json({ article, layoutContent, coverUrl: cover.url || null, paragraphImages, failed });
  } catch (error: any) {
    if (signal.aborted || isAbortError(error)) return abortedJsonResponse();
    return NextResponse.json({ error: error.message || "封面与配图生成失败" }, { status: 502 });
  }
}
