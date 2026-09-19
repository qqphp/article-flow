import { NextResponse } from "next/server";
import { appendRequestLog } from "../../lib/request-log";
import { readArticle, ResearchSource, saveGeneratedArticle } from "../../lib/article-store";
import { responseOutputText, responsesEndpoint } from "../../lib/responses";
import { modelFetch } from "../../lib/model-fetch";
import { AppConfig, getAppConfig } from "../../lib/config-store";
import { ArticleStyle, getArticleStyle } from "../../lib/article-styles";

type GenerateBody = { topic?: string; styleId?: string; search?: boolean };

const demo = (topic: string, style: ArticleStyle, sources: ResearchSource[]) => ({
  title: topic || "把一个想法，变成值得分享的内容",
  alternatives: [
    `${topic || "内容创作"}：一套可复用的 ${style.title} 写作方法`,
    `别再从零开始：普通人也能掌握的内容工作流`,
    `从灵感到发布，我把内容创作拆成了这几步`,
  ],
  content: `你有没有过这种感觉？当我们围绕“${topic || "内容创作"}”开始整理资料时，最容易卡在知道很多，却迟迟写不出第一段。真正有效的做法，是先把问题拆成可以行动的步骤。\n\n## 一、先定义“${topic || "这个主题"}”要解决的问题\n\n先写清楚读者是谁、遇到什么场景，以及读完之后希望得到什么结果。问题越具体，文章越容易形成自己的判断。\n\n## 二、把资料变成自己的结构\n\n把可靠来源、真实案例和个人经验放在同一条逻辑线上，再删掉与主题无关的内容。资料的价值不在数量，而在是否支持你的观点。\n\n## 三、把一次创作变成可复用的资产\n\n文章发布之后，继续拆解成短内容、图片和问答，让一次深度思考在不同平台发挥价值。\n\n围绕“${topic || "这个主题"}”持续记录、验证和迭代，才能把偶然写出的一篇文章变成稳定的内容能力。`,
  sources,
  demo: true,
});

async function firecrawlSearch(topic: string, config: AppConfig) {
  const key = config.firecrawlKey;
  if (!key) return [] as ResearchSource[];
  const endpoint = "https://api.firecrawl.dev/v1/search";
  const requestBody = { query: topic, limit: 5 };
  try {
    await appendRequestLog({ type: "text", operation: "Firecrawl 搜索", endpoint, model: "firecrawl", requestBody });
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data ?? data.results ?? []).map((item: any) => ({ title: item.title, url: item.url, description: item.description })).filter((item: ResearchSource) => Boolean(item.url)).slice(0, 5);
  } catch { return []; }
}

async function callModel(topic: string, style: ArticleStyle, sources: ResearchSource[], config: AppConfig) {
  const apiKey = config.textKey;
  const base = config.textBase.replace(/\/$/, "");
  if (!apiKey || !base) return null;
  const requestBody = { model: config.textModel || "gpt-4o", temperature: 0.75, max_output_tokens: 3000, store: false, input: [
    { role: "developer", content: `你是一位中文公众号作者。请严格遵循以下“${style.title}”写作风格指南，输出 JSON，字段为 title、alternatives（严格返回 3–6 个字符串）、content（Markdown 字符串）。正文内容不得展示、罗列或引用参考资料、来源链接或引用列表；参考资料仅用于辅助事实判断。\n\n--- 写作风格指南开始 ---\n${style.content}\n--- 写作风格指南结束 ---` },
    { role: "user", content: `主题：${topic}\n参考资料：${sources.map((source) => `${source.title || "资料"}: ${source.url}`).join("\n") || "无"}` },
  ], text: { format: { type: "json_object" } } };
  const endpoint = responsesEndpoint(base);
  await appendRequestLog({ type: "text", operation: "文章生成", endpoint, model: requestBody.model, requestBody });
  const timeoutMs = 360000;
  const response = await modelFetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error?.message || payload?.error || payload?.message;
    throw new Error(typeof message === "string" && message.trim() ? message : `AI 服务返回错误（${response.status}）`);
  }
  const data = await response.json();
  const raw = responseOutputText(data);
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value = JSON.parse(cleaned || "{}");
  if (typeof value.content !== "string" || !value.content.trim()) throw new Error("AI 返回内容为空");
  return { ...value, sources, demo: false };
}

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateBody;
  const topic = body.topic?.trim();
  if (!topic) return NextResponse.json({ error: "请输入文章主题" }, { status: 400 });
  const style = await getArticleStyle(body.styleId);
  if (!style) return NextResponse.json({ error: "所选文章风格不存在或已失效，请刷新风格列表后重试" }, { status: 400 });
  const config = getAppConfig();
  const sources = body.search ? await firecrawlSearch(topic, config) : [];
  try {
    const result = await callModel(topic, style, sources, config) || demo(topic, style, sources);
    const title = typeof result.title === "string" && result.title.trim() ? result.title.trim() : topic;
    const article = await saveGeneratedArticle({ title, topic, style: style.title, content: result.content, sources, alternatives: result.alternatives });
    const saved = await readArticle(article.id);
    return NextResponse.json({ ...result, ...saved, title, articleId: article.id, firecrawlSearched: Boolean(body.search) });
  } catch (error: any) {
    const configured = Boolean(config.textKey && config.textBase);
    const timedOut = error?.name === "TimeoutError";
    if (configured) return NextResponse.json({ error: timedOut ? "文章生成超过 6 分钟，请稍后重试或缩短主题后重试" : error?.message || "AI 文章生成失败，请稍后重试" }, { status: timedOut ? 504 : 502 });
    const result = demo(topic, style, sources);
    const article = await saveGeneratedArticle({ title: result.title, topic, style: style.title, content: result.content, sources, alternatives: result.alternatives });
    const saved = await readArticle(article.id);
    return NextResponse.json({ ...result, ...saved, articleId: article.id, firecrawlSearched: Boolean(body.search) });
  }
}
