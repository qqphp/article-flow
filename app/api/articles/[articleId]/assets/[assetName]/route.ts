import { NextResponse } from "next/server";
import path from "path";
import { readArticleAsset } from "../../../../../lib/article-store";

const contentTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export async function GET(_: Request, { params }: { params: { articleId: string; assetName: string } }) {
  const asset = await readArticleAsset(params.articleId, params.assetName);
  if (!asset) return NextResponse.json({ error: "本地图片不存在" }, { status: 404 });
  return new NextResponse(asset.data, { headers: { "Content-Type": contentTypes[path.extname(asset.filePath).toLowerCase()] || "application/octet-stream", "Cache-Control": "private, no-store" } });
}
