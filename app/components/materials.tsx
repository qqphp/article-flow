"use client";

import { useEffect, useState } from "react";
import { Download, Trash2, X } from "lucide-react";

export type MaterialType = "cover" | "paragraph" | "ai";
export type Material = { id: string; originalFilename: string; storageFilename: string; type: MaterialType; sizeBytes: number; format: string; createdAt: string; url: string };
export const materialTypeLabel: Record<MaterialType, string> = { cover: "封面图", paragraph: "段落配图", ai: "文章AI配图" };
export function formatMaterialSize(sizeBytes: number) {
  return sizeBytes >= 1024 * 1024 ? `${(sizeBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

export function MaterialPreviewModal({ asset, onClose }: { asset: Material; onClose: () => void }) {
  return <div className="request-modal-backdrop material-modal-backdrop" role="dialog" aria-modal="true" onMouseDown={onClose}><div className="request-modal material-preview-modal" onMouseDown={(event) => event.stopPropagation()}><div className="request-modal-head"><div><p className="eyebrow">素材预览</p><h2>{asset.originalFilename}</h2></div><button className="modal-close" onClick={onClose} aria-label="关闭"><X size={17}/></button></div><div className="material-preview-image"><img src={asset.url} alt={asset.originalFilename}/></div><div className="request-modal-meta"><span>{materialTypeLabel[asset.type]}</span><span>{formatMaterialSize(asset.sizeBytes)}</span><span>{asset.format.toUpperCase()}</span><span>{new Date(asset.createdAt).toLocaleString("zh-CN", { hour12: false })}</span></div><div className="material-preview-footer"><a className="asset-use" href={`${asset.url}?download=1`}><Download size={14}/> 下载原图</a></div></div></div>;
}

export function DeleteMaterialModal({ asset, deleting, onClose, onConfirm }: { asset: Material; deleting: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="request-modal-backdrop material-modal-backdrop" role="dialog" aria-modal="true" onMouseDown={() => !deleting && onClose()}><div className="request-modal material-delete-modal" onMouseDown={(event) => event.stopPropagation()}><div className="request-modal-head"><div><p className="eyebrow">删除素材</p><h2>确认删除“{asset.originalFilename}”吗？</h2></div><button className="modal-close" onClick={onClose} disabled={deleting} aria-label="关闭"><X size={17}/></button></div><p className="material-delete-copy">将同时删除素材库文件和索引记录；已复制到文章目录的图片不会受影响。</p><div className="material-delete-actions"><button className="ghost-btn" onClick={onClose} disabled={deleting}>取消</button><button className="material-delete-confirm" onClick={onConfirm} disabled={deleting}><Trash2 size={15}/>{deleting ? "删除中..." : "确认删除"}</button></div></div></div>;
}

export function MaterialPickerModal({ type, onClose, onSelect }: { type: "cover" | "paragraph"; onClose: () => void; onSelect: (materialId: string) => void }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/materials?type=${type}&page=${page}&pageSize=12`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "素材加载失败");
      if (cancelled) return;
      setMaterials(Array.isArray(data.materials) ? data.materials : []);
      setTotalPages(Number(data.totalPages || 1));
      if (Number(data.page) && Number(data.page) !== page) setPage(Number(data.page));
    }).catch(() => { if (!cancelled) setMaterials([]); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type, page]);
  return <div className="request-modal-backdrop material-modal-backdrop" role="dialog" aria-modal="true" onMouseDown={onClose}><div className="request-modal material-picker-modal" onMouseDown={(event) => event.stopPropagation()}><div className="request-modal-head"><div><p className="eyebrow">选择素材</p><h2>选择{materialTypeLabel[type]}</h2></div><button className="modal-close" onClick={onClose} aria-label="关闭"><X size={17}/></button></div>{loading ? <div className="empty-state">正在读取素材...</div> : materials.length ? <><div className="material-picker-grid">{materials.map((material) => <button key={material.id} className="material-picker-card" onClick={() => onSelect(material.id)}><img src={material.url} alt={material.originalFilename}/><b>{material.originalFilename}</b><small>{formatMaterialSize(material.sizeBytes)} · {material.format.toUpperCase()}</small></button>)}</div>{totalPages > 1 && <div className="pagination material-picker-pagination"><span>第 {page} / {totalPages} 页</span><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button></div>}</> : <div className="empty-state">暂无可用于替换的{materialTypeLabel[type]}素材</div>}</div></div>;
}
