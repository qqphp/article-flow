export type ArticleStyle = { id: string; title: string; summary: string; content?: string };
export const defaultStyleId = "viral_style.md";
export const defaultStyleTitle = "高流量 / 爆款";
export const defaultTopic = "AI 时代，普通人如何建立自己的内容工作流？";
export const NEW_ARTICLE_EVENT = "article-flow-new-article";
export const steps = ["构思", "写作", "去痕", "配图", "发布"];

export const studioNav = [
  { href: "/", label: "工作台", crumb: ["工作台", "概览"] },
  { href: "/write", label: "写文章", crumb: ["写文章", "新建文章"] },
  { href: "/assets", label: "素材库", crumb: ["素材库", "全部内容"] },
  { href: "/publish", label: "发布中心", crumb: ["发布中心", "文章队列"] },
  { href: "/zhihu-data", label: "知乎数据", crumb: ["知乎数据", "开放平台数据"] },
  { href: "/request-logs", label: "请求日志", crumb: ["请求日志", "API 调用记录"] },
  { href: "/settings", label: "配置中心", crumb: ["配置中心", "AI 与平台配置"] },
] as const;
