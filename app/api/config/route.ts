import { NextResponse } from "next/server";
import { getSafeAppConfig, updateAppConfig } from "../../lib/config-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getSafeAppConfig());
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const result = updateAppConfig(body?.values, { onlyMissing: body?.mode === "fill-missing" });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存配置失败" }, { status: 400 });
  }
}
