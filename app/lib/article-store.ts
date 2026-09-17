import { promises as fs } from "fs";
import path from "path";
import { getDatabase } from "./database";

export type ResearchSource = { title?: string; url: string; description?: string };
export type ParagraphImage = { url: string; filePath: string; anchor?: string; prompt?: string };

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
  paragraph_image_urls?: string | null;
  alternative_titles?: string | null;
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
  getDatabase().prepare(`INSERT INTO articles (id, title, topic, style, directory, markdown_path, sources_path, alternative_titles, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.title, input.topic, input.style, directory, markdownPath, sourcesPath, JSON.stringify(input.alternatives || []), createdAt);
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
    paragraphImages: paragraphImageUrls.map((url) => ({ url })),
    sources,
    firecrawlSearched: sources.length > 0,
    createdAt: article.created_at,
  };
}

export async function readLatestArticle() {
  const row = getDatabase().prepare("SELECT id FROM articles ORDER BY created_at DESC LIMIT 1").get() as { id?: string } | undefined;
  return row?.id ? readArticle(row.id) : null;
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
        cover_image_url = NULL, paragraph_image_urls = '[]'
    WHERE id = ?`).run(filePath, articleId);
  const saved = await fs.readFile(filePath, "utf8");
  return markdownBody(saved, article.title);
}

function insertParagraphImages(content: string, images: ParagraphImage[], directory: string) {
  const blocks = content.trim().split(/\r?\n\s*\r?\n/).filter(Boolean);
  const imagesByBlock = new Map<number, Array<{ image: ParagraphImage; index: number }>>();
  const usedBlocks = new Set<number>();
  images.forEach((image, index) => {
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

export async function saveArticleLayout(articleId: string, content: string, coverPath: string, coverUrl: string, images: ParagraphImage[]) {
  const article = getArticleRecord(articleId);
  if (!article) return null;
  const filePath = path.join(article.directory, "preview.md");
  const layout = insertParagraphImages(content, images, article.directory);
  await fs.writeFile(filePath, markdownDocument(article, layout, "layout-preview"), "utf8");
  const paragraphUrls = images.map((image) => image.url);
  getDatabase().prepare(`UPDATE articles
    SET cover_path = ?, cover_image_url = ?, paragraph_image_urls = ?, layout_markdown_path = ?
    WHERE id = ?`).run(coverPath, coverUrl, JSON.stringify(paragraphUrls), filePath, articleId);
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
  if (safeName === "cover") {
    getDatabase().prepare("UPDATE articles SET cover_path = ?, cover_image_url = ? WHERE id = ?")
      .run(filePath, assetUrl(articleId, filePath), articleId);
  }
  return filePath;
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
