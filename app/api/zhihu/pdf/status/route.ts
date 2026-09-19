import { NextResponse } from "next/server";
import { fetchPdfParseTask, resolveZhihuSecret, zhihuErrorPayload } from "../../../../lib/zhihu";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { taskId?: string };
  const secret = resolveZhihuSecret();
  if (!secret) return NextResponse.json({ error: "请先在配置中心填写知乎数据 Access Secret" }, { status: 400 });
  const taskId = body.taskId?.trim();
  if (!taskId) return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 });
  try {
    return NextResponse.json(await fetchPdfParseTask(secret, taskId));
  } catch (error) {
    const payload = zhihuErrorPayload(error);
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
}
