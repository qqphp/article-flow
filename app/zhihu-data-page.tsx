"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, ExternalLink, FileText, KeyRound, MessageCircle, Presentation, RefreshCw, Search, Send, Sparkles, ThumbsUp, TrendingUp, Upload } from "lucide-react";

type QuotaItem = { apiId: string; apiName: string; totalQuota: number; totalUsed: number; remainingQuota: number };
type HotItem = { title: string; url: string; thumbnailUrl: string; summary: string };
type SearchItem = {
  title: string;
  contentType: string;
  contentId: string;
  contentText: string;
  url: string;
  commentCount: number;
  voteUpCount: number;
  authorName: string;
  authorAvatar: string;
  authorBadge: string;
  authorBadgeText: string;
  editTime: number;
  commentInfoList: Array<{ content: string }>;
  authorityLevel: string;
  rankingScore?: number;
};
type ChatTurn = { role: "user" | "assistant"; content: string; reasoning?: string; error?: boolean };
type ToolTab = "hot" | "global" | "zhihu" | "zhida" | "pdf" | "ppt";
type AsyncTask = {
  taskId: string;
  taskStatus: string;
  progress: number;
  result: { url: string; summary?: string; expiresAtMs?: number } | null;
  error: { code: string; message: string } | null;
};
type PdfBlock = { type?: string; content?: string; image?: { media_type?: string; data?: string } };
type PdfPage = { page?: number; blocks?: PdfBlock[] };

const HOT_REFRESH_MS = 15 * 60 * 1000;
const TASK_POLL_MS = 2000;

const ZHIDA_MODELS = [
  ["zhida-fast-1p5", "快速回答", "适合短问答"],
  ["zhida-thinking-1p5", "深度思考", "展示分析过程"],
  ["zhida-agent", "智能思考", "更完整的任务处理"],
] as const;

function getZhihuConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem("article-flow-config") || "{}");
    return { zhihuAccessSecret: saved.zhihuAccessSecret || "" };
  } catch {
    return { zhihuAccessSecret: "" };
  }
}

async function zhihuPost(path: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, config: getZhihuConfig() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function contentTypeLabel(type: string) {
  const labels: Record<string, string> = { Answer: "回答", Article: "文章", Question: "问题", Pin: "想法", ZVideo: "视频" };
  return labels[type] || type || "内容";
}

function authorityLabel(level: string) {
  const labels: Record<string, string> = { "1": "低权威", "2": "中权威", "3": "高权威", "4": "超高权威" };
  return labels[level] || (level ? `权威 ${level}` : "");
}

function formatTime(timestamp: number) {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleString("zh-CN", { hour12: false });
}

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

function taskLabel(status: string) {
  if (status === "pending") return "排队中";
  if (status === "running") return "处理中";
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "失败";
  return status || "准备中";
}

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function pollZhihuTask(path: string, taskId: string, onUpdate: (task: AsyncTask) => void) {
  let current: AsyncTask | null = null;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, TASK_POLL_MS));
    current = await zhihuPost(path, { taskId }) as AsyncTask;
    onUpdate(current);
    if (current.taskStatus !== "pending" && current.taskStatus !== "running") return current;
  }
  throw new Error("任务等待超时，请稍后重试");
}

function Excerpt({ text }: { text: string }) {
  const nodes: Array<string | JSX.Element> = [];
  const source = text || "";
  const regex = /<em>(.*?)<\/em>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(source))) {
    if (match.index > last) nodes.push(source.slice(last, match.index));
    nodes.push(<em key={key++}>{match[1]}</em>);
    last = match.index + match[0].length;
  }
  if (last < source.length) nodes.push(source.slice(last));
  return <p className="zhihu-excerpt">{nodes.length ? nodes : "暂无摘要"}</p>;
}

