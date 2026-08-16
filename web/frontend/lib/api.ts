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

// 自选股 / 分组：数据持久化于后端 web/backend/data/watchlist.json（统一本地存储）
import type { WatchGroup } from "./watchlist";

export async function getWatchlist(): Promise<WatchGroup[]> {
  const res = await fetch(`${BASE}/api/watchlist`);
  if (!res.ok) throw new Error(`获取自选股失败: ${res.status}`);
  return res.json();
}

export async function createGroup(name: string): Promise<{ group: WatchGroup; groups: WatchGroup[] }> {
  const res = await fetch(`${BASE}/api/watchlist/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`新建分组失败: ${res.status}`);
  return res.json();
}

export async function deleteGroup(id: string): Promise<WatchGroup[]> {
  const res = await fetch(`${BASE}/api/watchlist/groups/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`删除分组失败: ${res.status}`);
  return res.json();
}

export async function renameGroup(id: string, name: string): Promise<WatchGroup[]> {
  const res = await fetch(`${BASE}/api/watchlist/groups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`重命名分组失败: ${res.status}`);
  return res.json();
}

export async function addStock(groupId: string, code: string, name: string): Promise<WatchGroup[]> {
  const res = await fetch(`${BASE}/api/watchlist/groups/${encodeURIComponent(groupId)}/stocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  if (!res.ok) throw new Error(`添加自选失败: ${res.status}`);
  return res.json();
}

export async function removeStock(groupId: string, code: string): Promise<WatchGroup[]> {
  const res = await fetch(
    `${BASE}/api/watchlist/groups/${encodeURIComponent(groupId)}/stocks/${encodeURIComponent(code)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(`移除自选失败: ${res.status}`);
  return res.json();
}

export async function toggleStock(groupId: string, code: string, name: string): Promise<WatchGroup[]> {
  const res = await fetch(`${BASE}/api/watchlist/groups/${encodeURIComponent(groupId)}/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  if (!res.ok) throw new Error(`切换自选失败: ${res.status}`);
  return res.json();
}

export async function importWatchlist(groups: WatchGroup[]): Promise<WatchGroup[]> {
  const res = await fetch(`${BASE}/api/watchlist/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groups }),
  });
  if (!res.ok) throw new Error(`导入自选股失败: ${res.status}`);
  return res.json();
}
