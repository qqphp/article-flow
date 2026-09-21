"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, ExternalLink, Flame, Image as ImageIcon, LayoutDashboard, Menu, MoreHorizontal, PenLine, Plus, ScrollText, Send, Settings2, Sparkles } from "lucide-react";
import { NotifyProvider } from "./notify";
import { NEW_ARTICLE_EVENT, studioNav } from "./studio-constants";

const navIcons = {
  "/": <LayoutDashboard size={18}/>,
  "/write": <PenLine size={18}/>,
  "/assets": <ImageIcon size={18}/>,
  "/publish": <Send size={18}/>,
  "/zhihu-data": <Flame size={18}/>,
  "/request-logs": <ScrollText size={18}/>,
  "/settings": <Settings2 size={18}/>,
} as const;

function currentNav(pathname: string) {
  return studioNav.find((item) => item.href !== "/" && (pathname === item.href || pathname.startsWith(`${item.href}/`))) || studioNav[0];
}

function StudioChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const active = currentNav(pathname);
  const [pendingCount, setPendingCount] = useState(0);
  const [navOpen, setNavOpen] = useState(false);

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

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <main className="shell">
      {navOpen ? <button className="sidebar-backdrop" aria-label="关闭导航" onClick={() => setNavOpen(false)} /> : null}
      <aside className={navOpen ? "sidebar open" : "sidebar"}>
        <div className="brand"><div className="brand-mark"><Sparkles size={17}/></div><span>墨稿</span><small>AI CONTENT STUDIO</small></div>
        <div className="workspace"><div className="avatar">A</div><div><b>开发阿雷</b><small>个人工作空间</small></div><ChevronRight size={15}/></div>
        <nav>
          {studioNav.map((item) => (
            <Link key={item.href} href={item.href} className={active.href === item.href ? "nav-item active" : "nav-item"} onClick={() => setNavOpen(false)}>
              {navIcons[item.href]}
              <span>{item.label}</span>
              {item.href === "/publish" && pendingCount > 0 ? <i>{pendingCount}</i> : null}
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          <a className="blog-link" href="https://qqphp.com" target="_blank" rel="noreferrer">
            <ExternalLink size={17}/>
            <span><b>阿雷博客</b><small>qqphp.com</small></span>
          </a>
          <div className="user-row"><div className="avatar soft">阿</div><div><b>开发阿雷</b><small>Pro 计划</small></div><MoreHorizontal size={17}/></div>
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div className="crumb">
            <button className="mobile-menu" type="button" aria-label={navOpen ? "关闭导航" : "打开导航"} aria-expanded={navOpen} onClick={() => setNavOpen((open) => !open)}><Menu size={20}/></button>
            <span>{active.crumb[0]}</span>
            <ChevronRight size={14}/>
            <b>{active.crumb[1]}</b>
          </div>
          <div className="top-actions">
            <Link className="new-btn" href="/write" onClick={(event) => {
              if (pathname !== "/write") return;
              event.preventDefault();
              const articleId = new URLSearchParams(window.location.search).get("articleId");
              if (articleId) router.push("/write");
              else window.dispatchEvent(new Event(NEW_ARTICLE_EVENT));
            }}><Plus size={17}/> 新建文章</Link>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}

export default function StudioShell({ children }: { children: React.ReactNode }) {
  return (
    <NotifyProvider>
      <StudioChrome>{children}</StudioChrome>
    </NotifyProvider>
  );
}
