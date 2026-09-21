import { promises as fs } from "fs";
import path from "path";

const stylesDirectory = path.join(process.cwd(), "article_style");

export type ArticleStyleSummary = {
  id: string;
  title: string;
  summary: string;
};

export type ArticleStyle = ArticleStyleSummary & {
  content: string;
};

function titleFrom(content: string, fallback: string) {
  return content.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim() || fallback;
}

function summaryFrom(content: string) {
  const withoutTitle = content.replace(/^#\s+.+?\s*$/m, "").trim();
  const paragraph = withoutTitle.split(/\r?\n\s*\r?\n/).find((item) => item.trim() && !item.trim().startsWith("#")) || "";
  return paragraph.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function isStyleId(styleId: unknown): styleId is string {
  return typeof styleId === "string" && styleId === path.basename(styleId) && /^[a-z0-9][a-z0-9_.-]*\.md$/i.test(styleId);
}

export async function listArticleStyles(): Promise<ArticleStyleSummary[]> {
  const entries = await fs.readdir(stylesDirectory, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".md").sort((a, b) => a.name.localeCompare(b.name, "en"));
  return Promise.all(files.map(async (file) => {
    const id = file.name;
    const content = await fs.readFile(path.join(stylesDirectory, file.name), "utf8");
    return { id, title: titleFrom(content, id), summary: summaryFrom(content) };
  }));
}

export async function getArticleStyle(styleId: unknown): Promise<ArticleStyle | null> {
  if (!isStyleId(styleId)) return null;
  const filePath = path.join(stylesDirectory, styleId);
  try {
    const content = await fs.readFile(filePath, "utf8");
    return { id: styleId, title: titleFrom(content, styleId), summary: summaryFrom(content), content };
  } catch {
    return null;
  }
}
