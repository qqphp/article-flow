import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "墨稿 · AI 文章工作台", description: "公众号与内容矩阵创作工作台" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
