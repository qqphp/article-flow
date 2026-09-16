import { appendRequestLog } from "./request-log";
import { modelFetch } from "./model-fetch";

type ImageConfig = Record<string, string | undefined> | undefined;

export async function generateImage(input: { prompt: string; size: string; config?: ImageConfig; operation: string }) {
  const apiKey = input.config?.imageKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const endpoint = (input.config?.imageUrl || process.env.AI_IMAGE_URL || `${input.config?.textBase || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || ""}/images/generations`).replace(/([^:]\/)\/+/g, "$1");
  if (!apiKey || !endpoint) throw new Error("请先在配置中心填写图片模型的地址和密钥");

  const requestBody = { model: input.config?.imageModel || process.env.AI_IMAGE_MODEL || "gpt-image-2.5-flare", prompt: input.prompt, size: input.size };
  await appendRequestLog({ type: "image", operation: input.operation, endpoint, model: requestBody.model, requestBody });
  const response = await modelFetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(360000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || data?.error || data?.message || "图片生成服务返回错误");
  return { url: data?.data?.[0]?.url || null, demo: false };
}
