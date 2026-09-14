import { NextResponse } from "next/server";

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function GET() {
  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const base = (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "").replace(/\/$/, "");
  if (!key || !base) return NextResponse.json({ error: "未配置模型服务" }, { status: 503 });
  try {
    const response = await fetch(`${base}/billing/balance`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(12000) });
    const raw = await response.json().catch(() => ({}));
    if (!response.ok && response.status === 404) {
      const usageResponse = await fetch(`${base}/dashboard/billing/usage`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(12000) });
      const usage = await usageResponse.json().catch(() => ({}));
      if (usageResponse.ok && typeof usage.total_usage === "number") {
        return NextResponse.json({ percent: 0, used: usage.total_usage, amount: usage.total_usage, source: "dashboard/billing/usage", unavailable: false });
      }
    }
    if (!response.ok) return NextResponse.json({ error: raw.error?.message || raw.message || "余额接口不可用" }, { status: response.status });
    const data = raw.data || raw;
    const limit = numberFrom(data.limit ?? data.total ?? data.quota ?? data.monthly_limit);
    const remaining = numberFrom(data.remaining ?? data.balance ?? data.available ?? data.credit);
    const used = numberFrom(data.used ?? data.usage ?? (limit !== undefined && remaining !== undefined ? limit - remaining : undefined));
    const percent = limit && used !== undefined ? Math.min(100, Math.max(0, Math.round((used / limit) * 100))) : numberFrom(data.percent ?? data.usage_percent) ?? 0;
    return NextResponse.json({ percent, used, limit, remaining, resetAt: data.reset_at ?? data.resetAt ?? data.next_reset });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "余额查询失败" }, { status: 502 });
  }
}
