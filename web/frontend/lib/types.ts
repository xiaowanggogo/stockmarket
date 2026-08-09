export interface QuoteRecord {
  date: string;
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  turnover: number | null;
}

export interface QuoteResponse {
  code: string;
  name: string;
  adjust: string;
  start: string;
  end: string;
  count: number;
  data: QuoteRecord[];
}

export interface StockItem {
  code: string;
  name: string;
  pinyin?: string;
  initials?: string; // 拼音首字母缩写
  market?: string;
}

export interface SearchResponse {
  query: string;
  total: number;
  results: StockItem[];
}

export interface MinuteRecord {
  date: string;
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
}

export interface MinuteResponse {
  code: string;
  period: string;
  adjust: string;
  count: number;
  data: MinuteRecord[];
}

export interface StockInfo {
  name: string;
  code: string;
  market_cap: number | null;
  circ_market_cap: number | null;
  pe_dynamic: number | null;
  pe_ttm: number | null;
  pe_static: number | null;
  dividend_yield_dynamic: number | null;
  dividend_yield_ttm: number | null;
  dividend_yield_static: number | null;
  relative_valuation: number | null;
  concept_boards: string;
  industry_board: string;
}
