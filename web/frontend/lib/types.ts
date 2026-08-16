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
  current_price: number | null;
  market_cap: number | null;
  circ_market_cap: number | null;
  pe_dynamic: number | null;
  pe_ttm: number | null;
  pb: number | null;
  dividend_yield_ttm: number | null;
  relative_valuation: number | null;
  industry_board: string;
  concept_boards: string;
  boards: string;
  target_price: number | null;
  latest_rating: string | null;
  rating_date: string | null;
  hk_code: string | null;
  hk_name: string | null;
  hk_price: number | null;
  data_sources: string;
}
