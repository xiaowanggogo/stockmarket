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
