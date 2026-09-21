import { NextResponse } from "next/server";
import { fetchSignedJson, zhihuErrorPayload } from "../../../../lib/zhihu";
import { hostMatchesDomain } from "../../../../lib/public-url";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { url?: string };
  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: "缺少解析结果下载地址" }, { status: 400 });
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const allowed = hostMatchesDomain(host, "bcebos.com") || hostMatchesDomain(host, "zhihu.com") || hostMatchesDomain(host, "zhimg.com");
    if (parsed.protocol !== "https:" || !allowed) return NextResponse.json({ error: "解析结果地址无效" }, { status: 400 });
    return NextResponse.json({ result: await fetchSignedJson(url) });
  } catch (error) {
    const payload = zhihuErrorPayload(error);
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
}
