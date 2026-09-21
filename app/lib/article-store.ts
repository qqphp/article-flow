import { promises as fs } from "fs";
import path from "path";
import { getDataDirectory, getDatabase, resolveDataPath, toStoredDataPath } from "./database";
import { readMaterialFile, saveGeneratedMaterial } from "./material-store";
import { assertPublicHttpUrl, isDataImageUrl } from "./public-url";
import { mergeSignals, throwIfAborted } from "./abort";
import { countArticleWords } from "./word-count";

export type ResearchSource = { title?: string; url: string; description?: string };
export type ParagraphImage = { url?: string; filePath?: string; anchor?: string; prompt: string; error?: string };
export type CoverImage = { url?: string; filePath?: string; prompt: string; error?: string };
export type PublishStatus = "未发布" | "已创建草稿" | "已发布";

type ArticleRecord = {
  id: string;
  title: string;
  topic: string;
  style: string;
  directory: string;
  markdown_path: string;
  sources_path: string;
  cover_path?: string | null;
  humanized_markdown_path?: string | null;
  layout_markdown_path?: string | null;
  cover_image_url?: string | null;
  cover_prompt?: string | null;
  cover_error?: string | null;
  paragraph_image_urls?: string | null;
  paragraph_image_plans?: string | null;
  alternative_titles?: string | null;
  publish_status: PublishStatus;
  published_at?: string | null;
  wechat_draft_media_id?: string | null;
  word_count?: number | null;
  selected_title?: string | null;
  created_at: string;
};

function asPublishStatus(value?: string | null): PublishStatus {
  if (value === "已发布" || value === "已创建草稿") return value;
  return "未发布";
}

const articlesDirectory = path.join(getDataDirectory(), "articles");

function createArticleId(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "article";
  return `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

function markdownDocument(article: Pick<ArticleRecord, "title" | "topic" | "style" | "created_at">, content: string, kind: string) {
  const metadata = [
    "---",
    `title: ${JSON.stringify(article.title)}`,
    `topic: ${JSON.stringify(article.topic)}`,
    `style: ${JSON.stringify(article.style)}`,
    `kind: ${kind}`,
    `createdAt: ${article.created_at}`,
    "---",
  ].join("\n");
  return `${metadata}\n\n# ${article.title}\n\n${content.trim()}\n`;
}

function markdownBody(markdown: string, title: string) {
  const withoutMetadata = markdown.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/, "").trim();
  const lines = withoutMetadata.split(/\r?\n/);
  if (lines[0]?.trim() === `# ${title}`) lines.shift();
  return lines.join("\n").trim();
}

function parseJsonArray(value?: string | null) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseParagraphImagePlans(value?: string | null): ParagraphImage[] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object" || typeof item.prompt !== "string" || !item.prompt.trim()) return [];
      const filePath = typeof item.filePath === "string" ? resolveDataPath(item.filePath) || undefined : undefined;
      return [{ ...item, filePath } as ParagraphImage];
    });
  } catch {
    return [];
  }
}

function hydrateArticleRecord(row: ArticleRecord): ArticleRecord {
  return {
    ...row,
    directory: resolveDataPath(row.directory) || "",
    markdown_path: resolveDataPath(row.markdown_path) || "",
    sources_path: resolveDataPath(row.sources_path) || "",
    cover_path: resolveDataPath(row.cover_path),
    humanized_markdown_path: resolveDataPath(row.humanized_markdown_path),
    layout_markdown_path: resolveDataPath(row.layout_markdown_path),
  };
}

function storedImage(image: ParagraphImage): ParagraphImage {
  return image.filePath ? { ...image, filePath: toStoredDataPath(image.filePath) } : image;
}

function getArticleRecord(articleId: string) {
  const row = getDatabase().prepare("SELECT * FROM articles WHERE id = ?").get(articleId) as ArticleRecord | undefined;
  return row ? hydrateArticleRecord(row) : undefined;
}

async function readOptionalFile(filePath?: string | null) {
  if (!filePath) return null;
  try { return await fs.readFile(filePath, "utf8"); } catch { return null; }
}

function assetUrl(articleId: string, filePath: string) {
  return `/api/articles/${encodeURIComponent(articleId)}/assets/${encodeURIComponent(path.basename(filePath))}`;
}

