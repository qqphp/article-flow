"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Bot, Check, ChevronRight, CircleHelp, Clock3, Eye, FileText, Flame, Image as ImageIcon, KeyRound, LayoutDashboard, Link2, Menu, MoreHorizontal, PenLine, Play, Plus, RefreshCw, Rocket, Search, Send, Settings2, Sparkles, Trash2, Wand2, X, Zap, ScrollText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ZhihuDataPage from "./zhihu-data-page";

type NavKey = "overview" | "write" | "assets" | "publish" | "zhihu-data" | "settings" | "request-logs";
type ArticleStyle = { id: string; title: string; summary: string; content: string };
const defaultStyleId = "viral_style.md";
const steps = ["构思", "写作", "去痕", "配图", "发布"];

export default function Home() {
  const [nav, setNav] = useState<NavKey>("overview");
  const [topic, setTopic] = useState("AI 时代，普通人如何建立自己的内容工作流？");
  const [style, setStyle] = useState("高流量 / 爆款");
  const [styleId, setStyleId] = useState(defaultStyleId);
  const [articleStyles, setArticleStyles] = useState<ArticleStyle[]>([]);
  const [stylesLoading, setStylesLoading] = useState(true);
  const [stylesError, setStylesError] = useState("");
  const [searchOn, setSearchOn] = useState(true);
  const [running, setRunning] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [humanized, setHumanized] = useState(false);
  const [images, setImages] = useState(false);
  const [article, setArticle] = useState<any>(null);
  const [toast, setToast] = useState("");
  const [usage, setUsage] = useState<{ percent: number; remaining?: number; resetAt?: string; unavailable?: boolean; amount?: number } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const notify = useCallback((message: string) => { setToast(message); setTimeout(() => setToast(""), 2400); }, []);
  useEffect(() => { void (async () => {
    try {
      const response = await fetch("/api/article-styles", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取文章风格失败");
      const loaded = Array.isArray(data.styles) ? data.styles as ArticleStyle[] : [];
      setArticleStyles(loaded);
      if (!loaded.length) throw new Error("当前没有可用的文章风格文件");
      setStyleId((current) => loaded.some((item) => item.id === current) ? current : (loaded.find((item) => item.id === defaultStyleId) || loaded[0]).id);
      setStylesError("");
    } catch (error: any) { setStylesError(error.message || "读取文章风格失败"); }
    finally { setStylesLoading(false); }
  })(); }, []);
  useEffect(() => {
    fetch("/api/billing/balance").then(async (response) => {
      const data = await response.json();
      setUsage(response.ok ? data : { percent: 0, unavailable: true });
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    fetch("/api/articles").then(async (response) => {
      if (!response.ok) return null;
      return response.json();
    }).then((data) => {
      const saved = data?.article;
      if (!saved?.content) return;
      setArticle(saved);
      setTopic(saved.topic || topic);
      setStyle(saved.style || style);
      setGenerated(true);
      setHumanized(Boolean(saved.humanizedContent));
      setImages(Boolean(saved.layoutContent || saved.imageUrl || saved.paragraphImages?.length));
    }).catch(() => undefined);
  // Restore persisted work once; later changes come from explicit article API responses.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (generated && article?.articleId) window.dispatchEvent(new Event("article-flow-articles-updated"));
  }, [article?.articleId, generated]);
  useEffect(() => {
    const matched = articleStyles.find((item) => item.title === article?.style);
    if (matched) setStyleId(matched.id);
  }, [article?.style, articleStyles]);
  useEffect(() => {
    const syncPendingCount = async () => {
      try {
        const response = await fetch("/api/articles?summary=1");
        const data = await response.json();
        setPendingCount(response.ok ? Number(data.stats?.pending || 0) : 0);
      } catch { setPendingCount(0); }
    };
    void syncPendingCount();
    window.addEventListener("article-flow-articles-updated", syncPendingCount);
    return () => window.removeEventListener("article-flow-articles-updated", syncPendingCount);
  }, []);
  const start = async () => { const selectedStyle = articleStyles.find((item) => item.id === styleId); if (!selectedStyle) { notify(stylesLoading ? "文章风格正在加载，请稍后重试" : stylesError || "请选择有效的文章风格"); return; } setRunning(true); setHumanized(false); setImages(false); setGenerated(false); setArticle(null); try { const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, styleId: selectedStyle.id, search: searchOn }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "生成失败"); if (typeof data.content !== "string" || !data.content.trim()) throw new Error("AI 返回的文章内容为空"); setArticle(data); setStyle(data.style || selectedStyle.title); setGenerated(true); notify(data.demo ? "已生成演示初稿（配置模型后可生成真实内容）" : "文章初稿已生成"); } catch (error: any) { notify(error.message || "生成失败，请稍后重试"); } finally { setRunning(false); } };
  const openArticleForPublish = async (articleId: string) => {
    try {
      const response = await fetch(`/api/articles/${encodeURIComponent(articleId)}`);
      const data = await response.json();
      if (!response.ok || !data.article) throw new Error(data.error || "文章加载失败");
      if (data.article.publishStatus !== "未发布") throw new Error("这篇文章已发布，请刷新文章队列");
      setArticle(data.article);
      setTopic(data.article.topic || topic);
      setStyle(data.article.style || style);
      setGenerated(true);
      setHumanized(Boolean(data.article.humanizedContent));
      setImages(Boolean(data.article.layoutContent || data.article.imageUrl || data.article.paragraphImages?.length));
      setNav("write");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) { notify(error.message || "文章加载失败"); }
  };
  const navItems: [NavKey, React.ReactNode, string][] = [["overview", <LayoutDashboard size={18}/>, "工作台"], ["write", <PenLine size={18}/>, "写文章"], ["assets", <ImageIcon size={18}/>, "素材库"], ["publish", <Send size={18}/>, "发布中心"], ["zhihu-data", <Flame size={18}/>, "知乎数据"], ["request-logs", <ScrollText size={18}/>, "请求日志"], ["settings", <Settings2 size={18}/>, "配置中心"]];

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={17}/></div><span>墨稿</span><small>AI CONTENT STUDIO</small></div>
      <div className="workspace"><div className="avatar">A</div><div><b>开发阿雷</b><small>个人工作空间</small></div><ChevronRight size={15}/></div>
      <nav>{navItems.map(([key, icon, label]) => <button key={key} className={nav === key ? "nav-item active" : "nav-item"} onClick={() => setNav(key)}>{icon}<span>{label}</span>{key === "publish" && pendingCount > 0 && <i>{pendingCount}</i>}</button>)}</nav>
      <div className="side-bottom"><div className="usage"><div className="usage-head"><span>本月使用量</span><b>{!usage ? "查询中" : usage.unavailable ? "暂不可用" : usage.amount !== undefined ? usage.amount.toLocaleString() : `${usage.percent}%`}</b></div><div className="progress"><span style={{ width: `${usage?.percent ?? 0}%` }} /></div><small>{!usage ? "正在查询模型账户" : usage.unavailable ? "余额接口暂未返回数据" : usage.amount !== undefined ? "来自模型服务月度用量接口" : `剩余 ${usage.remaining ?? "--"} · ${usage.resetAt ? `重置于 ${usage.resetAt}` : "按接口返回"}`}</small></div><button className="help"><CircleHelp size={17}/> 使用帮助 <span>?</span></button><div className="user-row"><div className="avatar soft">阿</div><div><b>开发阿雷</b><small>Pro 计划</small></div><MoreHorizontal size={17}/></div></div>
    </aside>
    <section className="content">
      <header className="topbar"><div className="crumb"><button className="mobile-menu"><Menu size={20}/></button><span>{nav === "settings" ? "配置中心" : nav === "write" ? "写文章" : nav === "publish" ? "发布中心" : nav === "request-logs" ? "请求日志" : nav === "zhihu-data" ? "知乎数据" : "工作台"}</span><ChevronRight size={14}/><b>{nav === "overview" ? "概览" : nav === "write" ? "新建文章" : nav === "publish" ? "文章队列" : nav === "settings" ? "AI 与平台配置" : nav === "request-logs" ? "API 调用记录" : nav === "zhihu-data" ? "开放平台数据" : "全部内容"}</b></div><div className="top-actions"><button className="icon-btn"><Search size={18}/></button><button className="new-btn" onClick={() => { setNav("write"); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Plus size={17}/> 新建文章</button></div></header>
      {nav === "settings" ? <SettingsPage notify={notify}/> : nav === "write" ? <WritePage topic={topic} setTopic={setTopic} style={style} styleId={styleId} setStyleId={setStyleId} articleStyles={articleStyles} stylesLoading={stylesLoading} stylesError={stylesError} searchOn={searchOn} setSearchOn={setSearchOn} running={running} start={start} generated={generated} humanized={humanized} setHumanized={setHumanized} images={images} setImages={setImages} article={article} setArticle={setArticle} notify={notify}/> : nav === "assets" ? <AssetsPage notify={notify}/> : nav === "publish" ? <PublishPage notify={notify} onWrite={() => setNav("write")} onPublishArticle={openArticleForPublish}/> : nav === "zhihu-data" ? <ZhihuDataPage notify={notify} onOpenSettings={() => setNav("settings")}/> : nav === "request-logs" ? <RequestLogsPage/> : <Dashboard onWrite={() => setNav("write")} notify={notify}/>}
    </section>
    {toast && <div className="toast"><Check size={16}/> {toast}</div>}
  </main>;
}

type RecentArticle = {
  articleId: string;
  title: string;
  style: string;
  status: string;
  coverUrl: string | null;
  wordCount: number;
  imageCount: number;
  createdAt: string;
};

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return "刚刚";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} 小时前`;
  if (diffMs < 7 * 86_400_000) return `${Math.floor(diffMs / 86_400_000)} 天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function formatHeroDate(date: Date) {
  return `${WEEKDAYS[date.getDay()]}，${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function greetingForHour(hour: number) {
  if (hour < 5) return "凌晨好";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function Dashboard({ onWrite, notify }: { onWrite: () => void; notify: (s: string) => void }) {
  const [summary, setSummary] = useState<{ totalArticles: number; monthlyArticles: number; cumulativePublished: number } | null>(null);
  const [recent, setRecent] = useState<RecentArticle[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const loadSummary = async () => {
      try {
        const response = await fetch("/api/articles?summary=1");
        const data = await response.json();
        setSummary(response.ok ? data.stats || null : null);
      } catch { setSummary(null); }
    };
    void loadSummary();
    window.addEventListener("article-flow-articles-updated", loadSummary);
    return () => window.removeEventListener("article-flow-articles-updated", loadSummary);
  }, []);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setRecentLoading(true);
    fetch("/api/articles?recent=3").then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "最近创作加载失败");
      if (!cancelled) setRecent(Array.isArray(data.articles) ? data.articles : []);
    }).catch((error: any) => {
      if (!cancelled) {
        setRecent([]);
        notify(error.message || "最近创作加载失败");
      }
    }).finally(() => {
      if (!cancelled) setRecentLoading(false);
    });
    return () => { cancelled = true; };
    // notify is recreated each parent render and should not retrigger recent articles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const heroDate = now ? formatHeroDate(now) : "今天";
  const heroGreeting = now ? `${greetingForHour(now.getHours())}，开发阿雷` : "你好，开发阿雷";
  return <div className="page"><div className="hero"><div><p className="eyebrow"><span className="live-dot"/> {heroDate}</p><h1>{heroGreeting} <span>👋</span></h1><p className="hero-sub">今天也来写点让人愿意读下去的内容吧。</p></div><button className="primary-btn" onClick={onWrite}><PenLine size={17}/> 开始写作 <ChevronRight size={16}/></button></div>
    <div className="stats"><Stat icon={<FileText/>} color="purple" label="本月文章" value={`${summary?.monthlyArticles || 0}`} delta={summary ? "已同步" : "--"}/><Stat icon={<Send/>} color="blue" label="已发布" value={`${summary?.cumulativePublished || 0}`} delta={summary?.cumulativePublished ? "已同步" : "--"}/><Stat icon={<Zap/>} color="orange" label="节省时间" value={summary?.totalArticles ? `${(summary.totalArticles * 1.8).toFixed(1)}h` : "--"} delta={summary?.totalArticles ? "估算" : "--"}/><Stat icon={<Clock3/>} color="green" label="平均生成" value="--" delta="等待数据"/></div>
    <div className="section-title"><div><h2>最近创作</h2><p>继续你的创作，灵感不会等待。</p></div><button className="text-btn" onClick={onWrite}>新建文章 <ChevronRight size={15}/></button></div>
    {recentLoading ? <div className="empty-state dashboard-empty">正在加载最近创作...</div> : recent.length ? <div className="recent-grid">{recent.map((item, index) => <ArticleCard key={item.articleId} title={item.title} tag={item.style || "未命名风格"} status={item.status} time={formatRelativeTime(item.createdAt)} color={["lavender", "peach", "mint"][index % 3]} coverUrl={item.coverUrl} wordCount={item.wordCount} imageCount={item.imageCount} onClick={onWrite}/>)}</div> : <div className="empty-state dashboard-empty">还没有创作记录，点击“开始写作”创建第一篇文章。</div>}
    <div className="lower"><div className="section-title"><div><h2>创作流程</h2><p>从灵感到发布，一站式完成。</p></div></div><div className="flow-card">{steps.map((s, i) => <div className="flow-step" key={s}><div className={i < 2 ? "flow-icon done" : "flow-icon"}>{i < 2 ? <Check size={16}/> : i === 2 ? <Wand2 size={17}/> : i === 3 ? <ImageIcon size={17}/> : <Rocket size={17}/>}</div><b>{s}</b>{i < steps.length - 1 && <div className={i < 1 ? "flow-line done" : "flow-line"}/>}</div>)}</div></div>
  </div>;
}

function Stat({ icon, color, label, value, delta }: {icon: React.ReactNode;color:string;label:string;value:string;delta:string}) { return <div className="stat-card"><div className={`stat-icon ${color}`}>{icon}</div><div><small>{label}</small><strong>{value}</strong><span className={delta.startsWith("-") ? "down" : "up"}>{delta}</span></div></div>; }
function ArticleCard({ title, tag, status, time, color, coverUrl, wordCount, imageCount, onClick }: {title:string;tag:string;status:string;time:string;color:string;coverUrl?: string | null;wordCount?: number;imageCount?: number;onClick?:()=>void}) {
  const words = typeof wordCount === "number" ? wordCount.toLocaleString() : "--";
  const images = typeof imageCount === "number" ? imageCount : 0;
  return <button className="article-card" onClick={onClick}>
    <div className={`article-cover ${coverUrl ? "has-image" : color}`}>
      {coverUrl ? <img src={coverUrl} alt="" /> : <div className="cover-orb"/>}
      <span>{tag}</span>
    </div>
    <div className="article-meta"><span className="status"><i className={status === "已发布" || status === "已配图" ? "green-dot" : "yellow-dot"}/>{status}</span><small>{time}</small></div>
    <h3>{title}</h3>
    <div className="card-footer"><span><FileText size={14}/> {words} 字</span><span><ImageIcon size={14}/> {images} 张配图</span><MoreHorizontal size={16}/></div>
  </button>;
}

type Asset = { name: string; type: "封面图" | "段落配图"; size: string; color: string; url?: string };
function AssetsPage({ notify }: { notify: (s: string) => void }) {
  const [assets, setAssets] = useState<Asset[]>([
    { name: "workflow-cover.png", type: "封面图", size: "1.2 MB", color: "lavender" },
    { name: "input-system.png", type: "段落配图", size: "860 KB", color: "peach" },
    { name: "ai-tools-roundup.png", type: "封面图", size: "1.5 MB", color: "mint" },
    { name: "attention-map.png", type: "段落配图", size: "920 KB", color: "blue" },
  ]);
  const [tab, setTab] = useState<"全部" | "封面图" | "段落配图">("全部");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const additions = Array.from(files).filter((file) => file.type.startsWith("image/")).map((file, index) => ({
      name: file.name, type: index % 2 === 0 ? "封面图" as const : "段落配图" as const, size: `${Math.max(1, Math.round(file.size / 1024))} KB`, color: ["lavender", "peach", "mint", "blue"][assets.length % 4], url: URL.createObjectURL(file),
    }));
    setAssets((current) => [...additions, ...current]);
    notify(`已添加 ${additions.length} 个素材`);
  };
  const filtered = assets.filter((asset) => (tab === "全部" || asset.type === tab) && asset.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">内容资产</p><h1>素材库</h1><p className="hero-sub">统一管理文章封面、段落插图和上传素材。</p></div><><input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event) => onFiles(event.target.files)}/><button className="primary-btn" onClick={() => inputRef.current?.click()}><Plus size={17}/> 上传素材</button></></div><div className="asset-toolbar"><div className="asset-tabs">{(["全部", "封面图", "段落配图"] as const).map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name} <b>{name === "全部" ? assets.length : assets.filter((asset) => asset.type === name).length}</b></button>)}</div><label className="filter-btn"><Search size={15}/><input aria-label="搜索素材" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索素材"/></label></div><div className="asset-grid">{filtered.map((asset) => <div className="asset-card" key={`${asset.name}-${asset.url || "seed"}`}><div className={`asset-thumb ${asset.color}`}>{asset.url ? <img src={asset.url} alt={asset.name}/> : <><div className="cover-orb"/><ImageIcon size={20}/></>}</div><div className="asset-info"><b>{asset.name}</b><small>{asset.type} · {asset.size}</small></div><button className="asset-use" onClick={() => notify(asset.url ? "素材已就绪，可用于文章配图" : `已复制 ${asset.name} 的使用路径`)}><Link2 size={14}/> 使用</button></div>)}</div>{filtered.length === 0 && <div className="empty-state">没有找到匹配的素材</div>}</div>;
}

type QueueArticle = { articleId: string; title: string; style: string; publishStatus: "未发布" | "已发布"; coverUrl: string | null; createdAt: string };
type PublishStats = { cumulativePublished: number; monthlyPublished: number; weeklyPublished: number; todayPublished: number; pending: number };

function formatArticleCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "--";
}

function PublishPage({ notify, onWrite, onPublishArticle }: { notify: (s: string) => void; onWrite: () => void; onPublishArticle: (articleId: string) => void }) {
  const [articles, setArticles] = useState<QueueArticle[]>([]);
  const [stats, setStats] = useState<PublishStats>({ cumulativePublished: 0, monthlyPublished: 0, weeklyPublished: 0, todayPublished: 0, pending: 0 });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loadPage = async (targetPage = page) => {
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
  };
  useEffect(() => { void loadPage(1); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">内容分发</p><h1>发布中心</h1><p className="hero-sub">管理微信公众号文章队列与发布状态。</p></div><button className="primary-btn" onClick={onWrite}><Send size={17}/> 新建发布</button></div><div className="publish-stats">{statItems.map(([label, value]) => <div key={label as string}><small>{label}</small><strong>{value as number}</strong></div>)}</div><div className="publish-layout"><div className="channel-panel panel"><h2>发布渠道</h2><p>当前仅支持微信公众号。</p><div className="channel-row active"><BookOpen size={18}/><span><b>微信公众号</b><small>文章草稿发布</small></span></div></div><div className="panel queue-panel"><div className="panel-title"><div><h2>文章队列</h2><p>按创建时间倒序 · 共 {total} 篇文章</p></div><button className="filter-btn" onClick={() => void loadPage(page)} disabled={loading}><RefreshCw size={14}/> 刷新</button></div>{loading ? <div className="empty-state">正在加载文章队列...</div> : articles.length === 0 ? <div className="empty-state">暂无文章，去写文章生成内容后发布。</div> : articles.map((article, index) => <div className="queue-item article-queue-item" key={article.articleId}><div className={`queue-cover ${article.coverUrl ? "has-image" : ["lavender", "peach", "mint", "blue"][index % 4]}`}>{article.coverUrl ? <img src={article.coverUrl} alt=""/> : <div className="cover-orb"/>}</div><div className="queue-info"><span className={`pill ${article.publishStatus === "已发布" ? "success" : "pending"}`}>{article.publishStatus}</span><b>{article.title}</b><small>{article.style} · 创建于 {formatArticleCreatedAt(article.createdAt)}</small></div><div className="queue-actions">{article.publishStatus === "未发布" && <button className="queue-action" onClick={() => onPublishArticle(article.articleId)}>发布</button>}<button className="queue-delete" onClick={() => void removeArticle(article)} disabled={deletingId === article.articleId}>{deletingId === article.articleId ? "删除中..." : <><Trash2 size={14}/> 删除</>}</button></div></div>)}<div className="pagination queue-pagination"><span>第 {page} / {totalPages} 页</span><button disabled={loading || page <= 1} onClick={() => void loadPage(page - 1)}>上一页</button><button disabled={loading || page >= totalPages} onClick={() => void loadPage(page + 1)}>下一页</button></div></div></div></div>;
}

function WritePage({ topic, setTopic, style, styleId, setStyleId, articleStyles, stylesLoading, stylesError, searchOn, setSearchOn, running, start, generated, humanized, setHumanized, images, setImages, article, setArticle, notify }: any) {
  const [operation, setOperation] = useState<"humanize" | "images" | "publish" | null>(null);
  const [progress, setProgress] = useState(0);
  const [previewTab, setPreviewTab] = useState<"article" | "humanized" | "compare" | "layout" | "images" | "research">("article");
  const [viewMode, setViewMode] = useState<"rendered" | "markdown">("rendered");
  const displayTitle = article?.selectedTitle || article?.title || topic;
  const displayContent = previewTab === "layout" ? (article?.layoutContent || article?.humanizedContent || article?.content) : previewTab === "humanized" ? (article?.humanizedContent || article?.content) : article?.content;
  const titleOptions = Array.from(new Set([article?.title, ...(article?.alternatives || [])].filter((title): title is string => Boolean(title))));
  const firecrawlSources = Array.isArray(article?.sources) ? article.sources : [];
  const imagePlans = Array.isArray(article?.paragraphImages) ? article.paragraphImages : [];
  const paragraphImages = imagePlans.filter((image: any) => image?.url);
  useEffect(() => {
    if (!operation) return;
    const timer = window.setInterval(() => setProgress((value) => Math.min(92, value + Math.ceil(Math.random() * 7))), 320);
    return () => window.clearInterval(timer);
  }, [operation]);
  useEffect(() => {
    if (generated && article?.content && !humanized) { setPreviewTab("article"); setViewMode("rendered"); }
  }, [article?.content, article?.title, generated, humanized]);
  const finishOperation = () => { setProgress(100); window.setTimeout(() => { setOperation(null); setProgress(0); }, 550); };
  const handleHumanize = async () => {
    if (!article?.content || operation || running) return;
    setOperation("humanize"); setProgress(8);
    try {
      const response = await fetch("/api/humanize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: article.articleId }) });
      const data = await response.json();
      if (!response.ok || !data.article?.humanizedContent?.trim()) throw new Error(data.error || "去痕失败");
      setArticle({ ...data.article, selectedTitle: article.selectedTitle }); setHumanized(true); setImages(false); setPreviewTab("humanized");
      notify(data.demo ? "已完成演示去痕（配置模型后效果更完整）" : "去痕处理完成");
    } catch (error: any) { notify(error.message || "去痕失败，请稍后重试"); } finally { finishOperation(); }
  };
  const handleImages = async (target?: { type: "cover" } | { type: "paragraph"; index: number }) => {
    if (operation || running) return;
    setOperation("images"); setProgress(8);
    try {
      const response = await fetch("/api/article-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: displayTitle, articleId: article?.articleId, mode: target ? "single" : "all", target }) });
      const data = await response.json();
      if (!response.ok || !data.article) throw new Error(data.error || "配图失败");
      setArticle({ ...data.article, selectedTitle: article.selectedTitle }); setImages(true); setPreviewTab(data.failed ? "images" : "layout");
      notify(data.failed ? `已完成生成，${data.failed} 张图片失败，可单独再次生成` : target ? "图片生成完成" : "封面与段落图生成完成");
    } catch (error: any) { notify(error.message || "配图失败，请稍后重试"); } finally { finishOperation(); }
  };
  const handlePublish = async () => {
    if (!article || operation || running) return;
    setOperation("publish"); setProgress(8);
    try {
      const response = await fetch("/api/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: "wechat", title: displayTitle, articleId: article.articleId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "发布失败");
      setArticle({ ...article, publishStatus: "已发布", publishedAt: new Date().toISOString() });
      window.dispatchEvent(new Event("article-flow-articles-updated"));
      notify(data.message || "微信公众号草稿创建成功");
    } catch (error: any) { notify(error.message || "发布失败，请检查配置"); } finally { finishOperation(); }
  };
  const normalizeMarkdown = (content: string) => content.replace(/\\(\*{1,3}|_{1,3}|~{2}|`|\[|\]|\(|\))/g, "$1").replace(/\*\*\s*([^*\n]*?\S)\s*\*\*/g, "**$1**").replace(/(\*\*[^*\n]+\*\*)(?=[\u3400-\u9fff])/g, "$1\ufeff").replace(/\r\n/g, "\n");
  const sourceSummary = (description: string) => normalizeMarkdown(description).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[>#*_`]/g, "").replace(/\s+/g, " ").trim();
  const renderMarkdown = (content: string) => <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeMarkdown(content || "暂无内容")}</ReactMarkdown>;
  const renderContent = (content: string, mode = viewMode) => mode === "markdown" ? <pre className="markdown-source">{content || "暂无内容"}</pre> : renderMarkdown(content);
  const operationLabel = operation === "humanize" ? "正在进行 AI 去痕处理" : operation === "images" ? "正在生成封面与段落图" : "正在发布到微信公众号";
  const currentStep = images ? 3 : humanized ? 2 : generated ? 1 : 0;
  return <div className="page write-page"><div className="page-heading"><div><p className="eyebrow">创作工作台</p><h1>写一篇新文章</h1><p className="hero-sub">把一个想法，变成值得分享的内容。</p></div><div className="autosave"><span className="green-dot"/> 自动保存已开启</div></div><div className="stepper">{steps.map((s:string,i:number)=><div className={i===currentStep ? "step active" : i<currentStep ? "step done" : "step"} key={s}><span>{i<currentStep?<Check size={13}/>:i+1}</span>{s}{i<steps.length-1&&<i/>}</div>)}</div>
    <div className="write-layout"><div className="write-main"><div className="panel"><div className="panel-title"><div><h2>告诉我你想写什么</h2><p>描述越具体，生成的内容越贴近你的想法。</p></div><span className="tip"><Sparkles size={15}/> AI 辅助</span></div><label>文章主题</label><textarea value={topic} onChange={(e:any)=>setTopic(e.target.value)} rows={3}/><div className="label-row"><label>写作风格</label><span>{styleId === defaultStyleId ? "推荐" : ""}</span></div><div className="style-grid">{stylesLoading ? <div className="style-state">正在加载文章风格...</div> : stylesError ? <div className="style-state error">{stylesError}</div> : articleStyles.map((item: ArticleStyle)=><button className={styleId===item.id?"style-option selected":"style-option"} key={item.id} onClick={()=>setStyleId(item.id)}><span className="radio">{styleId===item.id&&<i/>}</span><div><b>{item.title}</b><small>{item.summary || "查看完整风格指南"}</small></div></button>)}</div><div className="option-row"><div className="option-label"><div className="option-icon"><Search size={17}/></div><div><b>先搜索资料再写作</b><small>调用 Firecrawl 获取最新信息，让文章更有依据</small></div></div><button className={searchOn?"toggle on":"toggle"} onClick={()=>setSearchOn(!searchOn)}><i/></button></div><button className="generate-btn" onClick={start} disabled={running || Boolean(operation) || stylesLoading || !articleStyles.length}>{running?<><RefreshCw className="spin" size={18}/> 正在生成中...</>:<><Sparkles size={18}/> 开始生成文章 <span>⌘ Enter</span></>}</button></div></div><aside className="write-side"><div className="side-card"><div className="side-card-title"><Sparkles size={16}/> 本次生成会包含</div>{[[<FileText size={16}/> ,"3–6 个备选标题"],[<BookOpen size={16}/> ,"完整 Markdown 文章"],[<LayoutDashboard size={16}/> ,"结构化排版建议"],[<Clock3 size={16}/> ,"预计 2–4 分钟"]].map(([icon,text],i)=><div className="include-row" key={i}>{icon}<span>{text}</span><Check size={15}/></div>)}</div><div className="side-card tips-card"><div className="side-card-title"><Bot size={16}/> 写作小贴士</div><p>好的主题通常包含「对象 + 场景 + 结果」。比如：</p><div className="example">“帮我写一篇给产品经理看的，关于 AI 提效的实操指南”</div></div></aside></div>
    {generated && <div className="result-panel"><div className="result-header"><div className="result-title-block"><span className="pill success">已生成</span><h2>{displayTitle}</h2><p>{style} · {(article?.content || "").length.toLocaleString()} 字 · {titleOptions.length || 3} 个备选标题</p><div className="title-options" aria-label="备选标题">{titleOptions.map((title, index) => <button key={`${title}-${index}`} className={displayTitle === title ? "title-option selected" : "title-option"} onClick={() => { setArticle({ ...article, selectedTitle: title }); }}>{title}</button>)}</div></div><button className="ghost-btn" onClick={start} disabled={running || Boolean(operation)}><RefreshCw size={16}/> 重新生成</button></div><div className="result-actions"><div className="action-task"><button className={humanized?"action active":"action"} onClick={humanized?()=>{setPreviewTab("humanized");notify("已显示去痕文章")}:handleHumanize} disabled={running || Boolean(operation)}><Wand2 size={16}/> {humanized?"查看 AI 去痕":"AI 去痕处理"}</button></div><div className="action-task"><button className={images?"action active":"action"} onClick={() => handleImages()} disabled={running || Boolean(operation)}><ImageIcon size={16}/> {images?"重新生成封面与配图":"生成封面与配图"}</button></div><button className="publish-btn" onClick={handlePublish} disabled={running || Boolean(operation)}><Send size={16}/> 发布到微信公众号</button></div>{operation && <div className="result-operation-progress"><div><span style={{width:`${progress}%`}}/></div><small>{operationLabel}… {progress}%</small></div>}<div className="preview-tabs"><button className={previewTab==="article"?"active":""} onClick={()=>setPreviewTab("article")}>文章预览</button>{humanized && <button className={previewTab==="humanized"?"active":""} onClick={()=>setPreviewTab("humanized")}>AI 去痕</button>}{humanized && <button className={previewTab==="compare"?"active":""} onClick={()=>setPreviewTab("compare")}>对比原文</button>}{article?.firecrawlSearched && <button className={previewTab==="research"?"active":""} onClick={()=>setPreviewTab("research")}>搜索资料{firecrawlSources.length ? ` (${firecrawlSources.length})` : ""}</button>}<button className={previewTab==="layout"?"active":""} onClick={()=>setPreviewTab("layout")}>排版预览</button><button className={previewTab==="images"?"active":""} onClick={()=>setPreviewTab("images")}>文章配图{imagePlans.length ? ` (${imagePlans.length + (article?.coverPrompt ? 1 : 0)})` : ""}</button></div>{previewTab!=="layout" && previewTab!=="images" && previewTab!=="research" && <div className="format-toggle"><button className={viewMode==="rendered"?"active":""} onClick={()=>setViewMode("rendered")}>样式预览</button><button className={viewMode==="markdown"?"active":""} onClick={()=>setViewMode("markdown")}>Markdown 原文</button></div>}{previewTab==="research" ? <div className="research-results"><h3>Firecrawl 搜索资料</h3>{firecrawlSources.length ? <div className="research-source-list">{firecrawlSources.map((source: any, index: number) => <a className="research-source" href={source.url} target="_blank" rel="noreferrer" key={`${source.url}-${index}`}><b>{source.title || source.url}</b>{source.description && <p>{sourceSummary(source.description)}</p>}<small>{source.url}</small></a>)}</div> : <p>本次搜索未返回可用资料。</p>}</div> : previewTab==="images" ? <ArticleImagesTab article={article} imagePlans={imagePlans} generating={operation === "images"} onGenerate={handleImages}/> : <div key={`${previewTab}-${displayTitle}-${article?.content || ""}`} className={previewTab==="compare"?"compare-preview":"article-preview"}>{previewTab!=="layout" && <div className="preview-cover"><h3>{displayTitle}</h3></div>}{previewTab==="compare" ? <div className="compare-columns">{[ ["原文", article?.content || ""], ["AI 去痕", article?.humanizedContent || ""] ].map(([label, content])=><div key={label as string}><small>{label}</small><div className="article-preview compare-article">{renderContent(content as string)}</div></div>)}</div> : previewTab==="layout" ? <>{article?.imageUrl && <figure className="layout-cover-image"><img src={article.imageUrl} alt="文章封面"/></figure>}{renderMarkdown(displayContent || article?.content || "暂无内容")}</> : renderContent(displayContent || "")}</div>}</div>}
  </div>;
}

