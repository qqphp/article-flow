"use client";

import { useEffect, useState } from "react";
import { BookOpen, Bot, Check, ChevronRight, FileText, Flame, KeyRound, Link2, RefreshCw, Rocket, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { defaultStyleId, type ArticleStyle } from "./studio-constants";
import { useNotify } from "./notify";

export default function SettingsPage() {
  const notify = useNotify();
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
  const [selected, setSelected] = useState<ArticleStyle | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
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
  useEffect(() => {
    if (!selectedId) { setSelected(null); return; }
    let cancelled = false;
    setPreviewLoading(true);
    fetch(`/api/article-styles?id=${encodeURIComponent(selectedId)}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.style) throw new Error(data.error || "读取文章风格失败");
      if (!cancelled) setSelected(data.style as ArticleStyle);
    }).catch(() => {
      if (!cancelled) setSelected(null);
    }).finally(() => {
      if (!cancelled) setPreviewLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedId]);
  const preview = selected?.id === selectedId ? selected : styles.find((item) => item.id === selectedId);
  return <div className="style-settings">
    <div className="style-settings-list panel"><div className="panel-title"><div><h2>文章风格 <span className="style-count">{styles.length} 个</span></h2><p>读取项目 article_style 目录中的 Markdown 指南。</p></div></div>{loading ? <div className="empty-state">正在读取文章风格...</div> : error ? <div className="empty-state">{error}</div> : styles.map((item) => <button key={item.id} className={selectedId === item.id ? "article-style-item selected" : "article-style-item"} onClick={() => setSelectedId(item.id)}><b>{item.title}</b><small>{item.summary || item.id}</small></button>)}</div>
    <div className="panel style-markdown-panel">{preview ? <><div className="panel-title"><div><h2>{preview.title}</h2><p>{preview.id} · 只读预览</p></div></div>{previewLoading && !preview.content ? <div className="empty-state">正在读取风格指南...</div> : <div className="style-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.content || "暂无内容"}</ReactMarkdown></div>}</> : <div className="empty-state">选择一个文章风格查看完整 Markdown 指南。</div>}</div>
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
