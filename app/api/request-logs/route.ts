import { NextResponse } from "next/server";
import { clearRequestLogs, readRequestLogs } from "../../lib/request-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return NextResponse.json(await readRequestLogs({
    page: params.get("page"),
    pageSize: params.get("pageSize"),
    type: params.get("type") || undefined,
    query: params.get("query") || undefined,
  }));
}

export async function DELETE() {
  try {
    const deleted = await clearRequestLogs();
    return NextResponse.json({ deleted });
  } catch {
    return NextResponse.json({ error: "清空请求日志失败" }, { status: 500 });
  }
}
