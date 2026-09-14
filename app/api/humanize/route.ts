import { NextResponse } from "next/server";
import { appendRequestLog } from "../../lib/request-log";

export async function POST(request: Request) {
  const { content, config } = await request.json();
  if (!content?.trim()) return NextResponse.json({ error: "缺少文章内容" }, { status: 400 });
  const apiKey = config?.textKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const base = (config?.textBase || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "").replace(/\/$/, "");
  if (!apiKey || !base) {
    return NextResponse.json({ content: content.replace(/首先，/g, "先说说").replace(/综上所述，/g, "说到底，"), demo: true });
  }
  try {
    const requestBody = { model: config?.textModel || process.env.AI_TEXT_MODEL || "gpt-4o", temperature: 0.8, messages: [{ role: "system", content: "请对下面的中文文章做自然化编辑：保留事实、结构和观点，减少模板化表达，加入更自然的句式变化，只输出处理后的 Markdown 正文。" }, { role: "user", content }] };
    await appendRequestLog({ type: "text", operation: "文章去痕", endpoint: `${base}/chat/completions`, model: requestBody.model, requestBody });
    const response = await fetch(`${base}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("humanize failed");
    const data = await response.json();
    const generated = data.choices?.[0]?.message?.content || content;
    const cleaned = generated.trim().replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/, "");
    return NextResponse.json({ content: cleaned || content, demo: false });
  } catch { return NextResponse.json({ content, demo: true }); }
}
