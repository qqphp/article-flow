import { NextResponse } from "next/server";
import { resolveMaterialFile } from "../../../../lib/material-store";
import { cachedLocalFileResponse } from "../../../../lib/cached-file-response";

export async function GET(request: Request, { params }: { params: { materialId: string } }) {
  const material = await resolveMaterialFile(params.materialId);
  if (!material) return NextResponse.json({ error: "素材不存在或文件无法读取" }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return cachedLocalFileResponse({
    filePath: material.filePath,
    request,
    contentType: material.contentType,
    cacheControl: download ? "private, no-store" : undefined,
    headers: download
      ? { "Content-Disposition": `attachment; filename="image.${material.asset.format}"; filename*=UTF-8''${encodeURIComponent(material.asset.originalFilename)}` }
      : undefined,
  });
}
