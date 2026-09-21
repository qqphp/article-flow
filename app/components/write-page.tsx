"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Bot, Check, Clock3, FileText, Hash, Image as ImageIcon, LayoutDashboard, RefreshCw, Search, Send, Sparkles, Wand2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { defaultStyleId, defaultStyleTitle, defaultTopic, NEW_ARTICLE_EVENT, steps, type ArticleStyle } from "./studio-constants";
import { useNotify } from "./notify";
import { MaterialPickerModal } from "./materials";
import { GENERATE_MAX_OUTPUT_TOKENS } from "../lib/model-limits";
import { countArticleWords } from "../lib/word-count";

const WRITE_DRAFT_KEY = "article-flow-write-draft";

function readWriteDraft() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(WRITE_DRAFT_KEY) || "null") as { topic?: unknown; styleId?: unknown; searchOn?: unknown } | null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      topic: typeof parsed.topic === "string" ? parsed.topic : "",
      styleId: typeof parsed.styleId === "string" ? parsed.styleId : "",
      searchOn: typeof parsed.searchOn === "boolean" ? parsed.searchOn : true,
    };
  } catch {
    return null;
  }
}

function withAssetVersion(url: string, version: string) {
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}
function withArticleAssetVersion(article: any, version: string) {
  const versionedLayout = typeof article?.layoutContent === "string"
    ? article.layoutContent.replace(/\/api\/articles\/[^/\s)]+\/assets\/[^)\s?]+/g, (url: string) => withAssetVersion(url, version))
    : article?.layoutContent;
  return {
    ...article,
    imageUrl: article?.imageUrl ? withAssetVersion(article.imageUrl, version) : article?.imageUrl,
    paragraphImages: Array.isArray(article?.paragraphImages) ? article.paragraphImages.map((image: any) => image?.url ? { ...image, url: withAssetVersion(image.url, version) } : image) : article?.paragraphImages,
    layoutContent: versionedLayout,
  };
}

function isAbortError(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && (error as { name: string }).name === "AbortError");
}

function articleHasImages(saved: any) {
  return Boolean(saved?.layoutContent || saved?.imageUrl || (Array.isArray(saved?.paragraphImages) && saved.paragraphImages.some((image: any) => image?.url)));
}

