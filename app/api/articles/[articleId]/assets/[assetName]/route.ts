import { NextResponse } from "next/server";
import path from "path";
import { resolveArticleAsset } from "../../../../../lib/article-store";
import { cachedLocalFileResponse } from "../../../../../lib/cached-file-response";

const contentTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export async function GET(request: Request, { params }: { params: { articleId: string; assetName: string } }) {
  const filePath = await resolveArticleAsset(params.articleId, params.assetName);
  if (!filePath) return NextResponse.json({ error: "本地图片不存在" }, { status: 404 });
  return cachedLocalFileResponse({
    filePath,
    request,
    contentType: contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
  });
}