export default function ZhihuDataPage({ notify, onOpenSettings }: { notify: (message: string) => void; onOpenSettings: () => void }) {
  const [tab, setTab] = useState<ToolTab>("hot");
  const [quota, setQuota] = useState<QuotaItem[]>([]);
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [quotaError, setQuotaError] = useState("");
  const missingSecret = quotaError.includes("请先在配置中心");

  const loadQuota = async (silent = false) => {
    setQuotaLoading(true);
    if (!silent) setQuotaError("");
    try {
      const data = await zhihuPost("/api/zhihu/quota");
      setQuota(data.items || []);
      setQuotaError("");
    } catch (error: any) {
      setQuota([]);
      setQuotaError(error.message || "额度查询失败");
    } finally {
      setQuotaLoading(false);
    }
  };

  useEffect(() => { loadQuota(true); }, []); // Load quota once when entering the page.

  return (
    <div className="page zhihu-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ZHIHU OPEN DATA</p>
          <h1>知乎数据</h1>
          <p className="hero-sub">查看当日额度，检索热榜与全网内容，或使用直答、PDF 解析和 PPT 生成。</p>
        </div>
        <button className="ghost-btn" onClick={() => loadQuota()} disabled={quotaLoading}>
          <RefreshCw size={15} className={quotaLoading ? "spin" : undefined}/> {quotaLoading ? "刷新中..." : "刷新额度"}
        </button>
      </div>

      {missingSecret ? (
        <div className="panel zhihu-empty">
          <KeyRound size={22}/>
          <b>还没有配置知乎数据密钥</b>
          <p>请到配置中心填写知乎数据开放平台 Access Secret，保存后再回来使用。</p>
          <button className="primary-btn" onClick={onOpenSettings}>前往配置中心 <ChevronRight size={16}/></button>
        </div>
      ) : (
        <>
          <div className="zhihu-quota-grid">
            {quotaLoading && !quota.length ? Array.from({ length: 5 }).map((_, index) => (
              <div className="zhihu-quota-card skeleton" key={index}><small>查询中</small><strong>--</strong><span>正在读取当日额度</span><div className="progress"><span style={{ width: "18%" }}/></div></div>
            )) : quotaError ? (
              <div className="zhihu-quota-error">{quotaError}</div>
            ) : quota.map((item) => {
              const percent = item.totalQuota > 0 ? Math.min(100, Math.round((item.totalUsed / item.totalQuota) * 100)) : 0;
              return (
                <div className="zhihu-quota-card" key={item.apiId}>
                  <small>{item.apiName}</small>
                  <strong>{item.remainingQuota.toLocaleString()}</strong>
                  <span>剩余 · 已用 {item.totalUsed.toLocaleString()} / {item.totalQuota.toLocaleString()}</span>
                  <div className="progress"><span style={{ width: `${percent}%` }}/></div>
                </div>
              );
            })}
          </div>

          <div className="zhihu-tabs">
            {([["hot", "知乎热榜"], ["global", "全网搜索"], ["zhihu", "知乎搜索"], ["zhida", "知乎直答"], ["pdf", "PDF 解析"], ["ppt", "PPT 生成"]] as const).map(([key, label]) => (
              <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          {tab === "hot" ? <HotListTab notify={notify}/> : tab === "global" ? <GlobalSearchTab notify={notify}/> : tab === "zhihu" ? <ZhihuSearchTab notify={notify}/> : tab === "zhida" ? <ZhidaTab notify={notify}/> : tab === "pdf" ? <PdfTab notify={notify}/> : <PptTab notify={notify}/>}
        </>
      )}
    </div>
  );
}

function HotListTab({ notify }: { notify: (message: string) => void }) {
  const [limit, setLimit] = useState(30);
  const [refreshId, setRefreshId] = useState(0);
  const [items, setItems] = useState<HotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    zhihuPost("/api/zhihu/hot-list", { limit }).then((data) => {
      if (cancelled) return;
      setItems(data.items || []);
      setLastUpdated(Date.now());
    }).catch((err: any) => {
      if (cancelled) return;
      setItems([]);
      setError(err.message || "热榜加载失败");
      notify(err.message || "热榜加载失败");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
    // notify is recreated each parent render and should not retrigger the hot list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, refreshId]);

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshId((value) => value + 1), HOT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [limit, refreshId]);

  return (
    <div className="panel zhihu-panel">
      <div className="panel-title">
        <div>
          <h2>知乎热榜</h2>
          <p>当前站内正在讨论的问题和文章。</p>
        </div>
        <div className="zhihu-toolbar">
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            <option value={10}>10 条</option>
            <option value={20}>20 条</option>
            <option value={30}>30 条</option>
          </select>
          <button className="ghost-btn" onClick={() => setRefreshId((value) => value + 1)} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : undefined}/> {loading ? "刷新中..." : "刷新"}</button>
        </div>
      </div>
      <p className="zhihu-hot-hint">热榜每 15 分钟自动更新一次，也可点击刷新立即更新。{lastUpdated ? `上次更新 ${formatClock(lastUpdated)}。` : ""}</p>
      {error ? <div className="empty-state">{error}</div> : loading && !items.length ? <div className="empty-state">正在获取热榜...</div> : items.length ? (
        <div className="zhihu-hot-list">
          {items.map((item, index) => (
            <a className="zhihu-hot-item" href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${index}`}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt=""/> : <div className="zhihu-thumb-fallback"><TrendingUp size={16}/></div>}
              <span>
                <strong>{item.title}</strong>
                <small>{item.summary || "暂无摘要"}</small>
              </span>
              <ExternalLink size={14}/>
            </a>
          ))}
        </div>
      ) : <div className="empty-state">当前没有热榜内容</div>}
    </div>
  );
}

function GlobalSearchTab({ notify }: { notify: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(10);
  const [searchDB, setSearchDB] = useState("all");
  const [host, setHost] = useState("");
  const [since, setSince] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    const keyword = query.trim();
    if (!keyword) { notify("请输入搜索关键词"); return; }
    const parts = [];
    if (host.trim()) parts.push(`host=="${host.trim()}"`);
    if (since) {
      const timestamp = Math.floor(new Date(`${since}T00:00:00`).getTime() / 1000);
      if (Number.isFinite(timestamp)) parts.push(`publish_time>=${timestamp}`);
    }
    setLoading(true);
    setError("");
    try {
      const data = await zhihuPost("/api/zhihu/global-search", { query: keyword, count, searchDB, filter: parts.join(" AND ") || undefined });
      setItems(data.items || []);
      if (!(data.items || []).length) setError("没有找到匹配内容");
    } catch (err: any) {
      setItems([]);
      setError(err.message || "全网搜索失败");
      notify(err.message || "全网搜索失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel zhihu-panel">
      <div className="panel-title">
        <div>
          <h2>全网搜索</h2>
          <p>按关键词检索全网内容，可限定站点和发布时间。</p>
        </div>
      </div>
      <form className="zhihu-search-form" onSubmit={(event) => { event.preventDefault(); search(); }}>
        <label className="zhihu-query">
          <Search size={15}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词，例如：ChatGPT 值不值得开会员"/>
        </label>
        <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
          {[5, 10, 15, 20].map((value) => <option key={value} value={value}>{value} 条</option>)}
        </select>
        <select value={searchDB} onChange={(event) => setSearchDB(event.target.value)}>
          <option value="all">全部索引库</option>
          <option value="realtime">仅实时库</option>
          <option value="static">仅静态库</option>
        </select>
        <input value={host} onChange={(event) => setHost(event.target.value)} placeholder="站点，如 example.com"/>
        <input type="date" value={since} onChange={(event) => setSince(event.target.value)}/>
        <button className="primary-btn" type="submit" disabled={loading}><Search size={15}/> {loading ? "搜索中..." : "搜索"}</button>
      </form>
      {loading && !items.length ? <div className="empty-state">正在搜索全网内容...</div> : error && !items.length ? <div className="empty-state">{error}</div> : <SearchResultList items={items} showScore={false}/>}
    </div>
  );
}

function ZhihuSearchTab({ notify }: { notify: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(10);
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    const keyword = query.trim();
    if (!keyword) { notify("请输入搜索关键词"); return; }
    let sortBy = "";
    if (sortField) {
      const range = min || max ? `:(${min},${max})` : "";
      sortBy = `${sortField}:${sortDir}${range}`;
    }
    setLoading(true);
    setError("");
    try {
      const data = await zhihuPost("/api/zhihu/search", { query: keyword, count, sortBy: sortBy || undefined });
      setItems(data.items || []);
      if (!(data.items || []).length) setError(data.emptyReason || "没有找到匹配内容");
    } catch (err: any) {
      setItems([]);
      setError(err.message || "知乎搜索失败");
      notify(err.message || "知乎搜索失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel zhihu-panel">
      <div className="panel-title">
        <div>
          <h2>知乎搜索</h2>
          <p>检索知乎站内问题、回答和文章，可按赞同、评论或时间排序。</p>
        </div>
      </div>
      <form className="zhihu-search-form zhihu-search-form-wide" onSubmit={(event) => { event.preventDefault(); search(); }}>
        <label className="zhihu-query">
          <Search size={15}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词，例如：RAG 评测方法"/>
        </label>
        <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
          {[5, 8, 10].map((value) => <option key={value} value={value}>{value} 条</option>)}
        </select>
        <select value={sortField} onChange={(event) => setSortField(event.target.value)}>
          <option value="">默认排序</option>
          <option value="VoteUpCount">按赞同</option>
          <option value="CommentCount">按评论</option>
          <option value="EditTime">按时间</option>
        </select>
        <select value={sortDir} onChange={(event) => setSortDir(event.target.value)} disabled={!sortField}>
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
        <input value={min} onChange={(event) => setMin(event.target.value)} placeholder="最小" disabled={!sortField}/>
        <input value={max} onChange={(event) => setMax(event.target.value)} placeholder="最大" disabled={!sortField}/>
        <button className="primary-btn" type="submit" disabled={loading}><Search size={15}/> {loading ? "搜索中..." : "搜索"}</button>
      </form>
      {loading && !items.length ? <div className="empty-state">正在搜索知乎内容...</div> : error && !items.length ? <div className="empty-state">{error}</div> : <SearchResultList items={items} showScore/>}
    </div>
  );
}

function SearchResultList({ items, showScore }: { items: SearchItem[]; showScore: boolean }) {
  if (!items.length) return null;
  return (
    <div className="zhihu-result-list">
      {items.map((item, index) => (
        <article className="zhihu-result-card" key={`${item.contentId}-${index}`}>
          <div className="zhihu-result-head">
            <span className="pill pending">{contentTypeLabel(item.contentType)}</span>
            {authorityLabel(item.authorityLevel) && <span className="pill success">{authorityLabel(item.authorityLevel)}</span>}
            {showScore && item.rankingScore != null && <small>相关 {item.rankingScore.toFixed(2)}</small>}
          </div>
          <a href={item.url} target="_blank" rel="noreferrer"><b>{item.title}</b></a>
          <Excerpt text={item.contentText}/>
          <div className="zhihu-result-meta">
            {item.authorAvatar ? <img src={item.authorAvatar} alt=""/> : <i/>}
            <span>{item.authorName || "知乎用户"}{item.authorBadgeText ? ` · ${item.authorBadgeText}` : ""}</span>
            <span><ThumbsUp size={12}/> {item.voteUpCount.toLocaleString()}</span>
            <span><MessageCircle size={12}/> {item.commentCount.toLocaleString()}</span>
            {item.editTime ? <span>{formatTime(item.editTime)}</span> : null}
            <a href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={12}/> 打开</a>
          </div>
          {item.commentInfoList?.length ? (
            <div className="zhihu-comments">
              {item.commentInfoList.slice(0, 3).map((comment, commentIndex) => <p key={commentIndex}>{comment.content}</p>)}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ZhidaTab({ notify }: { notify: (message: string) => void }) {
  const [model, setModel] = useState("zhida-fast-1p5");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;
    const userTurn: ChatTurn = { role: "user", content: question };
    const history = [...turns, userTurn];
    setTurns([...history, { role: "assistant", content: "", reasoning: "" }]);
    setInput("");
    setLoading(true);
    const contextual = model !== "zhida-agent";
    const messages = (contextual ? history : [userTurn]).map((turn) => ({ role: turn.role, content: turn.content }));
    try {
      const response = await fetch("/api/zhihu/zhida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true, config: getZhihuConfig() }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || contentType.includes("application/json")) {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "直答失败");
        setTurns((current) => current.map((turn, index) => index === current.length - 1 ? { role: "assistant", content: data.content || "", reasoning: data.reasoning || "" } : turn));
        return;
      }
      if (!response.body) throw new Error("直答没有返回内容");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      let reasoning = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          let payload: any = null;
          try { payload = JSON.parse(data); } catch { continue; }
          if (payload.error?.message || payload.choices?.[0]?.finish_reason === "error") {
            throw new Error(payload.error?.message || "直答生成失败");
          }
          const delta = payload.choices?.[0]?.delta || {};
          if (typeof delta.reasoning_content === "string") reasoning += delta.reasoning_content;
          if (typeof delta.content === "string") content += delta.content;
          const nextContent = content;
          const nextReasoning = reasoning;
          setTurns((current) => current.map((turn, index) => index === current.length - 1 ? { role: "assistant", content: nextContent, reasoning: nextReasoning } : turn));
        }
      }
    } catch (error: any) {
      const message = error.message || "直答失败";
      notify(message);
      setTurns((current) => current.map((turn, index) => index === current.length - 1 ? { role: "assistant", content: message, error: true } : turn));
    } finally {
      setLoading(false);
    }
  };

  const modelHint = useMemo(() => ZHIDA_MODELS.find((item) => item[0] === model)?.[2] || "", [model]);

  return (
    <div className="panel zhihu-panel zhihu-chat">
      <div className="panel-title">
        <div>
          <h2>知乎直答</h2>
          <p>{modelHint}。深度思考会单独展示分析过程。</p>
        </div>
        <div className="zhihu-toolbar">
          <select value={model} onChange={(event) => setModel(event.target.value)} disabled={loading}>
            {ZHIDA_MODELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <button className="ghost-btn" onClick={() => setTurns([])} disabled={loading || !turns.length}>新对话</button>
        </div>
      </div>
      <div className="zhihu-chat-log" ref={scroller}>
        {turns.length === 0 ? (
          <div className="zhihu-chat-empty">
            <Sparkles size={18}/>
            <p>问一个问题，例如「怎么理解 rave 文化」。</p>
          </div>
        ) : turns.map((turn, index) => (
          <div className={`zhihu-bubble ${turn.role}${turn.error ? " error" : ""}`} key={`${turn.role}-${index}`}>
            <small>{turn.role === "user" ? "我" : "直答"}</small>
            {turn.reasoning ? <pre className="zhihu-reasoning">{turn.reasoning}</pre> : null}
            <div>{turn.content || (loading && index === turns.length - 1 ? "正在生成..." : "")}</div>
          </div>
        ))}
      </div>
      <form className="zhihu-chat-input" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入你的问题" disabled={loading}/>
        <button className="primary-btn" type="submit" disabled={loading || !input.trim()}><Send size={15}/> {loading ? "生成中" : "发送"}</button>
      </form>
    </div>
  );
}

function TaskProgress({ task }: { task: AsyncTask | null }) {
  if (!task) return null;
  const percent = Math.round(Math.min(1, Math.max(0, task.progress || 0)) * 100);
  return (
    <div className="zhihu-task-progress">
      <div><span style={{ width: `${task.taskStatus === "succeeded" ? 100 : percent}%` }}/></div>
      <small>{taskLabel(task.taskStatus)} · {task.taskStatus === "succeeded" ? 100 : percent}%</small>
    </div>
  );
}

function PdfTab({ notify }: { notify: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [task, setTask] = useState<AsyncTask | null>(null);
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [summary, setSummary] = useState("");
  const [resultUrl, setResultUrl] = useState("");

  const parse = async () => {
    if (!file || running) return;
    if (file.size > 100 * 1024 * 1024) { notify("PDF 文件不能超过 100MB"); return; }
    setRunning(true);
    setTask(null);
    setPages([]);
    setSummary("");
    setResultUrl("");
    setStatus("正在上传 PDF...");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("zhihuAccessSecret", getZhihuConfig().zhihuAccessSecret);
      const uploadResponse = await fetch("/api/zhihu/pdf/upload", { method: "POST", body: form });
      const uploaded = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) throw new Error(uploaded.error || "PDF 上传失败");
      setStatus("已上传，正在创建解析任务...");
      const created = await zhihuPost("/api/zhihu/pdf/tasks", { fileId: uploaded.fileId, idempotencyKey: newIdempotencyKey("pdf") }) as AsyncTask;
      setTask(created);
      const current = created.taskStatus === "pending" || created.taskStatus === "running"
        ? await pollZhihuTask("/api/zhihu/pdf/status", created.taskId, (next) => {
          setTask(next);
          setStatus(next.taskStatus === "pending" ? "任务排队中..." : "正在解析 PDF...");
        })
        : created;
      if (current.taskStatus === "failed") throw new Error(current.error?.message || "PDF 解析失败");
      setSummary(current.result?.summary || "");
      setResultUrl(current.result?.url || "");
      if (current.result?.url) {
        setStatus("正在拉取解析结果...");
        const payload = await zhihuPost("/api/zhihu/pdf/result", { url: current.result.url });
        setPages(Array.isArray(payload.result?.pages) ? payload.result.pages : []);
      }
      setStatus("解析完成");
      notify("PDF 解析完成");
    } catch (error: any) {
      const message = error.message || "PDF 解析失败";
      setStatus(message);
      notify(message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="panel zhihu-panel">
      <div className="panel-title">
        <div>
          <h2>PDF 解析</h2>
          <p>上传 PDF（最大 100MB），异步解析正文、公式和图片。</p>
        </div>
      </div>
      <div className="zhihu-tool-form">
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => setFile(event.target.files?.[0] || null)}/>
        <button className="ghost-btn" type="button" onClick={() => inputRef.current?.click()} disabled={running}><Upload size={14}/> {file ? file.name : "选择 PDF 文件"}</button>
        {file ? <small>{Math.max(1, Math.round(file.size / 1024))} KB</small> : <small>仅支持 PDF</small>}
        <button className="primary-btn" type="button" onClick={parse} disabled={running || !file}><FileText size={15}/> {running ? "解析中..." : "开始解析"}</button>
      </div>
      {status ? <p className="zhihu-task-status">{status}</p> : null}
      <TaskProgress task={task}/>
      {summary ? <div className="zhihu-pdf-summary"><small>摘要</small><p>{summary}</p></div> : null}
      {resultUrl ? <a className="zhihu-download" href={resultUrl} target="_blank" rel="noreferrer"><Download size={14}/> 下载解析 JSON</a> : null}
      {pages.length ? (
        <div className="zhihu-pdf-pages">
          {pages.map((page, index) => (
            <article className="zhihu-pdf-page" key={`${page.page}-${index}`}>
              <b>第 {(page.page ?? index) + 1} 页</b>
              {(page.blocks || []).map((block, blockIndex) => {
                if (block.image?.data) {
                  return <img key={blockIndex} alt={block.content || "PDF 图片"} src={`data:${block.image.media_type || "image/jpeg"};base64,${block.image.data}`}/>;
                }
                if (!block.content) return null;
                return <p className={block.type === "title" ? "title" : undefined} key={blockIndex}>{block.content}</p>;
              })}
            </article>
          ))}
        </div>
      ) : !running && !status ? <div className="empty-state">选择一份 PDF 后开始解析</div> : null}
    </div>
  );
}

function PptTab({ notify }: { notify: (message: string) => void }) {
  const [resourceUrl, setResourceUrl] = useState("");
  const [numPages, setNumPages] = useState(12);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [task, setTask] = useState<AsyncTask | null>(null);

  const generate = async () => {
    const url = resourceUrl.trim();
    if (!url) { notify("请填写知乎回答或文章链接"); return; }
    setRunning(true);
    setTask(null);
    setStatus("正在创建 PPT 任务...");
    try {
      const created = await zhihuPost("/api/zhihu/ppt/tasks", { resourceUrl: url, numPages, idempotencyKey: newIdempotencyKey("ppt") }) as AsyncTask;
      setTask(created);
      const current = created.taskStatus === "pending" || created.taskStatus === "running"
        ? await pollZhihuTask("/api/zhihu/ppt/status", created.taskId, (next) => {
          setTask(next);
          setStatus(next.taskStatus === "pending" ? "任务排队中..." : "正在生成 PPT...");
        })
        : created;
      if (current.taskStatus === "failed") throw new Error(current.error?.message || "PPT 生成失败");
      setStatus("PPT 已生成");
      notify("PPT 生成完成");
    } catch (error: any) {
      const message = error.message || "PPT 生成失败";
      setStatus(message);
      notify(message);
    } finally {
      setRunning(false);
    }
  };

  const expires = task?.result?.expiresAtMs ? formatTime(Math.floor(task.result.expiresAtMs / 1000)) : "";

  return (
    <div className="panel zhihu-panel">
      <div className="panel-title">
        <div>
          <h2>PPT 生成</h2>
          <p>根据知乎回答或专栏文章链接异步生成 PPTX，页数 6–21。</p>
        </div>
      </div>
      <form className="zhihu-tool-form zhihu-ppt-form" onSubmit={(event) => { event.preventDefault(); generate(); }}>
        <label className="zhihu-query">
          <Presentation size={15}/>
          <input value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="粘贴知乎回答或专栏文章链接" disabled={running}/>
        </label>
        <label className="zhihu-pages">
          页数
          <input type="number" min={6} max={21} value={numPages} onChange={(event) => setNumPages(Number(event.target.value))} disabled={running}/>
        </label>
        <button className="primary-btn" type="submit" disabled={running || !resourceUrl.trim()}><Presentation size={15}/> {running ? "生成中..." : "生成 PPT"}</button>
      </form>
      {status ? <p className="zhihu-task-status">{status}</p> : null}
      <TaskProgress task={task}/>
      {task?.result?.url ? (
        <div className="zhihu-ppt-result">
          <a className="zhihu-download" href={task.result.url} target="_blank" rel="noreferrer"><Download size={14}/> 下载 PPTX</a>
          {expires ? <small>链接有效至 {expires}，过期后可重新查询任务刷新。</small> : null}
        </div>
      ) : !running && !status ? <div className="empty-state">支持回答链接和专栏文章链接</div> : null}
    </div>
  );
}
