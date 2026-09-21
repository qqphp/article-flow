"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Plus, Search, Trash2 } from "lucide-react";
import { useNotify } from "./notify";
import { DeleteMaterialModal, MaterialPreviewModal, formatMaterialSize, materialTypeLabel, type Material, type MaterialType } from "./materials";
import { MAX_MATERIAL_FILE_BYTES, MAX_MATERIAL_FILES_PER_UPLOAD, MATERIAL_PAGE_SIZE, materialFileLimitLabel } from "../lib/material-limits";

const emptyCounts = { all: 0, cover: 0, paragraph: 0, ai: 0 };

export default function AssetsPage() {
  const notify = useNotify();
  const [assets, setAssets] = useState<Material[]>([]);
  const [counts, setCounts] = useState(emptyCounts);
  const [tab, setTab] = useState<"全部" | MaterialType>("全部");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [uploadType, setUploadType] = useState<"cover" | "paragraph">("cover");
  const [selectedAsset, setSelectedAsset] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Material | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadId = useRef(0);
  const loadAssets = useCallback(async (targetPage = page, signal?: AbortSignal) => {
    const requestId = ++loadId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(MATERIAL_PAGE_SIZE) });
      if (tab !== "全部") params.set("type", tab);
      if (query.trim()) params.set("query", query.trim());
      const response = await fetch(`/api/materials?${params}`, { signal });
      const data = await response.json();
      if (requestId !== loadId.current) return;
      if (!response.ok) throw new Error(data.error || "素材库加载失败");
      setAssets(Array.isArray(data.materials) ? data.materials : []);
      setCounts({ ...emptyCounts, ...(data.counts || {}) });
      setTotalPages(Number(data.totalPages || 1));
      if (Number(data.page) && Number(data.page) !== targetPage) setPage(Number(data.page));
    } catch (error: any) {
      if (error?.name === "AbortError" || requestId !== loadId.current) return;
      notify(error.message || "素材库加载失败");
    } finally {
      if (requestId === loadId.current) setLoading(false);
    }
  }, [notify, page, query, tab]);
  useEffect(() => {
    const abort = new AbortController();
    const timer = window.setTimeout(() => { void loadAssets(page, abort.signal); }, query ? 250 : 0);
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [loadAssets, page, query]);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (selected.length > MAX_MATERIAL_FILES_PER_UPLOAD) {
      notify(`一次最多上传 ${MAX_MATERIAL_FILES_PER_UPLOAD} 张图片`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const oversized = selected.filter((file) => file.size > MAX_MATERIAL_FILE_BYTES);
    if (oversized.length) {
      notify(`有 ${oversized.length} 张图片超过 ${materialFileLimitLabel()} 限制`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("type", uploadType);
      selected.forEach((file) => form.append("files", file));
      const response = await fetch("/api/materials", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "上传素材失败");
      setPage(1);
      await loadAssets(1);
      notify(`已添加 ${Array.isArray(data.materials) ? data.materials.length : 0} 个素材`);
    } catch (error: any) { notify(error.message || "上传素材失败"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const deleteAsset = async () => {
    if (!pendingDelete || deletingId) return;
    setDeletingId(pendingDelete.id);
    try {
      const response = await fetch(`/api/materials/${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除素材失败");
      setSelectedAsset((current) => current?.id === pendingDelete.id ? null : current);
      notify("素材已删除");
      setPendingDelete(null);
      await loadAssets(page);
    } catch (error: any) { notify(error.message || "删除素材失败"); }
    finally { setDeletingId(null); }
  };
  const tabs: Array<"全部" | MaterialType> = ["全部", "cover", "paragraph", "ai"];
  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow">内容资产</p><h1>素材库</h1><p className="hero-sub">集中管理手动上传的封面、段落素材和文章生成的 AI 配图。</p></div><div className="material-upload-block"><div className="material-upload-actions"><select value={uploadType} onChange={(event) => setUploadType(event.target.value as "cover" | "paragraph")} aria-label="上传素材类型"><option value="cover">封面图</option><option value="paragraph">段落配图</option></select><input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => void onFiles(event.target.files)}/><button className="primary-btn" disabled={uploading} onClick={() => inputRef.current?.click()}><Plus size={17}/> {uploading ? "上传中..." : "上传素材"}</button></div><p className="material-upload-hint">单张不超过 {materialFileLimitLabel()} · PNG / JPG / WebP · 每次最多 {MAX_MATERIAL_FILES_PER_UPLOAD} 张</p></div></div>
    <div className="asset-toolbar"><div className="asset-tabs">{tabs.map((type) => <button key={type} className={tab === type ? "active" : ""} onClick={() => { setTab(type); setPage(1); }}>{type === "全部" ? type : materialTypeLabel[type]} <b>{type === "全部" ? counts.all : counts[type]}</b></button>)}</div><label className="filter-btn"><Search size={15}/><input aria-label="搜索素材" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索素材"/></label></div>
    {loading ? <div className="empty-state">正在读取素材库...</div> : assets.length ? <div className="asset-grid">{assets.map((asset) => <div className="asset-card" key={asset.id}><button className="asset-thumb material-thumb" onClick={() => setSelectedAsset(asset)}><img src={asset.url} alt={asset.originalFilename}/></button><div className="asset-info"><b title={asset.originalFilename}>{asset.originalFilename}</b><small>{materialTypeLabel[asset.type]} · {formatMaterialSize(asset.sizeBytes)} · {asset.format.toUpperCase()}</small></div><div className="asset-card-actions"><button className="asset-use" onClick={() => setSelectedAsset(asset)}><Eye size={14}/> 查看</button><button className="asset-use asset-delete" onClick={() => setPendingDelete(asset)}><Trash2 size={14}/> 删除</button></div></div>)}</div> : <div className="empty-state">没有找到匹配的素材</div>}
    {!loading && assets.length > 0 && <div className="pagination"><span>第 {page} / {totalPages} 页</span><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button></div>}
    {selectedAsset && <MaterialPreviewModal asset={selectedAsset} onClose={() => setSelectedAsset(null)}/>}
    {pendingDelete && <DeleteMaterialModal asset={pendingDelete} deleting={deletingId === pendingDelete.id} onClose={() => !deletingId && setPendingDelete(null)} onConfirm={() => void deleteAsset()}/>}
  </div>;
}