function browserMarkdown(articleId: string, markdown: string) {
  return markdown.replace(/(!\[[^\]]*\]\()(?:(?:\.\/)?assets\/)([^\s)]+)(\))/g, (_match, prefix, assetName, suffix) =>
    `${prefix}/api/articles/${encodeURIComponent(articleId)}/assets/${encodeURIComponent(decodeURIComponent(assetName))}${suffix}`);
}

function sourcesPayload(input: { topic: string; sources: ResearchSource[]; search?: { searched: boolean; error?: string } }, searchedAt: string) {
  return JSON.stringify({ topic: input.topic, searchedAt, sources: input.sources, searched: Boolean(input.search?.searched), error: input.search?.error || null }, null, 2);
}

async function clearArticleAssetFiles(directory: string) {
  const root = path.resolve(articlesDirectory);
  const articleDir = path.resolve(directory);
  const relativeDir = path.relative(root, articleDir);
  if (!relativeDir || relativeDir.startsWith("..") || path.isAbsolute(relativeDir)) return;
  const assetsDirectory = path.resolve(articleDir, "assets");
  const relativeAssets = path.relative(articleDir, assetsDirectory);
  if (!relativeAssets || relativeAssets.startsWith("..") || path.isAbsolute(relativeAssets)) return;
  const entries = await fs.readdir(assetsDirectory).catch(() => [] as string[]);
  await Promise.all(entries.map((filename) => {
    if (path.basename(filename) !== filename) return Promise.resolve();
    return fs.unlink(path.join(assetsDirectory, filename)).catch(() => undefined);
  }));
}