function ArticleImagesTab({ article, imagePlans, generating, onGenerate }: { article: any; imagePlans: any[]; generating: boolean; onGenerate: (target?: { type: "cover" } | { type: "paragraph"; index: number }) => void }) {
  const coverStatus = article?.coverError ? "生成失败" : article?.imageUrl ? "已生成" : article?.coverPrompt ? "待生成" : "未规划";
  const actionLabel = (hasImage: boolean, error?: string) => error || !hasImage ? "生成图片" : "重新生成";
  if (!article?.coverPrompt && !imagePlans.length) return <div className="image-plans-empty"><ImageIcon size={20}/><p>尚未生成配图提示词</p><small>点击上方“生成封面与配图”，系统会先规划封面和段落配图。</small></div>;
  return <section className="image-plans" aria-label="文章配图"><div className="image-plans-head"><div><p className="eyebrow">IMAGE PLAN</p><h3>封面与段落配图</h3><span>展示每张图的生成提示词；失败的图片可单独再次生成。</span></div><b>{(article?.coverPrompt ? 1 : 0) + imagePlans.length} 张计划图片</b></div><div className="image-plan-grid"><article className="image-plan-card cover"><div className="image-plan-preview">{article?.imageUrl ? <img src={article.imageUrl} alt="文章封面"/> : <div className="image-plan-placeholder"><ImageIcon size={24}/><span>{coverStatus}</span></div>}</div><div className="image-plan-content"><div className="image-plan-title"><span>封面图</span><i className={article?.coverError ? "failed" : article?.imageUrl ? "ready" : "pending"}>{coverStatus}</i></div><p className="image-plan-prompt">{article?.coverPrompt || "正在等待提示词"}</p>{article?.coverError && <small className="image-plan-error">{article.coverError}</small>}<button className="image-plan-action" onClick={() => onGenerate({ type: "cover" })} disabled={generating || !article?.coverPrompt}><RefreshCw size={14}/>{generating ? "生成中..." : actionLabel(Boolean(article?.imageUrl), article?.coverError)}</button></div></article>{imagePlans.map((image, index) => <article className="image-plan-card" key={`${image.prompt}-${index}`}><div className="image-plan-preview">{image.url ? <img src={image.url} alt={`段落配图 ${index + 1}`}/> : <div className="image-plan-placeholder"><ImageIcon size={21}/><span>{image.error ? "生成失败" : "待生成"}</span></div>}</div><div className="image-plan-content"><div className="image-plan-title"><span>段落图 {index + 1}</span><i className={image.error ? "failed" : image.url ? "ready" : "pending"}>{image.error ? "生成失败" : image.url ? "已生成" : "待生成"}</i></div>{image.anchor && <small className="image-plan-anchor">对应段落：{image.anchor}</small>}<p className="image-plan-prompt">{image.prompt}</p>{image.error && <small className="image-plan-error">{image.error}</small>}<button className="image-plan-action" onClick={() => onGenerate({ type: "paragraph", index })} disabled={generating || !image.prompt}><RefreshCw size={14}/>{generating ? "生成中..." : actionLabel(Boolean(image.url), image.error)}</button></div></article>)}</div></section>;
}

function RequestLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState("");
  const pageSize = 10;
  useEffect(() => { fetch("/api/request-logs").then((response) => response.json()).then((data) => setLogs(data.logs || [])).catch(() => setLogs([])); }, []);
  const clearLogs = async () => {
    if (!logs.length || clearing || !window.confirm("确定清空全部请求日志吗？此操作无法撤销。")) return;
    setClearing(true);
    setMessage("");
    try {
      const response = await fetch("/api/request-logs", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "清空请求日志失败");
      setLogs([]); setSelectedLog(null); setPage(1); setMessage(`已清空 ${data.deleted || 0} 条请求日志`);
    } catch (error: any) { setMessage(error.message || "清空请求日志失败，请稍后重试"); } finally { setClearing(false); }
  };
  const filtered = logs.filter((log) => (type === "all" || log.type === type) && (!query.trim() || `${log.operation} ${log.model} ${log.endpoint}`.toLowerCase().includes(query.trim().toLowerCase())));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  return <div className="page request-logs-page"><div className="page-heading"><div><p className="eyebrow">系统记录</p><h1>请求日志</h1><p className="hero-sub">记录文本和图片模型的请求参数，不保存响应结果。</p></div><button className="clear-logs-btn" onClick={clearLogs} disabled={!logs.length || clearing}><Trash2 size={16}/>{clearing ? "正在清空..." : "清空日志"}</button></div>{message && <p className="request-log-message">{message}</p>}<div className="panel request-logs-panel"><div className="request-log-filters"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索操作、模型或接口"/><select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="all">全部类型</option><option value="text">文本请求</option><option value="image">图片请求</option></select><span>共 {filtered.length} 条</span></div><div className="table-wrap"><table className="request-log-table"><thead><tr><th>时间</th><th>类型</th><th>调用操作</th><th>模型</th><th>接口</th><th>请求内容</th><th>操作</th></tr></thead><tbody>{visible.length ? visible.map((log) => <tr key={log.id}><td>{new Date(log.timestamp).toLocaleString("zh-CN", { hour12: false })}</td><td><span className={`log-type ${log.type}`}>{log.type === "image" ? "图片" : "文本"}</span></td><td>{log.operation}</td><td>{log.model}</td><td title={log.endpoint}>{log.endpoint}</td><td><code>JSON · {Object.keys(log.requestBody || {}).length} 个字段</code></td><td><button className="view-request-btn" onClick={() => setSelectedLog(log)}><Eye size={14}/> 查看</button></td></tr>) : <tr><td colSpan={7} className="empty-state">暂无请求记录</td></tr>}</tbody></table></div><div className="pagination"><span>第 {Math.min(page, totalPages)} / {totalPages} 页</span><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button></div></div>{selectedLog && <div className="request-modal-backdrop" role="presentation" onMouseDown={() => setSelectedLog(null)}><section className="request-modal" role="dialog" aria-modal="true" aria-label="请求内容" onMouseDown={(event) => event.stopPropagation()}><div className="request-modal-head"><div><p className="eyebrow">REQUEST BODY</p><h2>{selectedLog.operation}</h2></div><button className="modal-close" onClick={() => setSelectedLog(null)} aria-label="关闭"><X size={18}/></button></div><div className="request-modal-meta"><span>{selectedLog.model}</span><span title={selectedLog.endpoint}>{selectedLog.endpoint}</span></div><pre>{JSON.stringify(selectedLog.requestBody, null, 2)}</pre></section></div>}</div>;
}

