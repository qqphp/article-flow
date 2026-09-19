import { NextResponse } from "next/server";
import { appendRequestLog } from "../../../../lib/request-log";
import { createPdfParseTask, resolveZhihuSecret, ZHIHU_ENDPOINTS, zhihuErrorPayload } from "../../../../lib/zhihu";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { fileId?: string; idempotencyKey?: string };
  const secret = resolveZhihuSecret();
  if (!secret) return NextResponse.json({ error: "请先在配置中心填写知乎数据 Access Secret" }, { status: 400 });
  const fileId = body.fileId?.trim();
  if (!fileId) return NextResponse.json({ error: "缺少 file_id，请先上传 PDF" }, { status: 400 });
  await appendRequestLog({
    type: "text",
    operation: "知乎 PDF 解析",
    endpoint: ZHIHU_ENDPOINTS.pdfTasks,
    model: "zhihu",
    requestBody: { fileId },
  });
  try {
    return NextResponse.json(await createPdfParseTask(secret, fileId, body.idempotencyKey?.trim()));
  } catch (error) {
    const payload = zhihuErrorPayload(error);
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
}
