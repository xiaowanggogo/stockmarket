import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "股价查看器 · market_data",
  description: "基于 market_data 的 A 股行情查看器（FastAPI + Next.js）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
