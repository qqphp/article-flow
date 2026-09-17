import { NextResponse } from "next/server";
import { HUMANIZER_PROMPT } from "../../lib/humanizer-prompt";
import { readArticle, readArticleSource, saveHumanizedArticle } from "../../lib/article-store";
import { appendRequestLog } from "../../lib/request-log";
import { responseOutputText, responsesEndpoint } from "../../lib/responses";
import { modelFetch } from "../../lib/model-fetch";

function demoHumanize(content: string) {
  return content
    .replace(/^(当然|好的|没问题)[！!，,。\s]*/gm, "")
    .replace(/综上所述[，,]?/g, "说到底，")
    .replace(/值得注意的是[，,]?/g, "")
    .replace(/不仅是([^，。；]+)[，,，]\s*更是/g, "$1，也是")
    .replace(/—{2,}/g, "，")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  const { articleId, config } = await request.json();
  if (!articleId) return NextResponse.json({ error: "缺少文章存档，无法生成去痕 Markdown" }, { status: 400 });
  const source = await readArticleSource(articleId, false);
  if (!source?.content.trim()) return NextResponse.json({ error: "原始 Markdown 文件不存在或内容为空" }, { status: 404 });
  const apiKey = config?.textKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const base = (config?.textBase || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "").replace(/\/$/, "");

  if (!apiKey || !base) {
    const content = await saveHumanizedArticle(articleId, demoHumanize(source.content));
    const article = await readArticle(articleId);
    return NextResponse.json({ article, content, demo: true });
  }

  try {
    const requestBody = {
      model: config?.textModel || process.env.AI_TEXT_MODEL || "gpt-4o",
      temperature: 0.6,
      max_output_tokens: 6000,
      store: false,
      input: [
        { role: "developer", content: HUMANIZER_PROMPT },
        { role: "user", content: source.content },
      ],
    };
    const endpoint = responsesEndpoint(base);
    await appendRequestLog({ type: "text", operation: "文章去痕", endpoint, model: requestBody.model, requestBody });
    const response = await modelFetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message || data?.error || data?.message || "文章去痕服务返回错误");
    const generated = responseOutputText(data);
    const cleaned = generated.trim().replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/, "");
    if (!cleaned) throw new Error("文章去痕服务返回空内容");
    const content = await saveHumanizedArticle(articleId, cleaned);
    const article = await readArticle(articleId);
    return NextResponse.json({ article, content, demo: false });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "文章去痕失败" }, { status: error?.name === "TimeoutError" ? 504 : 502 });
  }
}
