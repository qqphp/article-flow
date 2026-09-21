import { NextResponse } from "next/server";

export function isAbortError(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && (error as { name: string }).name === "AbortError");
}

export function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("请求已取消");
  error.name = "AbortError";
  throw error;
}

export function mergeSignals(timeoutMs: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeout]);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal.aborted || timeout.aborted) {
    controller.abort();
    return controller.signal;
  }
  signal.addEventListener("abort", onAbort, { once: true });
  timeout.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

export function abortedJsonResponse() {
  return NextResponse.json({ error: "请求已取消" }, { status: 499 });
}
