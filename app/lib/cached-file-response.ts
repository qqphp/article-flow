import { promises as fs } from "fs";
import { NextResponse } from "next/server";

const DEFAULT_CACHE_CONTROL = "private, no-cache";

export async function cachedLocalFileResponse(input: {
  filePath: string;
  request: Request;
  contentType: string;
  cacheControl?: string;
  headers?: Record<string, string>;
}) {
  const stat = await fs.stat(input.filePath);
  const etag = `"${Math.round(stat.mtimeMs)}-${stat.size}"`;
  const headers: Record<string, string> = {
    "Content-Type": input.contentType,
    "Cache-Control": input.cacheControl || DEFAULT_CACHE_CONTROL,
    ETag: etag,
    "Last-Modified": stat.mtime.toUTCString(),
    ...input.headers,
  };
  if (input.request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(await fs.readFile(input.filePath), { headers });
}
