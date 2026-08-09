import type { QuoteResponse, SearchResponse, MinuteResponse, StockInfo } from "./types";

// 同源访问：浏览器请求 /api/*，由 Next rewrites 反向代理到 FastAPI 后端。
const BASE = "";

export async function searchStocks(q: string, limit = 30): Promise<SearchResponse> {
  const res = await fetch(`${BASE}/api/stock/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) throw new Error(`搜索失败: ${res.status}`);
  return res.json();
}

export async function getHistory(
  code: string,
  start: string,
  end: string,
  adjust = "qfq"
): Promise<QuoteResponse> {
  const params = new URLSearchParams({ code, start, end, adjust });
  const res = await fetch(`${BASE}/api/quote/history?${params.toString()}`);
  if (!res.ok) throw new Error(`行情查询失败: ${res.status}`);
  return res.json();
}

export async function getMinuteData(
  code: string,
  period = "1",
  adjust = "qfq"
): Promise<MinuteResponse> {
  const params = new URLSearchParams({ code, period, adjust });
  const res = await fetch(`${BASE}/api/quote/status?${params.toString()}`);
  if (!res.ok) throw new Error(`分时数据获取失败: ${res.status}`);
  return res.json();
}

export async function getStockInfo(code: string): Promise<StockInfo> {
  const res = await fetch(`${BASE}/api/stock/info?code=${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(`公司信息获取失败: ${res.status}`);
  return res.json();
}
