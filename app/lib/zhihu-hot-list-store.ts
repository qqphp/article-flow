import { getDatabase } from "./database";

export const HOT_LIST_CACHE_TTL_MS = 15 * 60 * 1000;

export type ZhihuHotListItem = {
  title: string;
  url: string;
  thumbnailUrl: string;
  summary: string;
};

export type ZhihuHotListCache = {
  limit: number;
  total: number;
  items: ZhihuHotListItem[];
  fetchedAt: number;
};

export function readZhihuHotListCache(limit: number): ZhihuHotListCache | null {
  const database = getDatabase();
  const row = database.prepare(
    "SELECT limit_count, total, items_json, fetched_at FROM zhihu_hot_list_cache WHERE limit_count = ?"
  ).get(limit) as { limit_count: number; total: number; items_json: string; fetched_at: number } | undefined;
  if (!row) return null;
  try {
    const items = JSON.parse(row.items_json);
    if (!Array.isArray(items)) return null;
    return {
      limit: row.limit_count,
      total: row.total,
      items,
      fetchedAt: row.fetched_at,
    };
  } catch {
    return null;
  }
}

export function writeZhihuHotListCache(input: {
  limit: number;
  total: number;
  items: ZhihuHotListItem[];
  fetchedAt?: number;
}): ZhihuHotListCache {
  const fetchedAt = input.fetchedAt ?? Date.now();
  const database = getDatabase();
  database.prepare(`
    INSERT INTO zhihu_hot_list_cache (limit_count, total, items_json, fetched_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(limit_count) DO UPDATE SET
      total = excluded.total,
      items_json = excluded.items_json,
      fetched_at = excluded.fetched_at
  `).run(input.limit, input.total, JSON.stringify(input.items), fetchedAt);
  return {
    limit: input.limit,
    total: input.total,
    items: input.items,
    fetchedAt,
  };
}

export function isZhihuHotListCacheFresh(fetchedAt: number, now = Date.now()) {
  return now - fetchedAt < HOT_LIST_CACHE_TTL_MS;
}
