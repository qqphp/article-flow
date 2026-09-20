import { promises as fs } from "fs";
import path from "path";
import { getDatabase } from "./database";
import { readMaterialFile, saveGeneratedMaterial } from "./material-store";

export type ResearchSource = { title?: string; url: string; description?: string };
export type ParagraphImage = { url?: string; filePath?: string; anchor?: string; prompt: string; error?: string };
export type CoverImage = { url?: string; filePath?: string; prompt: string; error?: string };

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
  publish_status: "未发布" | "已发布";
  published_at?: string | null;
  created_at: string;
};

const articlesDirectory = path.join(process.cwd(), "data", "articles");

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
    return Array.isArray(parsed) ? parsed.filter((item): item is ParagraphImage => Boolean(item && typeof item === "object" && typeof item.prompt === "string" && item.prompt.trim())) : [];
  } catch {
    return [];
  }
}

function getArticleRecord(articleId: string) {
  return getDatabase().prepare("SELECT * FROM articles WHERE id = ?").get(articleId) as ArticleRecord | undefined;
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

export async function saveGeneratedArticle(input: { title: string; topic: string; style: string; content: string; sources: ResearchSource[]; alternatives?: string[] }) {
  const id = createArticleId(input.title);
  const directory = path.join(articlesDirectory, id);
  const markdownPath = path.join(directory, "article.md");
  const sourcesPath = path.join(directory, "sources.json");
  const createdAt = new Date().toISOString();
  const article = { title: input.title, topic: input.topic, style: input.style, created_at: createdAt };

  await fs.mkdir(path.join(directory, "assets"), { recursive: true });
  await Promise.all([
    fs.writeFile(markdownPath, markdownDocument(article, input.content, "original"), "utf8"),
    fs.writeFile(sourcesPath, JSON.stringify({ topic: input.topic, searchedAt: createdAt, sources: input.sources }, null, 2), "utf8"),
  ]);
  getDatabase().prepare(`INSERT INTO articles (id, title, topic, style, directory, markdown_path, sources_path, alternative_titles, publish_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.title, input.topic, input.style, directory, markdownPath, sourcesPath, JSON.stringify(input.alternatives || []), "未发布", createdAt);
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
  try {
    const parsed = JSON.parse(sourcesFile || "{}");
    if (Array.isArray(parsed.sources)) sources = parsed.sources;
  } catch { /* A damaged sources file must not hide the article. */ }
  const paragraphPlans = parseParagraphImagePlans(article.paragraph_image_plans);
  const paragraphImageUrls = parseJsonArray(article.paragraph_image_urls);
  return {
    articleId: article.id,
    title: article.title,
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
    firecrawlSearched: sources.length > 0,
    createdAt: article.created_at,
    publishStatus: article.publish_status || "未发布",
    publishedAt: article.published_at || null,
  };
}

export async function readLatestArticle() {
  const row = getDatabase().prepare("SELECT id FROM articles ORDER BY created_at DESC LIMIT 1").get() as { id?: string } | undefined;
  return row?.id ? readArticle(row.id) : null;
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
  publishStatus: "未发布" | "已发布";
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

export async function listRecentArticles(limit = 3): Promise<RecentArticleCard[]> {
  const safeLimit = Math.min(12, Math.max(1, Math.round(limit) || 3));
  const rows = getDatabase().prepare(`
    SELECT id, title, style, cover_image_url, cover_path, paragraph_image_urls, paragraph_image_plans,
           humanized_markdown_path, markdown_path, created_at
    FROM articles
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(safeLimit * 4, 12)) as ArticleRecord[];

  const cards: RecentArticleCard[] = [];
  for (const article of rows) {
    if (cards.length >= safeLimit) break;
    const preferredPath = (article.humanized_markdown_path && await pathExists(article.humanized_markdown_path))
      ? article.humanized_markdown_path
      : article.markdown_path;
    const markdown = await readOptionalFile(preferredPath);
    if (!markdown) continue;
    const content = markdownBody(markdown, article.title);
    const paragraphUrls = parseJsonArray(article.paragraph_image_urls);
    const paragraphPlans = parseParagraphImagePlans(article.paragraph_image_plans);
    const paragraphCount = paragraphUrls.length || paragraphPlans.filter((image) => Boolean(image.url)).length;
    const hasCoverFile = await pathExists(article.cover_path);
    const coverUrl = hasCoverFile ? (article.cover_image_url || null) : null;
    const imageCount = (coverUrl ? 1 : 0) + paragraphCount;
    const status = imageCount > 0 ? "已配图" : article.humanized_markdown_path ? "已去痕" : "已生成";
    cards.push({
      articleId: article.id,
      title: article.title,
      style: article.style,
      status,
      coverUrl,
      wordCount: content.replace(/\s+/g, "").length,
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
    SELECT id, title, style, cover_path, cover_image_url, publish_status, created_at
    FROM articles
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, (page - 1) * pageSize) as ArticleRecord[];

  const articles = await Promise.all(rows.map(async (article): Promise<ArticleQueueItem> => {
    const hasCover = await pathExists(article.cover_path);
    return {
      articleId: article.id,
      title: article.title,
      style: article.style,
      publishStatus: article.publish_status || "未发布",
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
      SUM(CASE WHEN publish_status = '未发布' THEN 1 ELSE 0 END) AS pending
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

export function markArticlePublished(articleId: string) {
  const result = getDatabase().prepare(`
    UPDATE articles
    SET publish_status = '已发布', published_at = ?
    WHERE id = ? AND publish_status = '未发布'
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
  getDatabase().prepare(`UPDATE articles
    SET humanized_markdown_path = ?, layout_markdown_path = NULL, cover_path = NULL,
        cover_image_url = NULL, cover_prompt = NULL, cover_error = NULL,
        paragraph_image_urls = '[]', paragraph_image_plans = '[]'
    WHERE id = ?`).run(filePath, articleId);
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
    WHERE id = ?`).run(cover.filePath || null, cover.url || null, cover.prompt, cover.error || null,
      JSON.stringify(paragraphUrls), JSON.stringify(images), filePath, articleId);
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

export async function saveArticleImage(articleId: string, sourceUrl: string, name = "cover") {
  const article = getArticleRecord(articleId);
  if (!article?.directory) return null;
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("无法下载生成的图片");
  const safeName = name.replace(/[^a-z0-9-_]/gi, "-") || "image";
  const filePath = path.join(article.directory, "assets", `${safeName}${extensionFrom(response.headers.get("content-type"), sourceUrl)}`);
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  await saveGeneratedMaterial(filePath);
  if (safeName === "cover") {
    getDatabase().prepare("UPDATE articles SET cover_path = ?, cover_image_url = ? WHERE id = ?")
      .run(filePath, assetUrl(articleId, filePath), articleId);
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

export async function readArticleAsset(articleId: string, assetName: string) {
  if (path.basename(assetName) !== assetName) return null;
  const article = getArticleRecord(articleId);
  if (!article?.directory) return null;
  const assetsDirectory = path.resolve(article.directory, "assets");
  const filePath = path.resolve(assetsDirectory, assetName);
  if (path.relative(assetsDirectory, filePath).startsWith("..")) return null;
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
