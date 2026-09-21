import { NextResponse } from "next/server";
import { getSafeAppConfig, updateAppConfig } from "../../lib/config-store";
import { assertPublicHttpUrl } from "../../lib/public-url";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getSafeAppConfig());
}

async function assertConfigPublicUrls(values: unknown) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return;
  const record = values as Record<string, unknown>;
  const textBase = typeof record.textBase === "string" ? record.textBase.trim() : "";
  const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl.trim() : "";
  if (textBase) await assertPublicHttpUrl(textBase, "模型接口地址");
  if (imageUrl) await assertPublicHttpUrl(imageUrl, "图片接口地址");
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    await assertConfigPublicUrls(body?.values);
    const result = updateAppConfig(body?.values, { onlyMissing: body?.mode === "fill-missing" });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存配置失败" }, { status: 400 });
  }
}
