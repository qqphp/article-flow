import { NextResponse } from "next/server";
import { clearRequestLogs, readRequestLogs } from "../../lib/request-log";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ logs: await readRequestLogs() });
}

export async function DELETE() {
  try {
    const deleted = await clearRequestLogs();
    return NextResponse.json({ deleted });
  } catch {
    return NextResponse.json({ error: "清空请求日志失败" }, { status: 500 });
  }
}
