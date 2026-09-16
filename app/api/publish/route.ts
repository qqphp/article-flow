import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getArticleCoverPath } from "../../lib/article-store";
import { appendRequestLog } from "../../lib/request-log";

function markdownToHtml(markdown: string) {
  return markdown.split(/\n\s*\n/).filter(Boolean).map((block) => {
    const value = block.trim();
    if (value.startsWith("## ")) return `<h2>${value.slice(3)}</h2>`;
    if (value.startsWith("# ")) return `<h1>${value.slice(2)}</h1>`;
    return `<p>${value.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");
}

export async function POST(request: Request) {
  const { platform = "wechat", title, content, articleId, config } = await request.json();
  if (!title?.trim() || !content?.trim()) return NextResponse.json({ error: "标题和正文不能为空" }, { status: 400 });
  if (platform !== "wechat") return NextResponse.json({ error: "当前仅支持微信公众号自动创建草稿，其它平台可在发布中心手动导出" }, { status: 400 });
  const appid = config?.wechatAppId || process.env.WECHAT_APPID;
  const secret = config?.wechatSecret || process.env.WECHAT_SECRET;
  if (!appid || !secret) return NextResponse.json({ demo: true, message: "未配置微信公众号凭证，已保存到本地发布队列" });
  const coverPath = articleId ? getArticleCoverPath(articleId) : null;
  if (!coverPath) return NextResponse.json({ error: "微信公众号草稿需要本地封面图，请先生成封面" }, { status: 400 });
  try {
    await appendRequestLog({ type: "text", operation: "微信公众号获取 access_token", endpoint: "https://api.weixin.qq.com/cgi-bin/token", model: "微信公众号", requestBody: { grant_type: "client_credential" } });
    const tokenResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`, { signal: AbortSignal.timeout(15000) });
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) throw new Error(tokenData.errmsg || "获取微信公众号 access_token 失败");
    const image = await fs.readFile(coverPath);
    const extension = path.extname(coverPath).toLowerCase();
    const contentType = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : extension === ".webp" ? "image/webp" : "image/png";
    const form = new FormData();
    form.append("media", new Blob([image], { type: contentType }), `cover${extension || ".png"}`);
    await appendRequestLog({ type: "image", operation: "微信公众号上传封面", endpoint: "https://api.weixin.qq.com/cgi-bin/material/add_material", model: "微信公众号", requestBody: { type: "image", articleId, source: "本地文章封面" } });
    const uploadResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${tokenData.access_token}&type=image`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
    const uploadData = await uploadResponse.json();
    if (!uploadData.media_id) throw new Error(uploadData.errmsg || "封面上传失败");
    const draftBody = { articles: [{ title, author: config?.wechatAuthor || process.env.WECHAT_AUTHOR || "", content: markdownToHtml(content), thumb_media_id: uploadData.media_id, need_open_comment: 1, only_fans_can_comment: 0 }] };
    await appendRequestLog({ type: "text", operation: "微信公众号创建草稿", endpoint: "https://api.weixin.qq.com/cgi-bin/draft/add", model: "微信公众号", requestBody: draftBody });
    const draftResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${tokenData.access_token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draftBody), signal: AbortSignal.timeout(30000) });
    const draftData = await draftResponse.json();
    if (!draftData.media_id) throw new Error(draftData.errmsg || "创建草稿失败");
    if (config?.wechatAutoPublish === "true" || process.env.WECHAT_AUTO_PUBLISH === "true") {
      await appendRequestLog({ type: "text", operation: "微信公众号发布", endpoint: "https://api.weixin.qq.com/cgi-bin/freepublish/submit", model: "微信公众号", requestBody: { media_id: draftData.media_id } });
      const publishResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${tokenData.access_token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media_id: draftData.media_id }), signal: AbortSignal.timeout(30000) });
      const publishData = await publishResponse.json();
      if (publishData.errcode) throw new Error(publishData.errmsg || "微信公众号发布失败");
      return NextResponse.json({ demo: false, mediaId: draftData.media_id, message: "微信公众号已发布" });
    }
    return NextResponse.json({ demo: false, mediaId: draftData.media_id, message: "微信公众号草稿创建成功" });
  } catch (error: any) { return NextResponse.json({ error: error.message || "发布失败" }, { status: 502 }); }
}
