import { NextResponse } from "next/server";
import { appendRequestLog } from "../../../../lib/request-log";
import { resolveZhihuSecret, uploadZhihuFile, ZHIHU_ENDPOINTS, zhihuErrorPayload } from "../../../../lib/zhihu";

export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "请上传 PDF 文件" }, { status: 400 });
  const file = form.get("file");
  const secret = resolveZhihuSecret();
  if (!secret) return NextResponse.json({ error: "请先在配置中心填写知乎数据 Access Secret" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "请上传 PDF 文件" }, { status: 400 });
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return NextResponse.json({ error: "当前仅支持 PDF 文件" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "PDF 文件不能超过 100MB" }, { status: 400 });
  await appendRequestLog({
    type: "text",
    operation: "知乎 PDF 上传",
    endpoint: ZHIHU_ENDPOINTS.files,
    model: "zhihu",
    requestBody: { filename: file.name, size: file.size },
  });
  try {
    return NextResponse.json(await uploadZhihuFile(secret, file, file.name));
  } catch (error) {
    const payload = zhihuErrorPayload(error);
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
}
