"use client";
import type { StockInfo } from "../lib/types";

function fmtCap(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1e12) return (v / 1e12).toFixed(2) + " 万亿";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + " 亿";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + " 万";
  return v.toFixed(2);
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2) + "%";
}

function fmtVal(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

// 公司信息面板：展示 stock_info 查询到的市值/市盈率/股息率/行业等。
export default function InfoPanel({ info }: { info: StockInfo | null }) {
  if (!info) {
    return <div className="info-panel-empty">加载中…</div>;
  }

  const rows: { label: string; value: string; color?: string }[] = [
    { label: "股票名称", value: info.name || "—" },
    { label: "股票代码", value: info.code },
    { label: "总市值", value: fmtCap(info.market_cap) },
    { label: "流通市值", value: fmtCap(info.circ_market_cap) },
    { label: "PE(动态)", value: fmtVal(info.pe_dynamic) },
    { label: "PE(TTM)", value: fmtVal(info.pe_ttm) },
    { label: "PE(静态)", value: fmtVal(info.pe_static) },
    { label: "股息率(动态)", value: fmtPct(info.dividend_yield_dynamic) },
    { label: "股息率(TTM)", value: fmtPct(info.dividend_yield_ttm) },
    { label: "股息率(静态)", value: fmtPct(info.dividend_yield_static) },
    {
      label: "相对估值",
      value: info.relative_valuation != null ? `${info.relative_valuation}% 分位` : "—",
      color: info.relative_valuation != null
        ? info.relative_valuation < 30 ? "#16a34a" : info.relative_valuation > 70 ? "#dc2626" : "#f59e0b"
        : undefined,
    },
    { label: "行业板块", value: info.industry_board || "—" },
    { label: "概念板块", value: info.concept_boards || "—" },
  ];

  return (
    <div className="info-panel">
      {rows.map((r, i) => (
        <div className="info-row" key={i}>
          <span className="info-label">{r.label}</span>
          <span className="info-value" style={r.color ? { color: r.color, fontWeight: 600 } : undefined}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}
