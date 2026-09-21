import { appendRequestLog } from "./request-log";
import { modelFetch } from "./model-fetch";
import { getAppConfig } from "./config-store";
import { mergeSignals } from "./abort";

export function imageUrlFromResponse(data: unknown) {
  const image = (data as { data?: Array<{ url?: unknown; b64_json?: unknown }> } | null)?.data?.[0];
  if (typeof image?.url === "string" && image.url.trim()) return image.url.trim();
  if (typeof image?.b64_json === "string" && image.b64_json.trim()) {
    const base64 = image.b64_json.trim();
    return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  }
  return null;
}

export async function generateImage(input: { prompt: string; size: string; operation: string; signal?: AbortSignal }) {
  const config = getAppConfig();
  const apiKey = config.imageKey;
  const endpoint = (config.imageUrl || `${config.textBase}/images/generations`).replace(/([^:]\/)\/+/g, "$1");
  if (!apiKey || !endpoint) throw new Error("请先在配置中心填写图片模型的地址和密钥");

  const requestBody = { model: config.imageModel || "gpt-image-2.5-flare", prompt: input.prompt, size: input.size };
  await appendRequestLog({ type: "image", operation: input.operation, endpoint, model: requestBody.model, requestBody });
  const response = await modelFetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: mergeSignals(360000, input.signal),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || data?.error || data?.message || "图片生成服务返回错误");
  return { url: imageUrlFromResponse(data), demo: false };
}