function normalizeMarkdown(content: string) {
  return content.replace(/\\(\*{1,3}|_{1,3}|~{2}|`|\[|\]|\(|\))/g, "$1").replace(/\*\*\s*([^*\n]*?\S)\s*\*\*/g, "**$1**").replace(/(\*\*[^*\n]+\*\*)(?=[\u3400-\u9fff])/g, "$1\ufeff").replace(/\r\n/g, "\n");
}

const remarkPlugins = [remarkGfm];

const MemoMarkdown = memo(function MemoMarkdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={remarkPlugins}>{normalizeMarkdown(content || "暂无内容")}</ReactMarkdown>;
});

function OperationProgress({ operation }: { operation: "humanize" | "images" | "publish" }) {
  const label = operation === "humanize" ? "正在进行 AI 去痕处理" : operation === "images" ? "正在生成封面与段落图" : "正在发布到微信公众号";
  return <div className="result-operation-progress"><div><span/></div><small>{label}…</small></div>;
}

export default function WritePage() {
  const notify = useNotify();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedArticleId = searchParams.get("articleId");
  const previousArticleId = useRef<string | null>(null);
  const draftReady = useRef(false);
  const startRef = useRef<() => void>(() => undefined);
  const inflightAbort = useRef<AbortController | null>(null);
  const requestEpoch = useRef(0);
  const busyRef = useRef(false);
  const [topic, setTopic] = useState(defaultTopic);
  const [style, setStyle] = useState(defaultStyleTitle);
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
  const [operation, setOperation] = useState<"humanize" | "images" | "publish" | null>(null);
  const [materialTarget, setMaterialTarget] = useState<{ type: "cover" } | { type: "paragraph"; index: number } | null>(null);
  const [previewTab, setPreviewTab] = useState<"article" | "humanized" | "compare" | "layout" | "images" | "research">("article");
  const [viewMode, setViewMode] = useState<"rendered" | "markdown">("rendered");

  const abortInflight = useCallback(() => {
    requestEpoch.current += 1;
    inflightAbort.current?.abort();
    inflightAbort.current = null;
    busyRef.current = false;
  }, []);

  const beginInflight = () => {
    abortInflight();
    const abort = new AbortController();
    inflightAbort.current = abort;
    return { epoch: requestEpoch.current, abort };
  };

  const syncArticleFromServer = async (articleId: string | undefined, epoch: number) => {
    if (!articleId || epoch !== requestEpoch.current) return;
    try {
      const response = await fetch(`/api/articles/${encodeURIComponent(articleId)}`);
      const data = await response.json();
      if (epoch !== requestEpoch.current || !response.ok || !data.article?.content) return;
      setArticle({ ...data.article, selectedTitle: data.article.selectedTitle || data.article.title });
      setTopic(data.article.topic || defaultTopic);
      setStyle(data.article.style || defaultStyleTitle);
      setGenerated(true);
      setHumanized(Boolean(data.article.humanizedContent));
      setImages(articleHasImages(data.article));
    } catch {
      /* ignore abort/network while leaving the page */
    }
  };

  const resetWriter = useCallback(() => {
    abortInflight();
    setTopic(defaultTopic);
    setStyle(defaultStyleTitle);
    setStyleId(defaultStyleId);
    setSearchOn(true);
    setRunning(false);
    setGenerated(false);
    setHumanized(false);
    setImages(false);
    setArticle(null);
    setOperation(null);
    setMaterialTarget(null);
    setPreviewTab("article");
    setViewMode("rendered");
    try { sessionStorage.removeItem(WRITE_DRAFT_KEY); } catch { /* ignore */ }
  }, [abortInflight]);

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
    let cancelled = false;
    if (!requestedArticleId) {
      if (previousArticleId.current) resetWriter();
      else {
        const draft = readWriteDraft();
        if (draft?.topic) setTopic(draft.topic);
        if (draft?.styleId) setStyleId(draft.styleId);
        if (typeof draft?.searchOn === "boolean") setSearchOn(draft.searchOn);
      }
      previousArticleId.current = null;
      draftReady.current = true;
      return () => { cancelled = true; };
    }
    previousArticleId.current = requestedArticleId;
    draftReady.current = true;
    const applyArticle = (saved: any) => {
      if (!saved?.content) return;
      setArticle({ ...saved, selectedTitle: saved.selectedTitle || saved.title });
      setTopic(saved.topic || defaultTopic);
      setStyle(saved.style || defaultStyleTitle);
      setGenerated(true);
      setHumanized(Boolean(saved.humanizedContent));
      setImages(articleHasImages(saved));
      setOperation(null);
      setMaterialTarget(null);
      setPreviewTab("article");
      setViewMode("rendered");
    };
    void (async () => {
      try {
        const response = await fetch(`/api/articles/${encodeURIComponent(requestedArticleId)}`);
        const data = await response.json();
        if (!response.ok || !data.article) throw new Error(data.error || "文章加载失败");
        if (!cancelled) applyArticle(data.article);
      } catch (error: any) {
        if (!cancelled) {
          resetWriter();
          notify(error.message || "文章加载失败");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [requestedArticleId, resetWriter, notify]);

  useEffect(() => {
    if (!draftReady.current || requestedArticleId) return;
    try { sessionStorage.setItem(WRITE_DRAFT_KEY, JSON.stringify({ topic, styleId, searchOn })); } catch { /* ignore quota */ }
  }, [requestedArticleId, topic, styleId, searchOn]);

  useEffect(() => {
    const articleId = article?.articleId;
    const selectedTitle = article?.selectedTitle;
    if (!articleId || !selectedTitle) return;
    const timer = window.setTimeout(() => {
      fetch(`/api/articles/${encodeURIComponent(articleId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTitle }),
      }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [article?.articleId, article?.selectedTitle]);

  useEffect(() => {
    const onNewArticle = () => resetWriter();
    window.addEventListener(NEW_ARTICLE_EVENT, onNewArticle);
    return () => window.removeEventListener(NEW_ARTICLE_EVENT, onNewArticle);
  }, [resetWriter]);

  useEffect(() => () => { abortInflight(); }, [abortInflight]);

  useEffect(() => {
    if (generated && article?.articleId) window.dispatchEvent(new Event("article-flow-articles-updated"));
  }, [article?.articleId, generated]);

  useEffect(() => {
    const matched = articleStyles.find((item) => item.title === article?.style);
    if (matched) setStyleId(matched.id);
  }, [article?.style, articleStyles]);

  const start = async () => {
    const selectedStyle = articleStyles.find((item) => item.id === styleId);
    if (!selectedStyle) { notify(stylesLoading ? "文章风格正在加载，请稍后重试" : stylesError || "请选择有效的文章风格"); return; }
    if (busyRef.current) return;
    const reuseArticleId = article?.articleId && article.publishStatus !== "已发布" ? article.articleId : undefined;
    const { epoch, abort } = beginInflight();
    busyRef.current = true;
    setRunning(true);
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, styleId: selectedStyle.id, search: searchOn, articleId: reuseArticleId }), signal: abort.signal });
      const data = await response.json();
      if (abort.signal.aborted || epoch !== requestEpoch.current) {
        void syncArticleFromServer(reuseArticleId || requestedArticleId || undefined, epoch);
        return;
      }
      if (!response.ok) throw new Error(data.error || "生成失败");
      if (typeof data.content !== "string" || !data.content.trim()) throw new Error("AI 返回的文章内容为空");
      setArticle({ ...data, selectedTitle: data.selectedTitle || data.title }); setStyle(data.style || selectedStyle.title); setGenerated(true); setHumanized(false); setImages(false);
      const generatedMessage = data.demo ? "已生成演示初稿（配置模型后可生成真实内容）" : "文章初稿已生成";
      notify(data.firecrawlError ? `${generatedMessage}。${data.firecrawlError}` : generatedMessage);
      try { sessionStorage.removeItem(WRITE_DRAFT_KEY); } catch { /* ignore */ }
      if (data.articleId) router.replace(`/write?articleId=${encodeURIComponent(data.articleId)}`);
    } catch (error: any) {
      if (isAbortError(error) || epoch !== requestEpoch.current) {
        void syncArticleFromServer(reuseArticleId || requestedArticleId || undefined, epoch);
        return;
      }
      notify(error.message || "生成失败，请稍后重试");
    } finally {
      if (epoch === requestEpoch.current) {
        busyRef.current = false;
        setRunning(false);
        if (inflightAbort.current === abort) inflightAbort.current = null;
      }
    }
  };
  startRef.current = start;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.key !== "Enter") return;
      event.preventDefault();
      startRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const displayTitle = article?.selectedTitle || article?.title || topic;
  const displayContent = previewTab === "layout" ? (article?.layoutContent || article?.humanizedContent || article?.content) : previewTab === "humanized" ? (article?.humanizedContent || article?.content) : article?.content;
  const titleOptions = Array.from(new Set([article?.title, ...(article?.alternatives || [])].filter((title): title is string => Boolean(title))));
  const firecrawlSources = Array.isArray(article?.sources) ? article.sources : [];
  const imagePlans = Array.isArray(article?.paragraphImages) ? article.paragraphImages : [];
  const paragraphImages = imagePlans.filter((image: any) => image?.url);
  useEffect(() => {
    if (generated && article?.content && !humanized) { setPreviewTab("article"); setViewMode("rendered"); }
  }, [article?.content, article?.title, generated, humanized]);
  const finishOperation = () => { setOperation(null); };
  const handleHumanize = async () => {
    if (!article?.content || operation || running || busyRef.current) return;
    if (images || articleHasImages(article)) {
      if (!window.confirm("去痕会清除已生成的封面和配图，确认继续？")) return;
    }
    const { epoch, abort } = beginInflight();
    busyRef.current = true;
    setOperation("humanize");
    try {
      const response = await fetch("/api/humanize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: article.articleId }), signal: abort.signal });
      const data = await response.json();
      if (abort.signal.aborted || epoch !== requestEpoch.current) {
        void syncArticleFromServer(article.articleId, epoch);
        return;
      }
      if (!response.ok || !data.article?.humanizedContent?.trim()) throw new Error(data.error || "去痕失败");
      setArticle({ ...data.article, selectedTitle: article.selectedTitle }); setHumanized(true); setImages(false); setPreviewTab("humanized");
      notify(data.demo ? "已完成演示去痕（配置模型后效果更完整）" : "去痕处理完成");
    } catch (error: any) {
      if (isAbortError(error) || epoch !== requestEpoch.current) {
        void syncArticleFromServer(article.articleId, epoch);
        return;
      }
      notify(error.message || "去痕失败，请稍后重试");
    } finally {
      if (epoch === requestEpoch.current) {
        busyRef.current = false;
        if (inflightAbort.current === abort) inflightAbort.current = null;
        finishOperation();
      }
    }
  };
  const handleImages = async (target?: { type: "cover" } | { type: "paragraph"; index: number }) => {
    if (operation || running || busyRef.current) return;
    const { epoch, abort } = beginInflight();
    busyRef.current = true;
    setOperation("images");
    try {
      const response = await fetch("/api/article-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: displayTitle, articleId: article?.articleId, mode: target ? "single" : "all", target }), signal: abort.signal });
      const data = await response.json();
      if (abort.signal.aborted || epoch !== requestEpoch.current) {
        void syncArticleFromServer(article?.articleId, epoch);
        return;
      }
      if (!response.ok || !data.article) throw new Error(data.error || "配图失败");
      setArticle({ ...data.article, selectedTitle: article.selectedTitle }); setImages(true); setPreviewTab(data.failed ? "images" : "layout");
      notify(data.failed ? `已完成生成，${data.failed} 张图片失败，可单独再次生成` : target ? "图片生成完成" : "封面与段落图生成完成");
    } catch (error: any) {
      if (isAbortError(error) || epoch !== requestEpoch.current) {
        void syncArticleFromServer(article?.articleId, epoch);
        return;
      }
      notify(error.message || "配图失败，请稍后重试");
    } finally {
      if (epoch === requestEpoch.current) {
        busyRef.current = false;
        if (inflightAbort.current === abort) inflightAbort.current = null;
        finishOperation();
      }
    }
  };
  const handleMaterialReplace = async (materialId: string) => {
    if (!materialTarget || operation || running || busyRef.current) return;
    const target = materialTarget;
    const { epoch, abort } = beginInflight();
    busyRef.current = true;
    setMaterialTarget(null);
    setOperation("images");
    try {
      const response = await fetch("/api/article-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: article?.articleId, mode: "replace", target, materialId }), signal: abort.signal });
      const data = await response.json();
      if (abort.signal.aborted || epoch !== requestEpoch.current) {
        void syncArticleFromServer(article?.articleId, epoch);
        return;
      }
      if (!response.ok || !data.article) throw new Error(data.error || "替换素材失败");
      const updatedArticle = withArticleAssetVersion(data.article, data.assetVersion || `${Date.now()}-${materialId}`);
      setArticle({ ...updatedArticle, selectedTitle: article.selectedTitle }); setImages(true); setPreviewTab("layout");
      notify("已从素材库替换文章图片");
    } catch (error: any) {
      if (isAbortError(error) || epoch !== requestEpoch.current) {
        void syncArticleFromServer(article?.articleId, epoch);
        return;
      }
      notify(error.message || "替换素材失败");
    } finally {
      if (epoch === requestEpoch.current) {
        busyRef.current = false;
        if (inflightAbort.current === abort) inflightAbort.current = null;
        finishOperation();
      }
    }
  };
  const handlePublish = async () => {
    if (!article || operation || running || busyRef.current) return;
    if (article.publishStatus === "已发布") { notify("这篇文章已发布"); return; }
    const { epoch, abort } = beginInflight();
    busyRef.current = true;
    setOperation("publish");
    try {
      const response = await fetch("/api/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: "wechat", title: displayTitle, articleId: article.articleId }), signal: abort.signal });
      const data = await response.json();
      if (abort.signal.aborted || epoch !== requestEpoch.current) {
        void syncArticleFromServer(article.articleId, epoch);
        return;
      }
      if (data.publishStatus) {
        setArticle({ ...article, publishStatus: data.publishStatus, publishedAt: data.publishedAt ?? null });
        window.dispatchEvent(new Event("article-flow-articles-updated"));
      }
      if (!response.ok) throw new Error(data.error || "发布失败");
      if (data.demo) { notify(data.message || "未配置微信公众号凭证，文章仍保持未发布状态"); return; }
      notify(data.message || (data.publishStatus === "已发布" ? "微信公众号已发布" : "微信公众号草稿创建成功"));
    } catch (error: any) {
      if (isAbortError(error) || epoch !== requestEpoch.current) {
        void syncArticleFromServer(article.articleId, epoch);
        return;
      }
      notify(error.message || "发布失败，请检查配置");
    } finally {
      if (epoch === requestEpoch.current) {
        busyRef.current = false;
        if (inflightAbort.current === abort) inflightAbort.current = null;
        finishOperation();
      }
    }
  };
  const sourceSummary = (description: string) => normalizeMarkdown(description).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[>#*_`]/g, "").replace(/\s+/g, " ").trim();
  const renderMarkdown = (content: string) => <MemoMarkdown content={content} />;
  const renderContent = (content: string, mode = viewMode) => mode === "markdown" ? <pre className="markdown-source">{content || "暂无内容"}</pre> : renderMarkdown(content);
  const currentStep = images ? 3 : humanized ? 2 : generated ? 1 : 0;
  return <div className="page write-page"><div className="page-heading"><div><p className="eyebrow">创作工作台</p><h1>写一篇新文章</h1><p className="hero-sub">把一个想法，变成值得分享的内容。</p></div><div className="autosave"><span className="green-dot"/> {article?.articleId ? "所选标题会自动保存" : "主题草稿仅保存在本页"}</div></div><div className="stepper">{steps.map((s:string,i:number)=><div className={i===currentStep ? "step active" : i<currentStep ? "step done" : "step"} key={s}><span>{i<currentStep?<Check size={13}/>:i+1}</span>{s}{i<steps.length-1&&<i/>}</div>)}</div>
    <div className="write-layout"><div className="write-main"><div className="panel"><div className="panel-title"><div><h2>告诉我你想写什么</h2><p>描述越具体，生成的内容越贴近你的想法。</p></div><span className="tip"><Sparkles size={15}/> AI 辅助</span></div><label>文章主题</label><textarea value={topic} onChange={(e:any)=>setTopic(e.target.value)} rows={3}/><div className="label-row"><label>写作风格</label><span>{styleId === defaultStyleId ? "推荐" : ""}</span></div><div className="style-grid">{stylesLoading ? <div className="style-state">正在加载文章风格...</div> : stylesError ? <div className="style-state error">{stylesError}</div> : articleStyles.map((item: ArticleStyle)=><button className={styleId===item.id?"style-option selected":"style-option"} key={item.id} onClick={()=>setStyleId(item.id)}><span className="radio">{styleId===item.id&&<i/>}</span><div><b>{item.title}</b><small>{item.summary || "查看完整风格指南"}</small></div></button>)}</div><div className="option-row"><div className="option-label"><div className="option-icon"><Search size={17}/></div><div><b>先搜索资料再写作</b><small>调用 Firecrawl 获取最新信息，让文章更有依据</small></div></div><button className={searchOn?"toggle on":"toggle"} onClick={()=>setSearchOn(!searchOn)}><i/></button></div><button className="generate-btn" onClick={start} disabled={running || Boolean(operation) || stylesLoading || !articleStyles.length}>{running?<><RefreshCw className="spin" size={18}/> 正在生成中...</>:<><Sparkles size={18}/> 开始生成文章 <span>Ctrl / ⌘ Enter</span></>}</button><p className="generate-hint">输出上限 {GENERATE_MAX_OUTPUT_TOKENS.toLocaleString()} tokens。若返回无法解析的 JSON，通常是篇幅超限，请缩短主题后重试。</p></div></div><aside className="write-side"><div className="side-card"><div className="side-card-title"><Sparkles size={16}/> 本次生成会包含</div>{[[<FileText size={16}/> ,"3–6 个备选标题"],[<BookOpen size={16}/> ,"完整 Markdown 文章"],[<LayoutDashboard size={16}/> ,"结构化排版建议"],[<Hash size={16}/> ,`输出上限 ${GENERATE_MAX_OUTPUT_TOKENS.toLocaleString()} tokens`],[<Clock3 size={16}/> ,"预计 2–4 分钟"]].map(([icon,text],i)=><div className="include-row" key={i}>{icon}<span>{text}</span><Check size={15}/></div>)}</div><div className="side-card tips-card"><div className="side-card-title"><Bot size={16}/> 写作小贴士</div><p>好的主题通常包含「对象 + 场景 + 结果」。比如：</p><div className="example">“帮我写一篇给产品经理看的，关于 AI 提效的实操指南”</div></div></aside></div>
    {generated && <div className="result-panel"><div className="result-header"><div className="result-title-block"><span className="pill success">已生成</span><h2>{displayTitle}</h2><p>{style} · {countArticleWords(article?.humanizedContent || article?.content || "").toLocaleString()} 字 · {titleOptions.length} 个备选标题</p><div className="title-options" aria-label="备选标题">{titleOptions.map((title, index) => <button key={`${title}-${index}`} className={displayTitle === title ? "title-option selected" : "title-option"} onClick={() => { setArticle({ ...article, selectedTitle: title }); }}>{title}</button>)}</div></div><button className="ghost-btn" onClick={start} disabled={running || Boolean(operation)}><RefreshCw size={16}/> 重新生成</button></div><div className="result-actions"><div className="action-task"><button className={humanized?"action active":"action"} onClick={humanized?()=>{setPreviewTab("humanized");notify("已显示去痕文章")}:handleHumanize} disabled={running || Boolean(operation)}><Wand2 size={16}/> {humanized?"查看 AI 去痕":"AI 去痕处理"}</button></div><div className="action-task"><button className={images?"action active":"action"} onClick={() => handleImages()} disabled={running || Boolean(operation)}><ImageIcon size={16}/> {images?"重新生成封面与配图":"生成封面与配图"}</button></div><button className="publish-btn" onClick={handlePublish} disabled={running || Boolean(operation) || article?.publishStatus === "已发布"}><Send size={16}/> {article?.publishStatus === "已发布" ? "已发布到微信公众号" : article?.publishStatus === "已创建草稿" ? "继续发布到微信公众号" : "发布到微信公众号"}</button></div>{operation && <OperationProgress operation={operation}/>}<div className="preview-tabs"><button className={previewTab==="article"?"active":""} onClick={()=>setPreviewTab("article")}>文章预览</button>{humanized && <button className={previewTab==="humanized"?"active":""} onClick={()=>setPreviewTab("humanized")}>AI 去痕</button>}{humanized && <button className={previewTab==="compare"?"active":""} onClick={()=>setPreviewTab("compare")}>对比原文</button>}{(article?.firecrawlSearched || article?.firecrawlError) && <button className={previewTab==="research"?"active":""} onClick={()=>setPreviewTab("research")}>搜索资料{firecrawlSources.length ? ` (${firecrawlSources.length})` : ""}</button>}<button className={previewTab==="layout"?"active":""} onClick={()=>setPreviewTab("layout")}>排版预览</button><button className={previewTab==="images"?"active":""} onClick={()=>setPreviewTab("images")}>文章配图{imagePlans.length ? ` (${imagePlans.length + (article?.coverPrompt ? 1 : 0)})` : ""}</button></div>{previewTab!=="layout" && previewTab!=="images" && previewTab!=="research" && <div className="format-toggle"><button className={viewMode==="rendered"?"active":""} onClick={()=>setViewMode("rendered")}>样式预览</button><button className={viewMode==="markdown"?"active":""} onClick={()=>setViewMode("markdown")}>Markdown 原文</button></div>}{previewTab==="research" ? <div className="research-results"><h3>Firecrawl 搜索资料</h3>{article?.firecrawlError ? <p>{article.firecrawlError}</p> : firecrawlSources.length ? <div className="research-source-list">{firecrawlSources.map((source: any, index: number) => <a className="research-source" href={source.url} target="_blank" rel="noreferrer" key={`${source.url}-${index}`}><b>{source.title || source.url}</b>{source.description && <p>{sourceSummary(source.description)}</p>}<small>{source.url}</small></a>)}</div> : <p>本次搜索未返回可用资料。</p>}</div> : previewTab==="images" ? <ArticleImagesTab article={article} imagePlans={imagePlans} generating={operation === "images"} onGenerate={handleImages} onChooseMaterial={setMaterialTarget}/> : <div key={`${previewTab}-${displayTitle}-${article?.content || ""}`} className={previewTab==="compare"?"compare-preview":"article-preview"}>{previewTab!=="layout" && <div className="preview-cover"><h3>{displayTitle}</h3></div>}{previewTab==="compare" ? <div className="compare-columns">{[ ["原文", article?.content || ""], ["AI 去痕", article?.humanizedContent || ""] ].map(([label, content])=><div key={label as string}><small>{label}</small><div className="article-preview compare-article">{renderContent(content as string)}</div></div>)}</div> : previewTab==="layout" ? <>{article?.imageUrl && <figure className="layout-cover-image"><img src={article.imageUrl} alt="文章封面"/></figure>}{renderMarkdown(displayContent || article?.content || "暂无内容")}</> : renderContent(displayContent || "")}</div>}</div>}
    {materialTarget && <MaterialPickerModal type={materialTarget.type === "cover" ? "cover" : "paragraph"} onClose={() => setMaterialTarget(null)} onSelect={handleMaterialReplace}/>}
  </div>;
}

function ArticleImagesTab({ article, imagePlans, generating, onGenerate, onChooseMaterial }: { article: any; imagePlans: any[]; generating: boolean; onGenerate: (target?: { type: "cover" } | { type: "paragraph"; index: number }) => void; onChooseMaterial: (target: { type: "cover" } | { type: "paragraph"; index: number }) => void }) {
  const coverStatus = article?.coverError ? "生成失败" : article?.imageUrl ? "已生成" : article?.coverPrompt ? "待生成" : "未规划";
  const actionLabel = (hasImage: boolean, error?: string) => error || !hasImage ? "生成图片" : "重新生成";
  if (!article?.coverPrompt && !imagePlans.length) return <div className="image-plans-empty"><ImageIcon size={20}/><p>尚未生成配图提示词</p><small>点击上方“生成封面与配图”，系统会先规划封面和段落配图。</small></div>;
  return <section className="image-plans" aria-label="文章配图"><div className="image-plans-head"><div><p className="eyebrow">IMAGE PLAN</p><h3>封面与段落配图</h3><span>展示每张图的生成提示词；失败的图片可单独再次生成或从素材库替换。</span></div><b>{(article?.coverPrompt ? 1 : 0) + imagePlans.length} 张计划图片</b></div><div className="image-plan-grid"><article className="image-plan-card cover"><div className="image-plan-preview">{article?.imageUrl ? <img src={article.imageUrl} alt="文章封面"/> : <div className="image-plan-placeholder"><ImageIcon size={24}/><span>{coverStatus}</span></div>}</div><div className="image-plan-content"><div className="image-plan-title"><span>封面图</span><i className={article?.coverError ? "failed" : article?.imageUrl ? "ready" : "pending"}>{coverStatus}</i></div><p className="image-plan-prompt">{article?.coverPrompt || "正在等待提示词"}</p>{article?.coverError && <small className="image-plan-error">{article.coverError}</small>}<div className="image-plan-actions"><button className="image-plan-action" onClick={() => onGenerate({ type: "cover" })} disabled={generating || !article?.coverPrompt}><RefreshCw size={14}/>{generating ? "生成中..." : actionLabel(Boolean(article?.imageUrl), article?.coverError)}</button><button className="image-plan-action" onClick={() => onChooseMaterial({ type: "cover" })} disabled={generating || !article?.imageUrl}><ImageIcon size={14}/> 从素材库替换</button></div></div></article>{imagePlans.map((image, index) => <article className="image-plan-card" key={`${image.prompt}-${index}`}><div className="image-plan-preview">{image.url ? <img src={image.url} alt={`段落配图 ${index + 1}`}/> : <div className="image-plan-placeholder"><ImageIcon size={21}/><span>{image.error ? "生成失败" : "待生成"}</span></div>}</div><div className="image-plan-content"><div className="image-plan-title"><span>段落图 {index + 1}</span><i className={image.error ? "failed" : image.url ? "ready" : "pending"}>{image.error ? "生成失败" : image.url ? "已生成" : "待生成"}</i></div>{image.anchor && <small className="image-plan-anchor">对应段落：{image.anchor}</small>}<p className="image-plan-prompt">{image.prompt}</p>{image.error && <small className="image-plan-error">{image.error}</small>}<div className="image-plan-actions"><button className="image-plan-action" onClick={() => onGenerate({ type: "paragraph", index })} disabled={generating || !image.prompt}><RefreshCw size={14}/>{generating ? "生成中..." : actionLabel(Boolean(image.url), image.error)}</button><button className="image-plan-action" onClick={() => onChooseMaterial({ type: "paragraph", index })} disabled={generating || !image.url}><ImageIcon size={14}/> 从素材库替换</button></div></div></article>)}</div></section>;
}
