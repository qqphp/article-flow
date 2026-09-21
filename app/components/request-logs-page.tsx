"use client";

import { useEffect, useState } from "react";
import { Eye, Trash2, X } from "lucide-react";
import { REQUEST_LOG_PAGE_SIZE } from "../lib/pagination";

export default function RequestLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), pageSize: String(REQUEST_LOG_PAGE_SIZE) });
      if (type !== "all") params.set("type", type);
      if (query.trim()) params.set("query", query.trim());
      fetch(`/api/request-logs?${params}`, { signal: abort.signal })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "读取请求日志失败");
          setLogs(Array.isArray(data.logs) ? data.logs : []);
          setTotal(Number(data.total || 0));
          setTotalPages(Number(data.totalPages || 1));
          if (Number(data.page) && Number(data.page) !== page) setPage(Number(data.page));
        })
        .catch((error) => {
          if (error?.name === "AbortError") return;
          setLogs([]);
          setTotal(0);
          setTotalPages(1);
        })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, query ? 250 : 0);
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [page, type, query]);
  const clearLogs = async () => {
    if (!total || clearing || !window.confirm("确定清空全部请求日志吗？此操作无法撤销。")) return;
    setClearing(true);
    setMessage("");
    try {
      const response = await fetch("/api/request-logs", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "清空请求日志失败");
      setLogs([]); setSelectedLog(null); setPage(1); setTotal(0); setTotalPages(1); setMessage(`已清空 ${data.deleted || 0} 条请求日志`);
    } catch (error: any) { setMessage(error.message || "清空请求日志失败，请稍后重试"); } finally { setClearing(false); }
  };
  return <div className="page request-logs-page"><div className="page-heading"><div><p className="eyebrow">系统记录</p><h1>请求日志</h1><p className="hero-sub">记录文本和图片模型的请求参数，不保存响应结果。</p></div><button className="clear-logs-btn" onClick={clearLogs} disabled={!total || clearing}><Trash2 size={16}/>{clearing ? "正在清空..." : "清空日志"}</button></div>{message && <p className="request-log-message">{message}</p>}<div className="panel request-logs-panel"><div className="request-log-filters"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索操作、模型或接口"/><select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="all">全部类型</option><option value="text">文本请求</option><option value="image">图片请求</option></select><span>共 {total} 条</span></div><div className="table-wrap"><table className="request-log-table"><thead><tr><th>时间</th><th>类型</th><th>调用操作</th><th>模型</th><th>接口</th><th>请求内容</th><th>操作</th></tr></thead><tbody>{logs.length ? logs.map((log) => <tr key={log.id}><td>{new Date(log.timestamp).toLocaleString("zh-CN", { hour12: false })}</td><td><span className={`log-type ${log.type}`}>{log.type === "image" ? "图片" : "文本"}</span></td><td>{log.operation}</td><td>{log.model}</td><td title={log.endpoint}>{log.endpoint}</td><td><code>JSON · {Object.keys(log.requestBody || {}).length} 个字段</code></td><td><button className="view-request-btn" onClick={() => setSelectedLog(log)}><Eye size={14}/> 查看</button></td></tr>) : <tr><td colSpan={7} className="empty-state">{loading ? "正在读取请求日志..." : "暂无请求记录"}</td></tr>}</tbody></table></div><div className="pagination"><span>第 {page} / {totalPages} 页</span><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>上一页</button><button disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>下一页</button></div></div>{selectedLog && <div className="request-modal-backdrop" role="presentation" onMouseDown={() => setSelectedLog(null)}><section className="request-modal" role="dialog" aria-modal="true" aria-label="请求内容" onMouseDown={(event) => event.stopPropagation()}><div className="request-modal-head"><div><p className="eyebrow">REQUEST BODY</p><h2>{selectedLog.operation}</h2></div><button className="modal-close" onClick={() => setSelectedLog(null)} aria-label="关闭"><X size={18}/></button></div><div className="request-modal-meta"><span>{selectedLog.model}</span><span title={selectedLog.endpoint}>{selectedLog.endpoint}</span></div><pre>{JSON.stringify(selectedLog.requestBody, null, 2)}</pre></section></div>}</div>;
}
