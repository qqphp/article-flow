export type ZhihuConfig = { zhihuAccessSecret?: string };

export type ZhihuQuotaItem = {
  apiId: string;
  apiName: string;
  totalQuota: number;
  totalUsed: number;
  remainingQuota: number;
};

export type ZhihuHotItem = {
  title: string;
  url: string;
  thumbnailUrl: string;
  summary: string;
};

export type ZhihuComment = { content: string };

export type ZhihuSearchItem = {
  title: string;
  contentType: string;
  contentId: string;
  contentText: string;
  url: string;
  commentCount: number;
  voteUpCount: number;
  authorName: string;
  authorAvatar: string;
  authorBadge: string;
  authorBadgeText: string;
  editTime: number;
  commentInfoList: ZhihuComment[];
  authorityLevel: string;
  rankingScore?: number;
};

export type ZhihuMessage = { role: string; content: string };

export type ZhihuTaskResult = {
  url: string;
  summary?: string;
  expiresAtMs?: number;
};

export type ZhihuTask = {
  taskId: string;
  taskStatus: string;
  progress: number;
  result: ZhihuTaskResult | null;
  error: { code: string; message: string } | null;
};

export const ZHIHU_ENDPOINTS = {
  quota: "https://developer.zhihu.com/api/v1/quota",
  hotList: "https://developer.zhihu.com/api/v1/content/hot_list",
  globalSearch: "https://developer.zhihu.com/api/v1/content/global_search",
  zhihuSearch: "https://developer.zhihu.com/api/v1/content/zhihu_search",
  zhida: "https://developer.zhihu.com/v1/chat/completions",
  files: "https://developer.zhihu.com/resources/v1/files",
  pdfTasks: "https://developer.zhihu.com/api/v1/pdf-parse/tasks",
  pptTasks: "https://developer.zhihu.com/api/v1/ppt-generation/tasks",
} as const;

const ERROR_MESSAGES: Record<number, string> = {
  10001: "参数错误",
  20001: "Access Secret 鉴权失败，请检查知乎数据密钥",
  30001: "请求过于频繁，请稍后重试",
  30002: "额度不足",
  40001: "幂等键与请求参数冲突",
  40002: "文件不存在、已过期或不可访问",
  40003: "活跃任务数超限，请等待已有任务完成后再提交",
  90001: "知乎服务内部错误",
};

export class ZhihuError extends Error {
  status: number;
  code?: number;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = "ZhihuError";
    this.status = status;
    this.code = code;
  }
}

export function resolveZhihuSecret(config?: ZhihuConfig) {
  return config?.zhihuAccessSecret?.trim() || process.env.ZHIHU_ACCESS_SECRET?.trim() || "";
}

export function zhihuErrorPayload(error: unknown) {
  if (error instanceof ZhihuError) return { error: error.message, status: error.status };
  return { error: "知乎接口调用失败，请稍后重试", status: 502 };
}

function statusForCode(code: number) {
  if (code === 10001) return 400;
  if (code === 20001) return 401;
  if (code === 30001 || code === 30002 || code === 40003) return 429;
  if (code === 40001) return 409;
  if (code === 40002) return 404;
  return 502;
}