export async function saveGeneratedArticle(input: { title: string; topic: string; style: string; content: string; sources: ResearchSource[]; alternatives?: string[]; search?: { searched: boolean; error?: string }; articleId?: string }) {
  const alternatives = JSON.stringify(input.alternatives || []);
  const wordCount = countArticleWords(input.content);
  if (input.articleId) {
    const existing = getArticleRecord(input.articleId);
    if (!existing) {
      const error = new Error("文章不存在，无法覆盖生成");
      (error as Error & { status?: number }).status = 404;
      throw error;
    }
    if (asPublishStatus(existing.publish_status) === "已发布") {
      const error = new Error("已发布文章不能覆盖生成，请新建后再试");
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    const meta = { title: input.title, topic: input.topic, style: input.style, created_at: existing.created_at };
    await Promise.all([
      fs.writeFile(existing.markdown_path, markdownDocument(meta, input.content, "original"), "utf8"),
      fs.writeFile(existing.sources_path, sourcesPayload(input, new Date().toISOString()), "utf8"),
    ]);
    if (existing.humanized_markdown_path) await fs.unlink(existing.humanized_markdown_path).catch(() => undefined);
    if (existing.layout_markdown_path) await fs.unlink(existing.layout_markdown_path).catch(() => undefined);
    await clearArticleAssetFiles(existing.directory);
    const result = getDatabase().prepare(`UPDATE articles
      SET title = ?, topic = ?, style = ?, alternative_titles = ?, selected_title = ?, word_count = ?,
          humanized_markdown_path = NULL, layout_markdown_path = NULL,
          cover_path = NULL, cover_image_url = NULL, cover_prompt = NULL, cover_error = NULL,
          paragraph_image_urls = '[]', paragraph_image_plans = '[]',
          publish_status = '未发布', wechat_draft_media_id = NULL, published_at = NULL
      WHERE id = ? AND publish_status != '已发布'`).run(
      input.title, input.topic, input.style, alternatives, input.title, wordCount, existing.id,
    );
    if (!result.changes) {
      const error = new Error("已发布文章不能覆盖生成，请新建后再试");
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    return { id: existing.id, directory: existing.directory };
  }

  const id = createArticleId(input.title);
  const directory = path.join(articlesDirectory, id);
  const markdownPath = path.join(directory, "article.md");
  const sourcesPath = path.join(directory, "sources.json");
  const createdAt = new Date().toISOString();
  const article = { title: input.title, topic: input.topic, style: input.style, created_at: createdAt };

  await fs.mkdir(path.join(directory, "assets"), { recursive: true });
  await Promise.all([
    fs.writeFile(markdownPath, markdownDocument(article, input.content, "original"), "utf8"),
    fs.writeFile(sourcesPath, sourcesPayload(input, createdAt), "utf8"),
  ]);
  getDatabase().prepare(`INSERT INTO articles (id, title, topic, style, directory, markdown_path, sources_path, alternative_titles, selected_title, publish_status, created_at, word_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.title, input.topic, input.style, toStoredDataPath(directory), toStoredDataPath(markdownPath), toStoredDataPath(sourcesPath), alternatives, input.title, "未发布", createdAt, wordCount);
  return { id, directory };
}

export async function readArticle(articleId: string) {
  const article = getArticleRecord(articleId);
  if (!article) return null;
  const [original, humanized, layout, sourcesFile] = await Promise.all([
    readOptionalFile(article.markdown_path),
    readOptionalFile(article.humanized_markdown_path),
    readOptionalFile(article.layout_markdown_path),
    readOptionalFile(article.sources_path),
  ]);
  if (!original) return null;
  let sources: ResearchSource[] = [];
  let firecrawlSearched = false;
  let firecrawlError: string | null = null;
  try {
    const parsed = JSON.parse(sourcesFile || "{}");
    if (Array.isArray(parsed.sources)) sources = parsed.sources;
    firecrawlSearched = parsed.searched === true || sources.length > 0;
    if (typeof parsed.error === "string" && parsed.error.trim()) firecrawlError = parsed.error.trim();
  } catch { /* A damaged sources file must not hide the article. */ }
  const paragraphPlans = parseParagraphImagePlans(article.paragraph_image_plans);
  const paragraphImageUrls = parseJsonArray(article.paragraph_image_urls);
  return {
    articleId: article.id,
    title: article.title,
    selectedTitle: article.selected_title || article.title,
    topic: article.topic,
    style: article.style,
    alternatives: parseJsonArray(article.alternative_titles),
    content: markdownBody(original, article.title),
    humanizedContent: humanized ? markdownBody(humanized, article.title) : null,
    layoutContent: layout ? browserMarkdown(article.id, markdownBody(layout, article.title)) : null,
    imageUrl: article.cover_image_url || null,
    coverPrompt: article.cover_prompt || null,
    coverError: article.cover_error || null,
    paragraphImages: paragraphPlans.length ? paragraphPlans.map(({ url, anchor, prompt, error }) => ({ url, anchor, prompt, error })) : paragraphImageUrls.map((url) => ({ url, prompt: "" })),
    sources,
    firecrawlSearched,
    firecrawlError,
    createdAt: article.created_at,
    publishStatus: asPublishStatus(article.publish_status),
    publishedAt: article.published_at || null,
  };
}

export type RecentArticleCard = {
  articleId: string;
  title: string;
  style: string;
  status: string;
  coverUrl: string | null;
  wordCount: number;
  imageCount: number;
  createdAt: string;
};

export type ArticleQueueItem = {
  articleId: string;
  title: string;
  style: string;
  publishStatus: PublishStatus;
  coverUrl: string | null;
  createdAt: string;
};

export type ArticlePublishStats = {
  cumulativePublished: number;
  monthlyPublished: number;
  weeklyPublished: number;
  todayPublished: number;
  pending: number;
  totalArticles: number;
  monthlyArticles: number;
};

async function pathExists(filePath?: string | null) {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function wordCountForCard(article: ArticleRecord) {
  const stored = Number(article.word_count || 0);
  if (stored > 0) return stored;
  const preferredPath = (article.humanized_markdown_path && await pathExists(article.humanized_markdown_path))
    ? article.humanized_markdown_path
    : article.markdown_path;
  const markdown = await readOptionalFile(preferredPath);
  if (!markdown) return null;
  const wordCount = countArticleWords(markdownBody(markdown, article.title));
  getDatabase().prepare("UPDATE articles SET word_count = ? WHERE id = ?").run(wordCount, article.id);
  return wordCount;
}

export async function listRecentArticles(limit = 3): Promise<RecentArticleCard[]> {
  const safeLimit = Math.min(12, Math.max(1, Math.round(limit) || 3));
  const rows = getDatabase().prepare(`
    SELECT id, title, selected_title, style, cover_image_url, cover_path, paragraph_image_urls, paragraph_image_plans,
           humanized_markdown_path, markdown_path, word_count, created_at
    FROM articles
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(safeLimit * 2, 8)) as ArticleRecord[];
  const hydrated = rows.map(hydrateArticleRecord);

  const cards: RecentArticleCard[] = [];
  for (const article of hydrated) {
    if (cards.length >= safeLimit) break;
    if (!(await pathExists(article.markdown_path))) continue;
    const wordCount = await wordCountForCard(article);
    if (wordCount == null) continue;
    const paragraphUrls = parseJsonArray(article.paragraph_image_urls);
    const paragraphPlans = parseParagraphImagePlans(article.paragraph_image_plans);
    const paragraphCount = paragraphUrls.length || paragraphPlans.filter((image) => Boolean(image.url)).length;
    const hasCoverFile = await pathExists(article.cover_path);
    const coverUrl = hasCoverFile ? (article.cover_image_url || null) : null;
    const imageCount = (coverUrl ? 1 : 0) + paragraphCount;
    const status = imageCount > 0 ? "已配图" : article.humanized_markdown_path ? "已去痕" : "已生成";
    cards.push({
      articleId: article.id,
      title: article.selected_title || article.title,
      style: article.style,
      status,
      coverUrl,
      wordCount,
      imageCount,
      createdAt: article.created_at,
    });
  }
  return cards;
}

export async function listArticleQueue(requestedPage = 1) {
  const pageSize = 8;
  const total = Number((getDatabase().prepare("SELECT COUNT(*) AS count FROM articles").get() as { count: number }).count || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.round(requestedPage) || 1));
  const rows = getDatabase().prepare(`
    SELECT id, title, selected_title, style, cover_path, cover_image_url, publish_status, created_at
    FROM articles
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, (page - 1) * pageSize) as ArticleRecord[];
  const hydrated = rows.map(hydrateArticleRecord);

  const articles = await Promise.all(hydrated.map(async (article): Promise<ArticleQueueItem> => {
    const hasCover = await pathExists(article.cover_path);
    return {
      articleId: article.id,
      title: article.selected_title || article.title,
      style: article.style,
      publishStatus: asPublishStatus(article.publish_status),
      coverUrl: hasCover && article.cover_path ? article.cover_image_url || assetUrl(article.id, article.cover_path) : null,
      createdAt: article.created_at,
    };
  }));
  return { articles, page, pageSize, total, totalPages };
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiPeriodStart(period: "day" | "week" | "month", now = new Date()) {
  const shanghaiNow = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const year = shanghaiNow.getUTCFullYear();
  const month = shanghaiNow.getUTCMonth();
  const day = shanghaiNow.getUTCDate();
  const weekdayOffset = (shanghaiNow.getUTCDay() + 6) % 7;
  const startDay = period === "week" ? day - weekdayOffset : period === "month" ? 1 : day;
  return new Date(Date.UTC(year, month, startDay) - SHANGHAI_OFFSET_MS).toISOString();
}

export function getArticlePublishStats(now = new Date()): ArticlePublishStats {
  const dayStart = shanghaiPeriodStart("day", now);
  const weekStart = shanghaiPeriodStart("week", now);
  const monthStart = shanghaiPeriodStart("month", now);
  const row = getDatabase().prepare(`
    SELECT
      COUNT(*) AS total_articles,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS monthly_articles,
      SUM(CASE WHEN publish_status = '已发布' THEN 1 ELSE 0 END) AS cumulative_published,
      SUM(CASE WHEN publish_status = '已发布' AND published_at >= ? THEN 1 ELSE 0 END) AS monthly_published,
      SUM(CASE WHEN publish_status = '已发布' AND published_at >= ? THEN 1 ELSE 0 END) AS weekly_published,
      SUM(CASE WHEN publish_status = '已发布' AND published_at >= ? THEN 1 ELSE 0 END) AS today_published,
      SUM(CASE WHEN publish_status != '已发布' THEN 1 ELSE 0 END) AS pending
    FROM articles
  `).get(monthStart, monthStart, weekStart, dayStart) as Record<string, number | null>;
  return {
    cumulativePublished: Number(row.cumulative_published || 0),
    monthlyPublished: Number(row.monthly_published || 0),
    weeklyPublished: Number(row.weekly_published || 0),
    todayPublished: Number(row.today_published || 0),
    pending: Number(row.pending || 0),
    totalArticles: Number(row.total_articles || 0),
    monthlyArticles: Number(row.monthly_articles || 0),
  };
}

export function getArticlePublishSnapshot(articleId: string) {
  const article = getArticleRecord(articleId);
  if (!article) return null;
  return {
    publishStatus: asPublishStatus(article.publish_status),
    publishedAt: article.published_at || null,
    wechatDraftMediaId: article.wechat_draft_media_id || null,
  };
}

export function updateSelectedTitle(articleId: string, selectedTitle: string) {
  const title = selectedTitle.trim();
  if (!title) return false;
  const result = getDatabase().prepare(`
    UPDATE articles SET selected_title = ? WHERE id = ?
  `).run(title, articleId);
  return result.changes > 0;
}

export function clearWechatDraft(articleId: string) {
  const result = getDatabase().prepare(`
    UPDATE articles
    SET wechat_draft_media_id = NULL, publish_status = '未发布', published_at = NULL
    WHERE id = ? AND publish_status = '已创建草稿'
  `).run(articleId);
  return result.changes > 0;
}

export function markArticleDraftCreated(articleId: string, mediaId: string) {
  const result = getDatabase().prepare(`
    UPDATE articles
    SET publish_status = '已创建草稿', wechat_draft_media_id = ?, published_at = NULL
    WHERE id = ? AND publish_status IN ('未发布', '已创建草稿')
  `).run(mediaId, articleId);
  return result.changes > 0;
}

export function markArticlePublished(articleId: string) {
  const result = getDatabase().prepare(`
    UPDATE articles
    SET publish_status = '已发布', published_at = ?
    WHERE id = ? AND publish_status IN ('未发布', '已创建草稿')
  `).run(new Date().toISOString(), articleId);
  return result.changes > 0;
}

export async function deleteStoredArticle(articleId: string) {
  const article = getArticleRecord(articleId);
  if (!article) return false;
  const root = path.resolve(articlesDirectory);
  const directory = path.resolve(article.directory);
  const relativeDirectory = path.relative(root, directory);
  if (!relativeDirectory || relativeDirectory.startsWith("..") || path.isAbsolute(relativeDirectory)) {
    throw new Error("文章目录不在允许删除的范围内");
  }
  await fs.rm(directory, { recursive: true, force: true });
  getDatabase().prepare("DELETE FROM articles WHERE id = ?").run(articleId);
  return true;
}

export async function readArticleSource(articleId: string, preferHumanized = true) {
  const article = getArticleRecord(articleId);
  if (!article) return null;
  const filePath = preferHumanized && article.humanized_markdown_path ? article.humanized_markdown_path : article.markdown_path;
  const markdown = await readOptionalFile(filePath);
  return markdown ? { article, filePath, content: markdownBody(markdown, article.title) } : null;
}

export async function saveHumanizedArticle(articleId: string, content: string) {
  const article = getArticleRecord(articleId);
  if (!article) return null;
  const filePath = path.join(article.directory, "humanized.md");
  await fs.writeFile(filePath, markdownDocument(article, content, "humanized"), "utf8");
  await clearArticleAssetFiles(article.directory);
  getDatabase().prepare(`UPDATE articles
    SET humanized_markdown_path = ?, layout_markdown_path = NULL, cover_path = NULL,
        cover_image_url = NULL, cover_prompt = NULL, cover_error = NULL,
        paragraph_image_urls = '[]', paragraph_image_plans = '[]', word_count = ?
    WHERE id = ?`).run(toStoredDataPath(filePath), countArticleWords(content), articleId);
  const saved = await fs.readFile(filePath, "utf8");
  return markdownBody(saved, article.title);
}

export async function beginArticleImageGeneration(articleId: string, coverPrompt: string, images: ParagraphImage[]) {
  const article = getArticleRecord(articleId);
  if (!article) return null;
  getDatabase().prepare(`UPDATE articles
    SET layout_markdown_path = NULL, cover_path = NULL, cover_image_url = ?,
        cover_prompt = ?, cover_error = NULL, paragraph_image_urls = '[]', paragraph_image_plans = ?
    WHERE id = ?`).run(null, coverPrompt, JSON.stringify(images.map(({ prompt, anchor }) => ({ prompt, anchor }))), articleId);
  return article;
}

export async function readArticleImageState(articleId: string) {
  const article = getArticleRecord(articleId);
  if (!article?.cover_prompt) return null;
  return {
    cover: {
      prompt: article.cover_prompt,
      url: article.cover_image_url || undefined,
      filePath: article.cover_path || undefined,
      error: article.cover_error || undefined,
    } satisfies CoverImage,
    paragraphImages: parseParagraphImagePlans(article.paragraph_image_plans),
  };
}

function insertParagraphImages(content: string, images: ParagraphImage[], directory: string) {
  const blocks = content.trim().split(/\r?\n\s*\r?\n/).filter(Boolean);
  const imagesByBlock = new Map<number, Array<{ image: ParagraphImage & { url: string; filePath: string }; index: number }>>();
  const usedBlocks = new Set<number>();
  const generatedImages = images.filter((image): image is ParagraphImage & { url: string; filePath: string } => Boolean(image.url && image.filePath));
  generatedImages.forEach((image, index) => {
    const matched = image.anchor ? blocks.findIndex((block, blockIndex) => !usedBlocks.has(blockIndex) && block.includes(image.anchor || "")) : -1;
    const fallback = Math.min(blocks.length - 1, Math.max(0, Math.floor(((index + 1) * blocks.length) / (images.length + 1))));
    const blockIndex = matched >= 0 ? matched : fallback;
    usedBlocks.add(blockIndex);
    imagesByBlock.set(blockIndex, [...(imagesByBlock.get(blockIndex) || []), { image, index }]);
  });
  return blocks.map((block, blockIndex) => {
    const additions = (imagesByBlock.get(blockIndex) || []).map(({ image, index }) => {
      const relativePath = path.relative(directory, image.filePath).split(path.sep).join("/");
      return `![段落配图 ${index + 1}](${relativePath})`;
    });
    return [block, ...additions].join("\n\n");
  }).join("\n\n");
}

export async function saveArticleLayout(articleId: string, content: string, cover: CoverImage, images: ParagraphImage[]) {
  const article = getArticleRecord(articleId);
  if (!article) return null;
  const filePath = path.join(article.directory, "preview.md");
  const layout = insertParagraphImages(content, images, article.directory);
  await fs.writeFile(filePath, markdownDocument(article, layout, "layout-preview"), "utf8");
  const paragraphUrls = images.flatMap((image) => image.url ? [image.url] : []);
  getDatabase().prepare(`UPDATE articles
    SET cover_path = ?, cover_image_url = ?, cover_prompt = ?, cover_error = ?,
        paragraph_image_urls = ?, paragraph_image_plans = ?, layout_markdown_path = ?
    WHERE id = ?`).run(cover.filePath ? toStoredDataPath(cover.filePath) : null, cover.url || null, cover.prompt, cover.error || null,
      JSON.stringify(paragraphUrls), JSON.stringify(images.map(storedImage)), toStoredDataPath(filePath), articleId);
  const saved = await fs.readFile(filePath, "utf8");
  return browserMarkdown(articleId, markdownBody(saved, article.title));
}

function extensionFrom(contentType: string | null, sourceUrl: string) {
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  if (contentType?.includes("webp")) return ".webp";
  const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].includes(extension) ? extension : ".png";
}

function bytesFromDataImageUrl(sourceUrl: string) {
  const match = sourceUrl.trim().match(/^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) throw new Error("图片数据无效");
  return { bytes: Buffer.from(match[2].replace(/\s+/g, ""), "base64"), extension: match[1].toLowerCase() === "jpeg" || match[1].toLowerCase() === "jpg" ? ".jpg" : match[1].toLowerCase() === "webp" ? ".webp" : ".png" };
}

export async function saveArticleImage(articleId: string, sourceUrl: string, name = "cover", signal?: AbortSignal) {
  const article = getArticleRecord(articleId);
  if (!article?.directory) return null;
  throwIfAborted(signal);
  const safeName = name.replace(/[^a-z0-9-_]/gi, "-") || "image";
  let bytes: Buffer;
  let extension: string;
  if (isDataImageUrl(sourceUrl)) {
    const parsed = bytesFromDataImageUrl(sourceUrl);
    bytes = parsed.bytes;
    extension = parsed.extension;
  } else {
    await assertPublicHttpUrl(sourceUrl, "图片地址");
    throwIfAborted(signal);
    const response = await fetch(sourceUrl, { signal: mergeSignals(30000, signal), redirect: "error" });
    if (!response.ok) throw new Error("无法下载生成的图片");
    bytes = Buffer.from(await response.arrayBuffer());
    extension = extensionFrom(response.headers.get("content-type"), sourceUrl);
  }
  const filePath = path.join(article.directory, "assets", `${safeName}${extension}`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
  await saveGeneratedMaterial(filePath);
  if (safeName === "cover") {
    getDatabase().prepare("UPDATE articles SET cover_path = ?, cover_image_url = ? WHERE id = ?")
      .run(toStoredDataPath(filePath), assetUrl(articleId, filePath), articleId);
  }
  return filePath;
}

export async function replaceArticleImageWithMaterial(articleId: string, target: { type: "cover" } | { type: "paragraph"; index: number }, materialId: string) {
  const article = getArticleRecord(articleId);
  if (!article?.directory) return null;
  const material = await readMaterialFile(materialId);
  if (!material) throw new Error("素材不存在或文件无法读取");
  const expectedType = target.type === "cover" ? "cover" : "paragraph";
  if (material.asset.type !== expectedType) throw new Error(target.type === "cover" ? "只能使用封面图素材替换封面" : "只能使用段落配图素材替换段落图");
  const imageState = await readArticleImageState(articleId);
  if (!imageState) throw new Error("请先生成封面与配图");
  if (target.type === "paragraph" && (!Number.isInteger(target.index) || target.index < 0 || target.index >= imageState.paragraphImages.length)) {
    throw new Error("段落配图不存在");
  }
  const source = await readArticleSource(articleId, true);
  if (!source?.content.trim()) throw new Error("文章 Markdown 文件不存在或内容为空");
  const assetsDirectory = path.join(article.directory, "assets");
  const name = target.type === "cover" ? "cover" : `paragraph-${target.index + 1}`;
  const existing = await fs.readdir(assetsDirectory).catch(() => [] as string[]);
  await Promise.all(existing
    .filter((filename) => new RegExp(`^${name}\\.(png|jpg|jpeg|webp)$`, "i").test(filename))
    .map((filename) => fs.unlink(path.join(assetsDirectory, filename))));
  const filePath = path.join(assetsDirectory, `${name}.${material.asset.format}`);
  await fs.copyFile(material.filePath, filePath);
  let cover: CoverImage = imageState.cover;
  const paragraphImages = [...imageState.paragraphImages];
  if (target.type === "cover") {
    cover = { prompt: cover.prompt, filePath, url: articleAssetUrl(articleId, filePath) };
  } else {
    const current = paragraphImages[target.index];
    paragraphImages[target.index] = { prompt: current.prompt, anchor: current.anchor, filePath, url: articleAssetUrl(articleId, filePath) };
  }
  const layout = await saveArticleLayout(articleId, source.content, cover, paragraphImages);
  if (!layout) throw new Error("无法保存排版预览 Markdown");
  return readArticle(articleId);
}

export function articleAssetUrl(articleId: string, filePath: string) {
  return assetUrl(articleId, filePath);
}

export async function resolveArticleAsset(articleId: string, assetName: string) {
  if (path.basename(assetName) !== assetName) return null;
  const article = getArticleRecord(articleId);
  if (!article?.directory) return null;
  const assetsDirectory = path.resolve(article.directory, "assets");
  const filePath = path.resolve(assetsDirectory, assetName);
  if (path.relative(assetsDirectory, filePath).startsWith("..")) return null;
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

export async function readArticleAsset(articleId: string, assetName: string) {
  const filePath = await resolveArticleAsset(articleId, assetName);
  if (!filePath) return null;
  try { return { filePath, data: await fs.readFile(filePath) }; } catch { return null; }
}

export function getArticleCoverPath(articleId: string) {
  const article = getArticleRecord(articleId);
  if (!article?.directory || !article.cover_path) return null;
  const assetsDirectory = path.resolve(article.directory, "assets");
  const filePath = path.resolve(article.cover_path);
  return path.relative(assetsDirectory, filePath).startsWith("..") ? null : filePath;
}

export async function readPublishMarkdown(articleId: string) {
  const article = getArticleRecord(articleId);
  if (!article) return null;
  const filePath = article.layout_markdown_path || article.humanized_markdown_path || article.markdown_path;
  const markdown = await readOptionalFile(filePath);
  return markdown ? { article, filePath, content: markdownBody(markdown, article.title) } : null;
}
