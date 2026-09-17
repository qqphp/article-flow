import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import MarkdownIt from "markdown-it";
import { getArticleCoverPath, readPublishMarkdown } from "../../lib/article-store";
import { appendRequestLog } from "../../lib/request-log";

function markdownToWechatHtml(markdown: string) {
  const parser = new MarkdownIt({ html: false, linkify: true, typographer: true });
  const defaultParagraphOpen = parser.renderer.rules.paragraph_open || ((tokens, index, options, _environment, renderer) => renderer.renderToken(tokens, index, options));
  parser.renderer.rules.paragraph_open = (tokens, index, options, environment, renderer) => {
    tokens[index].attrPush(["style", "margin:10px 0;line-height:1.8;font-size:16px;color:#333;"]);
    return defaultParagraphOpen(tokens, index, options, environment, renderer);
  };
  parser.renderer.rules.heading_open = (tokens, index, options, _environment, renderer) => {
    const styles: Record<string, string> = {
      h1: "font-size:24px;font-weight:bold;margin:20px 0 10px;color:#2c3e50;",
      h2: "font-size:20px;font-weight:bold;margin:18px 0 8px;border-left:4px solid #42b983;padding-left:10px;color:#2c3e50;",
      h3: "font-size:18px;font-weight:bold;margin:15px 0 5px;color:#34495e;",
    };
    tokens[index].attrPush(["style", styles[tokens[index].tag] || ""]);
    return renderer.renderToken(tokens, index, options);
  };
  parser.renderer.rules.blockquote_open = () => "<blockquote style=\"border-left:4px solid #ddd;padding-left:15px;margin:15px 0;color:#666;font-style:italic;\">";
  parser.renderer.rules.bullet_list_open = () => "<ul style=\"padding-left:20px;margin:10px 0;\">";
  parser.renderer.rules.ordered_list_open = () => "<ol style=\"padding-left:20px;margin:10px 0;\">";
  parser.renderer.rules.strong_open = () => "<span style=\"font-weight:700;\">";
  parser.renderer.rules.strong_close = () => "</span>";
  return parser.render(markdown).replace(/>\s+</g, "><").trim();
}

function contentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/png";
}