function zhihuHeaders(secret: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${secret}`,
    "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
    ...extra,
  };
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function mapSearchItem(item: Record<string, unknown>): ZhihuSearchItem {
  const comments = Array.isArray(item.CommentInfoList) ? item.CommentInfoList : [];
  return {
    title: asString(item.Title),
    contentType: asString(item.ContentType),
    contentId: asString(item.ContentID),
    contentText: asString(item.ContentText),
    url: asString(item.Url),
    commentCount: asNumber(item.CommentCount),
    voteUpCount: asNumber(item.VoteUpCount),
    authorName: asString(item.AuthorName),
    authorAvatar: asString(item.AuthorAvatar),
    authorBadge: asString(item.AuthorBadge),
    authorBadgeText: asString(item.AuthorBadgeText),
    editTime: asNumber(item.EditTime),
    commentInfoList: comments.map((comment) => ({ content: asString((comment as { Content?: unknown }).Content) })),
    authorityLevel: asString(item.AuthorityLevel),
    rankingScore: item.RankingScore == null ? undefined : asNumber(item.RankingScore),
  };
}

export async function zhihuRequest<T>(input: {
  url: string;
  secret: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  formData?: FormData;
  extraHeaders?: Record<string, string>;
  method?: "GET" | "POST";
  timeoutMs?: number;
}): Promise<T> {
  const url = new URL(input.url);
  for (const [key, value] of Object.entries(input.query || {})) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const headers = zhihuHeaders(input.secret, input.extraHeaders);
  if (!input.formData) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method: input.method || (input.formData || input.body !== undefined ? "POST" : "GET"),
      headers,
      body: input.formData || (input.body === undefined ? undefined : JSON.stringify(input.body)),
      signal: AbortSignal.timeout(input.timeoutMs ?? 20000),
    });
  } catch (error: any) {
    if (error?.name === "TimeoutError") throw new ZhihuError("知乎接口请求超时，请稍后重试", 504);
    throw new ZhihuError("无法连接知乎开放平台，请检查网络", 502);
  }

  const text = await response.text();
  let payload: { Code?: number; Message?: string; Data?: T; error?: { message?: string } } | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (payload && typeof payload.Code === "number") {
    if (payload.Code !== 0) {
      const mapped = ERROR_MESSAGES[payload.Code];
      const message = payload.Code === 10001 && payload.Message?.trim() ? payload.Message : mapped || payload.Message || "知乎接口调用失败";
      throw new ZhihuError(message, statusForCode(payload.Code), payload.Code);
    }
    return payload.Data as T;
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.Message;
    if (response.status === 401 || response.status === 403) {
      throw new ZhihuError("Access Secret 鉴权失败，请检查知乎数据密钥", 401, 20001);
    }
    throw new ZhihuError(typeof message === "string" && message.trim() ? message : `知乎接口请求失败（${response.status}）`, response.status >= 400 && response.status < 500 ? response.status : 502);
  }

  throw new ZhihuError("知乎接口返回了无法解析的响应", 502);
}

export async function fetchZhihuQuota(secret: string, apiIds?: string) {
  const data = await zhihuRequest<Array<Record<string, unknown>>>({
    url: ZHIHU_ENDPOINTS.quota,
    secret,
    query: apiIds ? { APIIDs: apiIds } : undefined,
  });
  const items = (Array.isArray(data) ? data : []).map((item) => ({
    apiId: asString(item.APIID),
    apiName: asString(item.APIName),
    totalQuota: asNumber(item.TotalQuota),
    totalUsed: asNumber(item.TotalUsed),
    remainingQuota: asNumber(item.RemainingQuota),
  }));
  const featured = ["global_search", "zhihu_search", "hot_list", "zhida_openai", "tools"];
  return items.sort((left, right) => {
    const leftIndex = featured.indexOf(left.apiId);
    const rightIndex = featured.indexOf(right.apiId);
    if (leftIndex === -1 && rightIndex === -1) return 0;
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

export async function fetchZhihuHotList(secret: string, limit: number) {
  const data = await zhihuRequest<{ Total?: number; Items?: Array<Record<string, unknown>> }>({
    url: ZHIHU_ENDPOINTS.hotList,
    secret,
    query: { Limit: limit },
  });
  return {
    total: asNumber(data?.Total),
    items: (data?.Items || []).map((item) => ({
      title: asString(item.Title),
      url: asString(item.Url),
      thumbnailUrl: asString(item.ThumbnailUrl),
      summary: asString(item.Summary),
    })),
  };
}

export async function fetchZhihuGlobalSearch(secret: string, input: { query: string; count: number; searchDB?: string; filter?: string }) {
  const data = await zhihuRequest<{ HasMore?: boolean; Items?: Array<Record<string, unknown>> }>({
    url: ZHIHU_ENDPOINTS.globalSearch,
    secret,
    query: {
      Query: input.query,
      Count: input.count,
      SearchDB: input.searchDB,
      Filter: input.filter,
    },
    timeoutMs: 30000,
  });
  return {
    hasMore: Boolean(data?.HasMore),
    items: (data?.Items || []).map(mapSearchItem),
  };
}

export async function fetchZhihuSearch(secret: string, input: { query: string; count: number; sortBy?: string }) {
  const data = await zhihuRequest<{ HasMore?: boolean; SearchHashId?: string; EmptyReason?: string; Items?: Array<Record<string, unknown>> }>({
    url: ZHIHU_ENDPOINTS.zhihuSearch,
    secret,
    query: {
      Query: input.query,
      Count: input.count,
      SortBy: input.sortBy,
    },
    timeoutMs: 30000,
  });
  return {
    hasMore: Boolean(data?.HasMore),
    searchHashId: asString(data?.SearchHashId),
    emptyReason: asString(data?.EmptyReason),
    items: (data?.Items || []).map(mapSearchItem),
  };
}

export async function zhidaChat(input: {
  secret: string;
  model: string;
  messages: ZhihuMessage[];
  stream: boolean;
}) {
  let response: Response;
  try {
    response = await fetch(ZHIHU_ENDPOINTS.zhida, {
      method: "POST",
      headers: zhihuHeaders(input.secret, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        stream: input.stream,
      }),
      signal: AbortSignal.timeout(180000),
    });
  } catch (error: any) {
    if (error?.name === "TimeoutError") throw new ZhihuError("直答请求超时，请稍后重试", 504);
    throw new ZhihuError("无法连接知乎直答服务，请检查网络", 502);
  }
  return response;
}

export async function parseZhidaResponse(response: Response) {
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.Message;
    if (response.status === 401 || response.status === 403) {
      throw new ZhihuError("Access Secret 鉴权失败，请检查知乎数据密钥", 401, 20001);
    }
    throw new ZhihuError(typeof message === "string" && message.trim() ? message : `直答请求失败（${response.status}）`, response.status >= 400 && response.status < 500 ? response.status : 502);
  }
  if (payload?.error?.message) throw new ZhihuError(payload.error.message, 502);
  const message = payload?.choices?.[0]?.message || {};
  return {
    id: asString(payload?.id),
    model: asString(payload?.model),
    content: asString(message.content),
    reasoning: asString(message.reasoning_content),
  };
}

export function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function mapTask(data: Record<string, unknown> | null | undefined): ZhihuTask {
  const result = data?.result && typeof data.result === "object" ? data.result as Record<string, unknown> : null;
  const error = data?.error && typeof data.error === "object" ? data.error as Record<string, unknown> : null;
  return {
    taskId: asString(data?.task_id),
    taskStatus: asString(data?.task_status),
    progress: asNumber(data?.progress),
    result: result ? {
      url: asString(result.url),
      summary: asString(result.summary) || undefined,
      expiresAtMs: result.expires_at_ms == null ? undefined : asNumber(result.expires_at_ms),
    } : null,
    error: error ? { code: asString(error.code), message: asString(error.message) } : null,
  };
}

export async function uploadZhihuFile(secret: string, file: Blob, filename: string) {
  const formData = new FormData();
  formData.append("file", file, filename);
  const data = await zhihuRequest<Record<string, unknown>>({
    url: ZHIHU_ENDPOINTS.files,
    secret,
    formData,
    timeoutMs: 120000,
  });
  const fileId = asString(data?.file_id);
  if (!fileId) throw new ZhihuError("文件上传成功但未返回 file_id", 502);
  return { fileId };
}

export async function createPdfParseTask(secret: string, fileId: string, idempotencyKey?: string) {
  return mapTask(await zhihuRequest<Record<string, unknown>>({
    url: ZHIHU_ENDPOINTS.pdfTasks,
    secret,
    body: { file_id: fileId },
    extraHeaders: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  }));
}

export async function fetchPdfParseTask(secret: string, taskId: string) {
  return mapTask(await zhihuRequest<Record<string, unknown>>({
    url: `${ZHIHU_ENDPOINTS.pdfTasks}/${encodeURIComponent(taskId)}`,
    secret,
  }));
}

export async function createPptTask(secret: string, resourceUrl: string, numPages: number, idempotencyKey?: string) {
  return mapTask(await zhihuRequest<Record<string, unknown>>({
    url: ZHIHU_ENDPOINTS.pptTasks,
    secret,
    body: { resource_url: resourceUrl, num_pages: numPages },
    extraHeaders: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  }));
}

export async function fetchPptTask(secret: string, taskId: string) {
  return mapTask(await zhihuRequest<Record<string, unknown>>({
    url: `${ZHIHU_ENDPOINTS.pptTasks}/${encodeURIComponent(taskId)}`,
    secret,
  }));
}

export async function fetchSignedJson(url: string) {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  } catch (error: any) {
    if (error?.name === "TimeoutError") throw new ZhihuError("解析结果下载超时，请稍后重试", 504);
    throw new ZhihuError("无法下载解析结果", 502);
  }
  if (!response.ok) throw new ZhihuError(`解析结果下载失败（${response.status}）`, 502);
  try {
    return await response.json();
  } catch {
    throw new ZhihuError("解析结果不是有效的 JSON", 502);
  }
}