function SettingsPage({ notify }: { notify: (s:string)=>void }) {
  const [tab, setTab] = useState<"ai" | "platform" | "style">("ai");
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<{ text: string[]; image: string[] }>({ text: [], image: [] });
  const [modelOptionsLoaded, setModelOptionsLoaded] = useState({ text: false, image: false });
  const [loadingModels, setLoadingModels] = useState<"text" | "image" | null>(null);
  const loadConfig = async () => {
    const response = await fetch("/api/config", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "加载配置失败");
    setSaved(data.values || {});
    setConfigured(data.configured || {});
  };
  useEffect(() => { void (async () => {
    try {
      const legacy = JSON.parse(localStorage.getItem("article-flow-config") || "{}") as unknown;
      if (legacy && typeof legacy === "object" && !Array.isArray(legacy) && Object.keys(legacy as object).length) {
        const migrated = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: legacy, mode: "fill-missing" }) });
        if (!migrated.ok) throw new Error("旧配置迁移失败");
        localStorage.removeItem("article-flow-config");
      }
      await loadConfig();
    } catch {
      notify("旧配置迁移失败，请稍后重试，原配置仍保留");
    }
  })(); }, [notify]);
  const save = (key: string, value: string) => setSaved((current) => ({ ...current, [key]: value }));
  const persist = async () => { setSaving(true); try { const response = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: saved }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "保存配置失败"); await loadConfig(); notify("配置已保存到本地数据库"); } catch (error: any) { notify(error.message || "保存配置失败"); } finally { setSaving(false); } };
  const value = (key: string, fallback: string) => saved[key] ?? fallback;
  const modelValue = (key: string, fallback: string) => saved[key] ?? fallback;
  const test = async (label: string) => { if (label === "Firecrawl") { notify(configured.firecrawlKey || saved.firecrawlKey ? "Firecrawl 已配置，生成文章时将使用该密钥" : "请先填写并保存 Firecrawl API Key"); return; } if (label === "知乎数据") { try { if (saved.zhihuAccessSecret) throw new Error("请先保存新的知乎密钥后再测试"); const response = await fetch("/api/zhihu/quota", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "连接失败"); notify("知乎数据连接正常"); } catch (error: any) { notify(error.message || "知乎数据连接失败，请检查密钥"); } return; } const type = label === "图片模型" ? "image" : "text"; const baseUrl = type === "text" ? value("textBase", "") : value("imageUrl", ""); const apiKey = type === "text" ? value("textKey", "") : value("imageKey", ""); try { const response = await fetch("/api/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, baseUrl, apiKey }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "连接失败"); notify(`${label}连接正常`); } catch (error: any) { notify(error.message || `${label}连接失败，请检查地址和密钥`); } };
  const getModels = async (type: "text" | "image") => { const baseUrl = type === "text" ? value("textBase", "") : value("imageUrl", ""); const apiKey = type === "text" ? value("textKey", "") : value("imageKey", ""); setLoadingModels(type); try { const response = await fetch("/api/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, baseUrl, apiKey }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "获取模型失败"); setModels((current) => ({ ...current, [type]: data.models || [] })); setModelOptionsLoaded((current) => ({ ...current, [type]: true })); notify(data.models?.length ? `已获取 ${data.models.length} 个${type === "text" ? "文本" : "图片"}模型` : "服务未返回可用模型"); } catch (error: any) { notify(error.message || "获取模型失败"); } finally { setLoadingModels(null); } };
  const modelSelector = (type: "text" | "image", key: string, fallback: string) => {
    const currentValue = modelValue(key, fallback);
    if (!modelOptionsLoaded[type]) return <input value={currentValue} onChange={(event) => save(key, event.target.value)}/>;
    const options = Array.from(new Set([currentValue, ...models[type]].filter(Boolean)));
    return <select value={currentValue} onChange={(event) => save(key, event.target.value)}><option value="">请选择模型</option>{options.map((model) => <option key={model} value={model}>{model}</option>)}</select>;
  };
  const secretInput = (key: string, label: string) => <div className="input-icon"><KeyRound size={16}/><input type="password" value={saved[key] || ""} placeholder={configured[key] ? "已保存，重新输入才会覆盖" : `请输入${label}`} onChange={(event) => save(key, event.target.value)}/></div>;
  const configuredLabel = (key: string) => configured[key] ? <><span className="green-dot"/> 已配置</> : "未配置";
  return <div className="page settings-page">
    <div className="page-heading"><div><p className="eyebrow">配置中心</p><h1>让墨稿更懂你的工作流</h1><p className="hero-sub">配置保存到本地 SQLite；密钥不会在页面回显。</p></div><button className="save-btn" onClick={() => void persist()} disabled={saving}><Check size={16}/>{saving ? "保存中..." : "保存配置"}</button></div>
    <div className="settings-tabs"><button className={tab === "ai" ? "active" : ""} onClick={() => setTab("ai")}><Bot size={16}/> AI 服务</button><button className={tab === "platform" ? "active" : ""} onClick={() => setTab("platform")}><KeyRound size={16}/> 平台密钥</button><button className={tab === "style" ? "active" : ""} onClick={() => setTab("style")}><FileText size={16}/> 文章风格</button></div>
    {tab === "ai" ? <div className="settings-grid">
      <div className="panel config-panel"><div className="panel-title"><div><h2>文本模型</h2><p>用于文章生成、去痕与标题创作。</p></div><span className={configured.textKey ? "connected" : "connected muted"}>{configuredLabel("textKey")}</span></div><label>中转站 Base URL</label><div className="input-icon"><Link2 size={16}/><input value={value("textBase", "https://fast.sbbbbbbbbb.xyz/v1")} onChange={(event) => save("textBase", event.target.value)}/></div><label>API Key</label>{secretInput("textKey", "API Key")}<label>模型</label>{modelSelector("text", "textModel", "gpt-5.6-terra")}<div className="config-actions"><button className="test-btn" onClick={() => void getModels("text")} disabled={loadingModels === "text"}>{loadingModels === "text" ? "正在获取..." : "获取模型"} <RefreshCw size={15}/></button><button className="test-btn" onClick={() => void test("文本模型")}>测试连接 <ChevronRight size={15}/></button></div></div>
      <div className="panel config-panel"><div className="panel-title"><div><h2>图片模型</h2><p>用于封面与正文段落配图。</p></div><span className={configured.imageKey ? "connected" : "connected muted"}>{configuredLabel("imageKey")}</span></div><label>图片接口地址</label><div className="input-icon"><Link2 size={16}/><input value={value("imageUrl", "https://fast.sbbbbbbbbb.xyz/v1/images/generations")} onChange={(event) => save("imageUrl", event.target.value)}/></div><label>API Key</label>{secretInput("imageKey", "API Key")}<label>模型</label>{modelSelector("image", "imageModel", "gpt-image-2.5-flare")}<div className="config-actions"><button className="test-btn" onClick={() => void getModels("image")} disabled={loadingModels === "image"}>{loadingModels === "image" ? "正在获取..." : "获取模型"} <RefreshCw size={15}/></button><button className="test-btn" onClick={() => void test("图片模型")}>测试连接 <ChevronRight size={15}/></button></div></div>
      <div className="panel config-panel firecrawl"><div className="panel-title"><div><h2><Search size={18}/> Firecrawl 搜索</h2><p>为文章生成提供实时资料。</p></div><span className={configured.firecrawlKey ? "connected" : "connected muted"}>{configuredLabel("firecrawlKey")}</span></div><label>Firecrawl API Key</label>{secretInput("firecrawlKey", "Firecrawl API Key")}<div className="firecrawl-foot"><span><Check size={15}/> 搜索结果自动附加来源</span><button className="test-btn" onClick={() => void test("Firecrawl")}>测试连接 <ChevronRight size={15}/></button></div></div>
      <div className="panel config-panel zhihu-config"><div className="panel-title"><div><h2><Flame size={18}/> 知乎数据</h2><p>填写知乎数据开放平台 Access Secret。</p></div><span className={configured.zhihuAccessSecret ? "connected" : "connected muted"}>{configuredLabel("zhihuAccessSecret")}</span></div><label>知乎 Access Secret</label>{secretInput("zhihuAccessSecret", "知乎 Access Secret")}<div className="firecrawl-foot"><span><Check size={15}/> 密钥只会保存在本地数据库</span><button className="test-btn" onClick={() => void test("知乎数据")}>测试连接 <ChevronRight size={15}/></button></div></div>
    </div> : tab === "style" ? <ArticleStyleSettings/> : <ConfigPlatforms values={saved} configured={configured} update={save} saving={saving} onSave={persist}/>}
  </div>;
}

function ArticleStyleSettings() {
  const [styles, setStyles] = useState<ArticleStyle[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    try {
      const response = await fetch("/api/article-styles", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取文章风格失败");
      const loaded = Array.isArray(data.styles) ? data.styles as ArticleStyle[] : [];
      setStyles(loaded);
      setSelectedId((loaded.find((item) => item.id === defaultStyleId) || loaded[0])?.id || "");
      if (!loaded.length) setError("当前没有可用的文章风格文件");
    } catch (loadError: any) { setError(loadError.message || "读取文章风格失败"); }
    finally { setLoading(false); }
  })(); }, []);
  const selected = styles.find((item) => item.id === selectedId);
  return <div className="style-settings">
    <div className="style-settings-list panel"><div className="panel-title"><div><h2>文章风格 <span className="style-count">{styles.length} 个</span></h2><p>读取项目 article_style 目录中的 Markdown 指南。</p></div></div>{loading ? <div className="empty-state">正在读取文章风格...</div> : error ? <div className="empty-state">{error}</div> : styles.map((item) => <button key={item.id} className={selectedId === item.id ? "article-style-item selected" : "article-style-item"} onClick={() => setSelectedId(item.id)}><b>{item.title}</b><small>{item.summary || item.id}</small></button>)}</div>
    <div className="panel style-markdown-panel">{selected ? <><div className="panel-title"><div><h2>{selected.title}</h2><p>{selected.id} · 只读预览</p></div></div><div className="style-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content}</ReactMarkdown></div></> : <div className="empty-state">选择一个文章风格查看完整 Markdown 指南。</div>}</div>
  </div>;
}

function ConfigPlatforms({ values, configured, update, saving, onSave }: { values: Record<string, string>; configured: Record<string, boolean>; update: (key: string, value: string) => void; saving: boolean; onSave: () => Promise<void> }) {
  const secretConfigured = configured.wechatSecret;
  const autoPublish = values.wechatAutoPublish === "true";
  return <div className="platform-layout">
    <div className="platform-list"><div className="platform-item active"><BookOpen/><span><b>微信公众号</b><small>{secretConfigured ? "已配置" : "未配置"}</small></span><ChevronRight size={15}/></div></div>
    <div className="panel config-panel platform-form"><div className="panel-title"><div><h2>微信公众号</h2><p>配置后可创建草稿；开启自动发布后将继续提交发布。</p></div><span className={secretConfigured ? "connected" : "connected muted"}>{secretConfigured ? <><span className="green-dot"/> 已配置</> : "未配置"}</span></div>
      <label>微信公众号 AppID</label><div className="input-icon"><KeyRound size={16}/><input value={values.wechatAppId || ""} placeholder="请输入 AppID" onChange={(event) => update("wechatAppId", event.target.value)}/></div>
      <label>微信公众号 AppSecret</label><div className="input-icon"><KeyRound size={16}/><input type="password" value={values.wechatSecret || ""} placeholder={secretConfigured ? "已保存，重新输入才会覆盖" : "请输入 AppSecret"} onChange={(event) => update("wechatSecret", event.target.value)}/></div>
      <label>作者名称</label><div className="input-icon"><KeyRound size={16}/><input value={values.wechatAuthor || ""} placeholder="请输入作者名称" onChange={(event) => update("wechatAuthor", event.target.value)}/></div>
      <div className="option-row publish-toggle"><div className="option-label"><div className="option-icon"><Rocket size={17}/></div><div><b>自动发布</b><small>关闭后仅创建草稿，不会直接发布</small></div></div><button className={autoPublish ? "toggle on" : "toggle"} onClick={() => update("wechatAutoPublish", String(!autoPublish))}><i/></button></div>
      <button className="save-wide" onClick={() => void onSave()} disabled={saving}>{saving ? "保存中..." : "保存微信公众号配置"}</button>
    </div>
  </div>;
}
