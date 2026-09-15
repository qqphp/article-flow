import { promises as fs } from "fs";
import path from "path";
import { getDatabase } from "./database";

export type ResearchSource = { title?: string; url: string; description?: string };

const articlesDirectory = path.join(process.cwd(), "data", "articles");

function createArticleId(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "article";
  return `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function saveGeneratedArticle(input: { title: string; topic: string; style: string; content: string; sources: ResearchSource[] }) {
  const id = createArticleId(input.title);
  const directory = path.join(articlesDirectory, id);
  const markdownPath = path.join(directory, "article.md");
  const sourcesPath = path.join(directory, "sources.json");
  const createdAt = new Date().toISOString();
  const markdown = `---\ntitle: ${input.title}\ntopic: ${input.topic}\nstyle: ${input.style}\ncreatedAt: ${createdAt}\n---\n\n# ${input.title}\n\n${input.content.trim()}\n`;

  await fs.mkdir(path.join(directory, "assets"), { recursive: true });
  await Promise.all([
    fs.writeFile(markdownPath, markdown, "utf8"),
    fs.writeFile(sourcesPath, JSON.stringify({ topic: input.topic, searchedAt: createdAt, sources: input.sources }, null, 2), "utf8"),
  ]);
  getDatabase().prepare(`INSERT INTO articles (id, title, topic, style, directory, markdown_path, sources_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.title, input.topic, input.style, directory, markdownPath, sourcesPath, createdAt);
  return { id, directory };
}

function extensionFrom(contentType: string | null, sourceUrl: string) {
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  if (contentType?.includes("webp")) return ".webp";
  const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].includes(extension) ? extension : ".png";
}

export async function saveArticleImage(articleId: string, sourceUrl: string) {
  const database = getDatabase();
  const article = database.prepare("SELECT directory FROM articles WHERE id = ?").get(articleId) as { directory?: string } | undefined;
  if (!article?.directory) return null;
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("无法下载生成的图片");
  const filePath = path.join(article.directory, "assets", `cover${extensionFrom(response.headers.get("content-type"), sourceUrl)}`);
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  database.prepare("UPDATE articles SET cover_path = ? WHERE id = ?").run(filePath, articleId);
  return filePath;
}
