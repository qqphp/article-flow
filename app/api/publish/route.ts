import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import MarkdownIt from "markdown-it";
import { clearWechatDraft, getArticleCoverPath, getArticlePublishSnapshot, markArticleDraftCreated, markArticlePublished, readPublishMarkdown } from "../../lib/article-store";
import { appendRequestLog } from "../../lib/request-log";
import { getAppConfig } from "../../lib/config-store";
import { abortedJsonResponse, mergeSignals } from "../../lib/abort";

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

async function uploadImage(filePath: string, token: string, endpoint: string, fieldName: string, signal?: AbortSignal) {
  const image = await fs.readFile(filePath);
  const form = new FormData();
  form.append("media", new Blob([image], { type: contentType(filePath) }), path.basename(filePath));
  const response = await fetch(`${endpoint}?access_token=${encodeURIComponent(token)}${fieldName === "media_id" ? "&type=image" : ""}`, {
    method: "POST",
    body: form,
    signal: mergeSignals(30000, signal),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.[fieldName]) throw new Error(data?.errmsg || `图片上传失败（${response.status}）`);
  return data[fieldName] as string;
}

function decodeHtmlAttribute(value: string) {
  const decoded = value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&#x27;/g, "'");
  try { return decodeURIComponent(decoded.split(/[?#]/, 1)[0]); } catch { return decoded.split(/[?#]/, 1)[0]; }
}

async function uploadContentImages(html: string, markdownPath: string, articleDirectory: string, token: string, articleId: string, signal?: AbortSignal) {
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
      wechatUrl = await uploadImage(imagePath, token, "https://api.weixin.qq.com/cgi-bin/media/uploadimg", "url", signal);
      uploadedByPath.set(imagePath, wechatUrl);
    }
    replacements.set(source, wechatUrl);
  }

  return html.replace(imagePattern, (tag, quote, source) => {
    const replacement = replacements.get(source.trim());
    return replacement ? tag.replace(`src=${quote}${source}${quote}`, `src=${quote}${replacement}${quote}`) : tag;
  });
}

function publishState(articleId: string) {
  const snapshot = getArticlePublishSnapshot(articleId);
  return {
    publishStatus: snapshot?.publishStatus || "未发布",
    publishedAt: snapshot?.publishedAt || null,
  };
}

function failureStatus(error: any) {
  return error?.name === "TimeoutError" ? 504 : 502;
}

function isInvalidWechatMedia(data: any, error?: { message?: string }) {
  const code = Number(data?.errcode);
  if ([40007, 40006, 40114, 41005, 88001].includes(code)) return true;
  const message = String(data?.errmsg || error?.message || "");
  return /invalid media|media[_ ]id|不合法的媒体|无效的媒体/i.test(message);
}

async function wechatDraftExists(token: string, mediaId: string, signal?: AbortSignal) {
  await appendRequestLog({ type: "text", operation: "微信公众号查询草稿", endpoint: "https://api.weixin.qq.com/cgi-bin/draft/get", model: "微信公众号", requestBody: { media_id: mediaId } });
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/get?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId }),
    signal: mergeSignals(15000, signal),
  });
  const data = await response.json().catch(() => null);
  if (isInvalidWechatMedia(data)) return false;
  if (!response.ok || data?.errcode) throw new Error(data?.errmsg || "查询微信公众号草稿失败");
  return true;
}

