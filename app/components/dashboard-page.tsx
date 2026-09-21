"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Clock3, FileText, Image as ImageIcon, MoreHorizontal, PenLine, Rocket, Send, Wand2 } from "lucide-react";
import { steps } from "./studio-constants";
import { useNotify } from "./notify";

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

export default function DashboardPage() {
  const router = useRouter();
  const notify = useNotify();
  const onWrite = () => router.push("/write");
  const [summary, setSummary] = useState<{ totalArticles: number; monthlyArticles: number; cumulativePublished: number; pending: number } | null>(null);
  const [recent, setRecent] = useState<RecentArticle[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const loadDashboard = async () => {
      try {
        const [summaryResponse, recentResponse] = await Promise.all([
          fetch("/api/articles?summary=1"),
          fetch("/api/articles?recent=3"),
        ]);
        const summaryData = await summaryResponse.json().catch(() => ({}));
        const recentData = await recentResponse.json().catch(() => ({}));
        if (cancelled) return;
        setSummary(summaryResponse.ok ? summaryData.stats || null : null);
        if (!recentResponse.ok) throw new Error(recentData.error || "最近创作加载失败");
        setRecent(Array.isArray(recentData.articles) ? recentData.articles : []);
      } catch (error: any) {
        if (cancelled) return;
        setRecent([]);
        notify(error.message || "最近创作加载失败");
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    };
    void loadDashboard();
    window.addEventListener("article-flow-articles-updated", loadDashboard);
    return () => {
      cancelled = true;
      window.removeEventListener("article-flow-articles-updated", loadDashboard);
    };
    // notify is recreated each parent render and should not retrigger dashboard data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const heroDate = now ? formatHeroDate(now) : "今天";
  const heroGreeting = now ? `${greetingForHour(now.getHours())}，开发阿雷` : "你好，开发阿雷";
  const flowIcons = [
    <PenLine size={17} key="idea"/>,
    <FileText size={17} key="write"/>,
    <Wand2 size={17} key="humanize"/>,
    <ImageIcon size={17} key="images"/>,
    <Rocket size={17} key="publish"/>,
  ];
  return <div className="page"><div className="hero"><div><p className="eyebrow"><span className="live-dot"/> {heroDate}</p><h1>{heroGreeting} <span>👋</span></h1><p className="hero-sub">今天也来写点让人愿意读下去的内容吧。</p></div><button className="primary-btn" onClick={onWrite}><PenLine size={17}/> 开始写作 <ChevronRight size={16}/></button></div>
    <div className="stats"><Stat icon={<FileText/>} color="purple" label="本月文章" value={`${summary?.monthlyArticles || 0}`}/><Stat icon={<Send/>} color="blue" label="已发布" value={`${summary?.cumulativePublished || 0}`}/><Stat icon={<Clock3/>} color="orange" label="待发布" value={`${summary?.pending || 0}`}/><Stat icon={<PenLine/>} color="green" label="全部文章" value={`${summary?.totalArticles || 0}`}/></div>
    <div className="section-title"><div><h2>最近创作</h2><p>继续你的创作，灵感不会等待。</p></div><button className="text-btn" onClick={onWrite}>新建文章 <ChevronRight size={15}/></button></div>
    {recentLoading ? <div className="empty-state dashboard-empty">正在加载最近创作...</div> : recent.length ? <div className="recent-grid">{recent.map((item, index) => <ArticleCard key={item.articleId} title={item.title} tag={item.style || "未命名风格"} status={item.status} time={formatRelativeTime(item.createdAt)} color={["lavender", "peach", "mint"][index % 3]} coverUrl={item.coverUrl} wordCount={item.wordCount} imageCount={item.imageCount} onClick={() => router.push(`/write?articleId=${item.articleId}`)}/>)}</div> : <div className="empty-state dashboard-empty">还没有创作记录，点击“开始写作”创建第一篇文章。</div>}
    <div className="lower"><div className="section-title"><div><h2>创作流程</h2><p>从灵感到发布，一站式完成。</p></div></div><div className="flow-card">{steps.map((s, i) => <div className="flow-step" key={s}><div className="flow-icon">{flowIcons[i]}</div><b>{s}</b>{i < steps.length - 1 && <div className="flow-line"/>}</div>)}</div></div>
  </div>;
}

function Stat({ icon, color, label, value }: {icon: React.ReactNode;color:string;label:string;value:string}) { return <div className="stat-card"><div className={`stat-icon ${color}`}>{icon}</div><div><small>{label}</small><strong>{value}</strong></div></div>; }
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
