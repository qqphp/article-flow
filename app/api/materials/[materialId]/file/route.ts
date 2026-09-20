import { NextResponse } from "next/server";
import { readMaterialFile } from "../../../../lib/material-store";

export async function GET(request: Request, { params }: { params: { materialId: string } }) {
  const material = await readMaterialFile(params.materialId);
  if (!material) return NextResponse.json({ error: "素材不存在或文件无法读取" }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = { "Content-Type": material.contentType, "Cache-Control": "private, no-store" };
  if (download) headers["Content-Disposition"] = `attachment; filename="image.${material.asset.format}"; filename*=UTF-8''${encodeURIComponent(material.asset.originalFilename)}`;
  return new NextResponse(material.data, { headers });
}
