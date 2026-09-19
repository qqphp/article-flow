import { NextResponse } from "next/server";
import { appendRequestLog } from "../../../../lib/request-log";
import { clamp, createPptTask, resolveZhihuSecret, ZHIHU_ENDPOINTS, zhihuErrorPayload } from "../../../../lib/zhihu";

export const dynamic = "force-dynamic";

const PPT_URL = /^https:\/\/(?:www\.)?zhihu\.com\/(?:question\/\d+\/)?answer\/\d+(?:[/?#].*)?$|^https:\/\/zhuanlan\.zhihu\.com\/p\/\d+(?:[/?#].*)?$/i;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    resourceUrl?: string;
    numPages?: number;
    idempotencyKey?: string;
    config?: { zhihuAccessSecret?: string };
  };
  const secret = resolveZhihuSecret(body.config);
  if (!secret) return NextResponse.json({ error: "请先在配置中心填写知乎数据 Access Secret" }, { status: 400 });
  const resourceUrl = body.resourceUrl?.trim() || "";
  if (!PPT_URL.test(resourceUrl)) {
    return NextResponse.json({ error: "请填写知乎回答或专栏文章链接" }, { status: 400 });
  }
  const numPages = clamp(body.numPages, 6, 21, 12);
  await appendRequestLog({
    type: "text",
    operation: "知乎 PPT 生成",
    endpoint: ZHIHU_ENDPOINTS.pptTasks,
    model: "zhihu",
    requestBody: { resourceUrl, numPages },
  });
  try {
    return NextResponse.json(await createPptTask(secret, resourceUrl, numPages, body.idempotencyKey?.trim()));
  } catch (error) {
    const payload = zhihuErrorPayload(error);
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
}