async function uploadImage(filePath: string, token: string, endpoint: string, fieldName: string) {
  const image = await fs.readFile(filePath);
  const form = new FormData();
  form.append("media", new Blob([image], { type: contentType(filePath) }), path.basename(filePath));
  const response = await fetch(`${endpoint}?access_token=${encodeURIComponent(token)}${fieldName === "media_id" ? "&type=image" : ""}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.[fieldName]) throw new Error(data?.errmsg || `图片上传失败（${response.status}）`);
  return data[fieldName] as string;
}

function decodeHtmlAttribute(value: string) {
  const decoded = value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&#x27;/g, "'");
  try { return decodeURIComponent(decoded.split(/[?#]/, 1)[0]); } catch { return decoded.split(/[?#]/, 1)[0]; }
}

async function uploadContentImages(html: string, markdownPath: string, articleDirectory: string, token: string, articleId: string) {
  const imagePattern = /<img\b[^>]*\bsrc=(['"])([^'"]+)\1[^>]*>/gi;
  const imageTags = Array.from(html.matchAll(imagePattern));
  const replacements = new Map<string, string>();
  const uploadedByPath = new Map<string, string>();

  for (const imageTag of imageTags) {
    const source = imageTag[2].trim();
    if (!source || /^(?:https?:)?\/\//i.test(source) || /^(?:data|blob):/i.test(source)) continue;
    const decodedPath = decodeHtmlAttribute(source);
    const imagePath = path.isAbsolute(decodedPath) ? path.normalize(decodedPath) : path.resolve(path.dirname(markdownPath), decodedPath);
    const relative = path.relative(articleDirectory, imagePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`正文图片路径超出文章目录: ${source}`);
    const stat = await fs.stat(imagePath).catch(() => null);
    if (!stat?.isFile()) throw new Error(`正文图片不存在: ${source}`);
    let wechatUrl = uploadedByPath.get(imagePath);
    if (!wechatUrl) {
      await appendRequestLog({ type: "image", operation: "微信公众号上传正文图片", endpoint: "https://api.weixin.qq.com/cgi-bin/media/uploadimg", model: "微信公众号", requestBody: { articleId, source } });
      wechatUrl = await uploadImage(imagePath, token, "https://api.weixin.qq.com/cgi-bin/media/uploadimg", "url");
      uploadedByPath.set(imagePath, wechatUrl);
    }
    replacements.set(source, wechatUrl);
  }

  return html.replace(imagePattern, (tag, quote, source) => {
    const replacement = replacements.get(source.trim());
    return replacement ? tag.replace(`src=${quote}${source}${quote}`, `src=${quote}${replacement}${quote}`) : tag;
  });
}

export async function POST(request: Request) {
  const { platform = "wechat", title, articleId, config } = await request.json();
  if (!title?.trim() || !articleId) return NextResponse.json({ error: "标题和文章存档不能为空" }, { status: 400 });
  if (platform !== "wechat") return NextResponse.json({ error: "当前仅支持微信公众号自动创建草稿，其它平台可在发布中心手动导出" }, { status: 400 });
  const source = await readPublishMarkdown(articleId);
  if (!source?.content.trim()) return NextResponse.json({ error: "文章 Markdown 文件不存在或内容为空" }, { status: 404 });
  const appid = config?.wechatAppId || process.env.WECHAT_APPID;
  const secret = config?.wechatSecret || process.env.WECHAT_SECRET;
  if (!appid || !secret) return NextResponse.json({ demo: true, message: "未配置微信公众号凭证，已保存到本地发布队列" });
  const coverPath = getArticleCoverPath(articleId);
  if (!coverPath) return NextResponse.json({ error: "微信公众号草稿需要本地封面图，请先生成封面" }, { status: 400 });

  try {
    await appendRequestLog({ type: "text", operation: "微信公众号获取 access_token", endpoint: "https://api.weixin.qq.com/cgi-bin/token", model: "微信公众号", requestBody: { grant_type: "client_credential" } });
    const tokenResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`, { signal: AbortSignal.timeout(15000) });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.errmsg || "获取微信公众号 access_token 失败");

    await appendRequestLog({ type: "image", operation: "微信公众号上传封面", endpoint: "https://api.weixin.qq.com/cgi-bin/material/add_material", model: "微信公众号", requestBody: { type: "image", articleId, source: "本地文章封面" } });
    const thumbMediaId = await uploadImage(coverPath, tokenData.access_token, "https://api.weixin.qq.com/cgi-bin/material/add_material", "media_id");
    const escapedHtml = markdownToWechatHtml(source.content);
    const content = await uploadContentImages(escapedHtml, source.filePath, source.article.directory, tokenData.access_token, articleId);
    const draftBody = {
      articles: [{
        title,
        author: config?.wechatAuthor || process.env.WECHAT_AUTHOR || "",
        content,
        thumb_media_id: thumbMediaId,
        need_open_comment: 1,
        only_fans_can_comment: 0,
      }],
    };
    await appendRequestLog({ type: "text", operation: "微信公众号创建草稿", endpoint: "https://api.weixin.qq.com/cgi-bin/draft/add", model: "微信公众号", requestBody: { articleId, title, imageCount: (content.match(/<img\b/gi) || []).length } });
    const draftResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(tokenData.access_token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(draftBody),
      signal: AbortSignal.timeout(30000),
    });
    const draftData = await draftResponse.json();
    if (!draftResponse.ok || !draftData.media_id) throw new Error(draftData.errmsg || "创建草稿失败");
    if (config?.wechatAutoPublish === "true" || process.env.WECHAT_AUTO_PUBLISH === "true") {
      await appendRequestLog({ type: "text", operation: "微信公众号发布", endpoint: "https://api.weixin.qq.com/cgi-bin/freepublish/submit", model: "微信公众号", requestBody: { media_id: draftData.media_id } });
      const publishResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${encodeURIComponent(tokenData.access_token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_id: draftData.media_id }),
        signal: AbortSignal.timeout(30000),
      });
      const publishData = await publishResponse.json();
      if (!publishResponse.ok || publishData.errcode) throw new Error(publishData.errmsg || "微信公众号发布失败");
      return NextResponse.json({ demo: false, mediaId: draftData.media_id, message: "微信公众号已发布" });
    }
    return NextResponse.json({ demo: false, mediaId: draftData.media_id, message: "微信公众号草稿创建成功" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "发布失败" }, { status: error?.name === "TimeoutError" ? 504 : 502 });
  }
}