export async function POST(request: Request) {
  const { platform = "wechat", title, articleId } = await request.json();
  if (!title?.trim() || !articleId) return NextResponse.json({ error: "标题和文章存档不能为空" }, { status: 400 });
  if (platform !== "wechat") return NextResponse.json({ error: "当前仅支持微信公众号发布" }, { status: 400 });
  const source = await readPublishMarkdown(articleId);
  if (!source?.content.trim()) return NextResponse.json({ error: "文章 Markdown 文件不存在或内容为空" }, { status: 404 });
  if (source.article.publish_status === "已发布") return NextResponse.json({ error: "这篇文章已发布", ...publishState(articleId) }, { status: 409 });
  const config = getAppConfig();
  const appid = config.wechatAppId;
  const secret = config.wechatSecret;
  if (!appid || !secret) {
    return NextResponse.json({ demo: true, message: "未配置微信公众号凭证，文章仍保持未发布状态", ...publishState(articleId) });
  }

  const autoPublish = config.wechatAutoPublish === "true";
  const existingMediaId = source.article.publish_status === "已创建草稿" ? source.article.wechat_draft_media_id || "" : "";
  const coverPath = getArticleCoverPath(articleId);
  if (!existingMediaId && !coverPath) return NextResponse.json({ error: "微信公众号草稿需要本地封面图，请先生成封面" }, { status: 400 });

  try {
    await appendRequestLog({ type: "text", operation: "微信公众号获取 access_token", endpoint: "https://api.weixin.qq.com/cgi-bin/token", model: "微信公众号", requestBody: { grant_type: "client_credential" } });
    const tokenResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`, { signal: mergeSignals(15000, request.signal) });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.errmsg || "获取微信公众号 access_token 失败");
    const accessToken = tokenData.access_token as string;

    const createDraft = async () => {
      if (!coverPath) throw new Error("微信公众号草稿需要本地封面图，请先生成封面");
      await appendRequestLog({ type: "image", operation: "微信公众号上传封面", endpoint: "https://api.weixin.qq.com/cgi-bin/material/add_material", model: "微信公众号", requestBody: { type: "image", articleId, source: "本地文章封面" } });
      const thumbMediaId = await uploadImage(coverPath, accessToken, "https://api.weixin.qq.com/cgi-bin/material/add_material", "media_id", request.signal);
      const escapedHtml = markdownToWechatHtml(source.content);
      const content = await uploadContentImages(escapedHtml, source.filePath, source.article.directory, accessToken, articleId, request.signal);
      const draftBody = {
        articles: [{
          title,
          author: config.wechatAuthor,
          content,
          thumb_media_id: thumbMediaId,
          need_open_comment: 1,
          only_fans_can_comment: 0,
        }],
      };
      await appendRequestLog({ type: "text", operation: "微信公众号创建草稿", endpoint: "https://api.weixin.qq.com/cgi-bin/draft/add", model: "微信公众号", requestBody: { articleId, title, imageCount: (content.match(/<img\b/gi) || []).length } });
      const draftResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify(draftBody),
        signal: mergeSignals(30000, request.signal),
      });
      const draftData = await draftResponse.json();
      if (isInvalidWechatMedia(draftData) || !draftResponse.ok || !draftData.media_id) throw new Error(draftData.errmsg || "创建草稿失败");
      const createdId = draftData.media_id as string;
      if (!markArticleDraftCreated(articleId, createdId)) throw new Error("文章发布状态已变化，请刷新文章队列");
      return createdId;
    };

    let mediaId = existingMediaId;
    let rebuilt = false;
    if (mediaId) {
      const exists = await wechatDraftExists(accessToken, mediaId, request.signal);
      if (!exists) {
        clearWechatDraft(articleId);
        mediaId = "";
        rebuilt = true;
      }
    }
    if (!mediaId) mediaId = await createDraft();

    if (!autoPublish) {
      return NextResponse.json({
        demo: false,
        mediaId,
        message: rebuilt ? "原草稿已失效，已重新创建微信公众号草稿" : existingMediaId ? "微信公众号草稿已创建，未开启自动发布" : "微信公众号草稿创建成功",
        ...publishState(articleId),
      });
    }

    const submit = async (id: string) => {
      await appendRequestLog({ type: "text", operation: "微信公众号发布", endpoint: "https://api.weixin.qq.com/cgi-bin/freepublish/submit", model: "微信公众号", requestBody: { media_id: id } });
      const publishResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_id: id }),
        signal: mergeSignals(30000, request.signal),
      });
      const publishData = await publishResponse.json().catch(() => null);
      if (isInvalidWechatMedia(publishData)) {
        const error = new Error(publishData?.errmsg || "微信公众号草稿已失效");
        (error as Error & { invalidMedia?: boolean }).invalidMedia = true;
        throw error;
      }
      if (!publishResponse.ok || publishData?.errcode) throw new Error(publishData?.errmsg || "微信公众号发布失败");
      return publishData;
    };

    try {
      await submit(mediaId);
      if (!markArticlePublished(articleId)) throw new Error("文章发布状态已变化，请刷新文章队列");
      return NextResponse.json({ demo: false, mediaId, message: "微信公众号已发布", ...publishState(articleId) });
    } catch (error: any) {
      if (request.signal.aborted) return abortedJsonResponse();
      if (error?.invalidMedia) {
        clearWechatDraft(articleId);
        try {
          mediaId = await createDraft();
          await submit(mediaId);
          if (!markArticlePublished(articleId)) throw new Error("文章发布状态已变化，请刷新文章队列");
          return NextResponse.json({ demo: false, mediaId, message: "原草稿已失效，已重建并发布到微信公众号", ...publishState(articleId) });
        } catch (retryError: any) {
          if (request.signal.aborted) return abortedJsonResponse();
          return NextResponse.json({
            error: `${retryError.message || "微信公众号发布失败"}（已尝试重建草稿）`,
            mediaId,
            ...publishState(articleId),
          }, { status: failureStatus(retryError) });
        }
      }
      return NextResponse.json({
        error: `${error.message || "微信公众号发布失败"}（草稿已创建，可稍后重试发布）`,
        mediaId,
        ...publishState(articleId),
      }, { status: failureStatus(error) });
    }
  } catch (error: any) {
    if (request.signal.aborted) return abortedJsonResponse();
    return NextResponse.json({ error: error.message || "发布失败", ...publishState(articleId) }, { status: failureStatus(error) });
  }
}
