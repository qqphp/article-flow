import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { prompt, size = "1024x1024", config } = await request.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "缺少图片描述" }, { status: 400 });
  const apiKey = config?.imageKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const base = (config?.imageUrl || process.env.AI_IMAGE_URL || `${config?.textBase || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || ""}/images/generations`).replace(/([^:]\/)\/+/g, "$1");
  if (!apiKey || !base) return NextResponse.json({ url: null, demo: true });
  try {
    const response = await fetch(base, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: config?.imageModel || process.env.AI_IMAGE_MODEL || "gpt-image-2.5-flare", prompt, size }), signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error("image failed");
    const data = await response.json();
    return NextResponse.json({ url: data.data?.[0]?.url || null, demo: false });
  } catch { return NextResponse.json({ url: null, demo: true }); }
}
