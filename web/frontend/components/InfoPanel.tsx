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

// 公司信息面板：展示 stock_info 查询到的市值/市盈率/股息率/板块/评级等。
export default function InfoPanel({ info }: { info: StockInfo | null }) {
  if (!info) {
    return <div className="info-panel-empty">加载中…</div>;
  }

  const ratingColor =
    info.latest_rating == null ? undefined
      : ["买入", "增持", "推荐", "强烈推荐"].some((k) => info.latest_rating!.includes(k))
        ? "#16a34a"
        : ["卖出", "减持", "回避"].some((k) => info.latest_rating!.includes(k))
          ? "#dc2626"
          : "#f59e0b";

  const rows: { label: string; value: string; color?: string; wrap?: boolean }[] = [
    { label: "股票名称", value: info.name || "—" },
    { label: "股票代码", value: info.code },
    { label: "现价", value: fmtVal(info.current_price) },
    { label: "总市值", value: fmtCap(info.market_cap) },
    { label: "流通市值", value: fmtCap(info.circ_market_cap) },
    { label: "PE(动态)", value: fmtVal(info.pe_dynamic) },
    { label: "PE(TTM)", value: fmtVal(info.pe_ttm) },
    { label: "PB", value: fmtVal(info.pb) },
    { label: "股息率", value: fmtPct(info.dividend_yield_ttm) },
    {
      label: "相对估值",
      value: info.relative_valuation != null ? `${info.relative_valuation}% 分位` : "—",
      color: info.relative_valuation != null
        ? info.relative_valuation < 30 ? "#16a34a" : info.relative_valuation > 70 ? "#dc2626" : "#f59e0b"
        : undefined,
    },
    { label: "行业", value: info.industry_board || "—" },
    { label: "所属板块", value: info.boards || info.concept_boards || "—", wrap: true },
    { label: "目标价", value: fmtVal(info.target_price) },
    {
      label: "最新评级",
      value: info.latest_rating != null ? `${info.latest_rating}${info.rating_date ? `（${info.rating_date}）` : ""}` : "—",
      color: ratingColor,
    },
    {
      label: "港股参考",
      value:
        info.hk_code != null
          ? `${info.hk_name || ""} ${info.hk_code} ${info.hk_price != null ? info.hk_price.toFixed(2) : ""}`.trim()
          : "—",
    },
  ];

  return (
    <div className="info-panel">
      {rows.map((r, i) => (
        <div className={`info-row${r.wrap ? " info-row-wrap" : ""}`} key={i}>
          <span className="info-label">{r.label}</span>
          <span className="info-value" style={r.color ? { color: r.color, fontWeight: 600 } : undefined}>
            {r.value}
          </span>
        </div>
      ))}
      {info.data_sources ? (
        <div className="info-sources">数据来源：{info.data_sources}</div>
      ) : null}
    </div>
  );
}
