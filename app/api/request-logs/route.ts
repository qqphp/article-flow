import { NextResponse } from "next/server";
import { readRequestLogs } from "../../lib/request-log";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ logs: await readRequestLogs() });
}
