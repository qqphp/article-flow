import { NextResponse } from "next/server";
import { isManualMaterialType, listMaterials, saveMaterial } from "../../lib/material-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requestedType = params.get("type");
  const type = requestedType === "cover" || requestedType === "paragraph" || requestedType === "ai" ? requestedType : undefined;
  return NextResponse.json({ materials: listMaterials({ type, query: params.get("query") || undefined }) });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const type = form.get("type");
    if (!isManualMaterialType(type)) return NextResponse.json({ error: "请选择封面图或段落配图类型" }, { status: 400 });
    const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) return NextResponse.json({ error: "请选择至少一张图片" }, { status: 400 });
    const materials = await Promise.all(files.map(async (file) => saveMaterial({
      originalFilename: file.name,
      type,
      data: Buffer.from(await file.arrayBuffer()),
    })));
    return NextResponse.json({ materials }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "上传素材失败" }, { status: 400 });
  }
}
