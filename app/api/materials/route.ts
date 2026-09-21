import { NextResponse } from "next/server";
import { MAX_MATERIAL_FILE_BYTES, MAX_MATERIAL_FILES_PER_UPLOAD, materialFileLimitLabel } from "../../lib/material-limits";
import { isManualMaterialType, listMaterials, saveMaterial } from "../../lib/material-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requestedType = params.get("type");
  const type = requestedType === "cover" || requestedType === "paragraph" || requestedType === "ai" ? requestedType : undefined;
  return NextResponse.json(listMaterials({
    type,
    query: params.get("query") || undefined,
    page: params.get("page"),
    pageSize: params.get("pageSize"),
  }));
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const type = form.get("type");
    if (!isManualMaterialType(type)) return NextResponse.json({ error: "请选择封面图或段落配图类型" }, { status: 400 });
    const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) return NextResponse.json({ error: "请选择至少一张图片" }, { status: 400 });
    if (files.length > MAX_MATERIAL_FILES_PER_UPLOAD) {
      return NextResponse.json({ error: `一次最多上传 ${MAX_MATERIAL_FILES_PER_UPLOAD} 张图片` }, { status: 400 });
    }
    const oversized = files.filter((file) => file.size > MAX_MATERIAL_FILE_BYTES);
    if (oversized.length) {
      return NextResponse.json({ error: `有 ${oversized.length} 张图片超过 ${materialFileLimitLabel()} 限制` }, { status: 400 });
    }
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
