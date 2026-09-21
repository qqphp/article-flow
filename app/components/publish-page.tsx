"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, RefreshCw, Send, Trash2 } from "lucide-react";
import { useNotify } from "./notify";

type QueueArticle = { articleId: string; title: string; style: string; publishStatus: "未发布" | "已创建草稿" | "已发布"; coverUrl: string | null; createdAt: string };
type PublishStats = { cumulativePublished: number; monthlyPublished: number; weeklyPublished: number; todayPublished: number; pending: number };

function formatArticleCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "--";
}

export default function PublishPage() {
  const notify = useNotify();
  const router = useRouter();
  const onWrite = () => router.push("/write");
  const onPublishArticle = (articleId: string) => router.push(`/write?articleId=${encodeURIComponent(articleId)}`);
  const [articles, setArticles] = useState<QueueArticle[]>([]);
  const [stats, setStats] = useState<PublishStats>({ cumulativePublished: 0, monthlyPublished: 0, weeklyPublished: 0, todayPublished: 0, pending: 0 });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const loadPage = useCallback(async (targetPage = pageRef.current) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/articles?queue=1&page=${targetPage}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "文章队列加载失败");
      setArticles(Array.isArray(data.articles) ? data.articles : []);
      setStats(data.stats || { cumulativePublished: 0, monthlyPublished: 0, weeklyPublished: 0, todayPublished: 0, pending: 0 });
      setPage(Number(data.page || 1));
      setTotal(Number(data.total || 0));
      setTotalPages(Number(data.totalPages || 1));
    } catch (error: any) {
      setArticles([]);
      notify(error.message || "文章队列加载失败");
    } finally { setLoading(false); }
  }, [notify]);
  useEffect(() => {
    void loadPage(1);
    const onUpdated = () => { void loadPage(); };
    window.addEventListener("article-flow-articles-updated", onUpdated);
    return () => window.removeEventListener("article-flow-articles-updated", onUpdated);
  }, [loadPage]);
  const removeArticle = async (article: QueueArticle) => {
    if (deletingId || !window.confirm(`确定删除“${article.title}”吗？文章记录及 data 目录会一并删除。`)) return;
    setDeletingId(article.articleId);
    try {
      const response = await fetch(`/api/articles/${encodeURIComponent(article.articleId)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除文章失败");
      window.dispatchEvent(new Event("article-flow-articles-updated"));
      await loadPage(page);
      notify("文章已删除");
    } catch (error: any) { notify(error.message || "删除文章失败"); } finally { setDeletingId(null); }
  };
  const statItems = [["累积发布", stats.cumulativePublished], ["本月发布", stats.monthlyPublished], ["本周发布", stats.weeklyPublished], ["今日发布", stats.todayPublished], ["待发布", stats.pending]];
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">内容分发</p><h1>发布中心</h1><p className="hero-sub">管理微信公众号文章队列与发布状态。</p></div><button className="primary-btn" onClick={onWrite}><Send size={17}/> 新建发布</button></div><div className="publish-stats">{statItems.map(([label, value]) => <div key={label as string}><small>{label}</small><strong>{value as number}</strong></div>)}</div><div className="publish-layout"><div className="channel-panel panel"><h2>发布渠道</h2><p>当前仅支持微信公众号。</p><div className="channel-row active"><BookOpen size={18}/><span><b>微信公众号</b><small>文章草稿发布</small></span></div></div><div className="panel queue-panel"><div className="panel-title"><div><h2>文章队列</h2><p>按创建时间倒序 · 共 {total} 篇文章</p></div><button className="filter-btn" onClick={() => void loadPage(page)} disabled={loading}><RefreshCw size={14}/> 刷新</button></div>{loading ? <div className="empty-state">正在加载文章队列...</div> : articles.length === 0 ? <div className="empty-state">暂无文章，去写文章生成内容后发布。</div> : articles.map((article, index) => <div className="queue-item article-queue-item" key={article.articleId}><div className={`queue-cover ${article.coverUrl ? "has-image" : ["lavender", "peach", "mint", "blue"][index % 4]}`}>{article.coverUrl ? <img src={article.coverUrl} alt=""/> : <div className="cover-orb"/>}</div><div className="queue-info"><span className={`pill ${article.publishStatus === "已发布" ? "success" : article.publishStatus === "已创建草稿" ? "warning" : "pending"}`}>{article.publishStatus}</span><b>{article.title}</b><small>{article.style} · 创建于 {formatArticleCreatedAt(article.createdAt)}</small></div><div className="queue-actions">{article.publishStatus !== "已发布" && <button className="queue-action" onClick={() => onPublishArticle(article.articleId)}>{article.publishStatus === "已创建草稿" ? "继续发布" : "发布"}</button>}<button className="queue-delete" onClick={() => void removeArticle(article)} disabled={deletingId === article.articleId}>{deletingId === article.articleId ? "删除中..." : <><Trash2 size={14}/> 删除</>}</button></div></div>)}<div className="pagination queue-pagination"><span>第 {page} / {totalPages} 页</span><button disabled={loading || page <= 1} onClick={() => void loadPage(page - 1)}>上一页</button><button disabled={loading || page >= totalPages} onClick={() => void loadPage(page + 1)}>下一页</button></div></div></div></div>;
}
