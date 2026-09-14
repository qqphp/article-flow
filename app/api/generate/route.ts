import { NextResponse } from "next/server";

type GenerateBody = { topic?: string; style?: string; search?: boolean };

const demo = (topic: string, style: string, sources: string[]) => ({
  title: topic || "把一个想法，变成值得分享的内容",
  alternatives: [
    `${topic || "内容创作"}：一套可复用的 ${style || "默认"} 写作方法`,
    `别再从零开始：普通人也能掌握的内容工作流`,
    `从灵感到发布，我把内容创作拆成了这几步`,
  ],
  content: `你有没有过这种感觉？\n\n收藏了很多资料，却很难把它们变成真正属于自己的内容。问题往往不在工具，而在于缺少一套可以持续复用的工作流。\n\n## 一、先建立稳定的信息输入\n\n把关注的主题、可靠的来源和自己的问题放在同一个空间里。每次阅读只记录一个判断，并写下它为什么值得被记住。\n\n## 二、让 AI 负责整理，把判断留给自己\n\nAI 可以帮助你提炼结构、补充背景和发现遗漏，但文章的立场、案例与取舍仍然需要由作者完成。\n\n## 三、把一次创作变成可复用的资产\n\n文章发布之后，继续拆解成短内容、图片和问答，让一次深度思考在不同平台发挥价值。\n\n真正高效的工作流，不是让你做更多，而是让你把注意力留给更重要的事。`,
  sources,
  demo: true,
});

async function firecrawlSearch(topic: string) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [] as string[];
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: topic, limit: 5 }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data ?? data.results ?? []).map((item: any) => item.url || item.title).filter(Boolean).slice(0, 5);
  } catch { return []; }
}

async function callModel(topic: string, style: string, sources: string[]) {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const base = (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "").replace(/\/$/, "");
  if (!apiKey || !base) return null;
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.AI_TEXT_MODEL || "gpt-4o", temperature: 0.75, messages: [
      { role: "system", content: `你是一位中文公众号作者。请使用“${style || "默认"}”风格，输出 JSON，字段为 title、alternatives（字符串数组）、content（Markdown 字符串）。内容要有故事化开头、清晰小标题和可执行建议。` },
      { role: "user", content: `主题：${topic}\n参考资料：${sources.join("\n") || "无"}` },
    ], response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error("AI 服务返回错误");
  const data = await response.json();
  const value = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  return { ...value, sources, demo: false };
}

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateBody;
  const topic = body.topic?.trim();
  if (!topic) return NextResponse.json({ error: "请输入文章主题" }, { status: 400 });
  const sources = body.search ? await firecrawlSearch(topic) : [];
  try {
    const result = await callModel(topic, body.style || "默认", sources);
    return NextResponse.json(result || demo(topic, body.style || "默认", sources));
  } catch {
    return NextResponse.json(demo(topic, body.style || "默认", sources));
  }
}
