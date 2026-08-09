"use client";
import { useMemo } from "react";
import EChart from "./EChart";
import type { QuoteRecord } from "../lib/types";
import { ma, macd, rsi, kdj } from "../lib/indicators";

export type SubIndicator =
  | "none"
  | "volume"
  | "amount"
  | "turnover"
  | "ma5"
  | "ma10"
  | "ma20"
  | "macd"
  | "rsi"
  | "kdj";

// 子图可选指标下拉的标签（新增指标在 SUB_BUILDERS 注册一项 + 此处加一行即可，纯前端扩展）。
export const SUB_LABELS: { value: SubIndicator; label: string }[] = [
  { value: "none", label: "（不显示）" },
  { value: "volume", label: "成交量" },
  { value: "amount", label: "成交额" },
  { value: "turnover", label: "换手率" },
  { value: "ma5", label: "MA5" },
  { value: "ma10", label: "MA10" },
  { value: "ma20", label: "MA20" },
  { value: "macd", label: "MACD" },
  { value: "rsi", label: "RSI(14)" },
  { value: "kdj", label: "KDJ(9,3,3)" },
];

const UP = "#ef4444"; // 涨：红
const DOWN = "#22c55e"; // 跌：绿

// 每个 builder 返回该子图的 series 数组（支持多序列，便于 RSI/KDJ/MACD 等）。
const SUB_BUILDERS: Record<SubIndicator, (data: QuoteRecord[]) => any[]> = {
  none: () => [],
  volume: (data) =>
    [
      {
        type: "bar",
        name: "成交量",
        data: data.map((d) => {
          const up = d.close != null && d.open != null && d.close >= d.open;
          return { value: d.volume, itemStyle: { color: up ? UP : DOWN } };
        }),
      },
    ],
  amount: (data) => [
    {
      type: "bar",
      name: "成交额",
      data: data.map((d) => {
        const up = d.close != null && d.open != null && d.close >= d.open;
        return { value: d.amount, itemStyle: { color: up ? UP : DOWN } };
      }),
    },
  ],
  turnover: (data) => [
    {
      type: "line",
      name: "换手率",
      data: data.map((d) => d.turnover),
      showSymbol: false,
      lineStyle: { color: "#f59e0b", width: 1.3 },
    },
  ],
  ma5: (data) => [
    line("MA5", ma(data.map((d) => d.close), 5), "#ef4444"),
  ],
  ma10: (data) => [
    line("MA10", ma(data.map((d) => d.close), 10), "#3b82f6"),
  ],
  ma20: (data) => [
    line("MA20", ma(data.map((d) => d.close), 20), "#22c55e"),
  ],
  macd: (data) => {
    const { dif, dea, hist } = macd(data.map((d) => d.close));
    return [
      {
        type: "bar",
        name: "MACD",
        data: hist.map((v, i) => ({
          value: v,
          itemStyle: { color: v >= 0 ? UP : DOWN },
        })),
      },
      line("DIF", dif, "#2563eb"),
      line("DEA", dea, "#f59e0b"),
    ];
  },
  rsi: (data) => [
    {
      type: "line",
      name: "RSI(14)",
      data: rsi(data.map((d) => d.close), 14),
      showSymbol: false,
      lineStyle: { color: "#8b5cf6", width: 1.3 },
      markLine: {
        symbol: "none",
        data: [
          { yAxis: 70, lineStyle: { color: "#ef4444", type: "dashed" }, label: { formatter: "超买70" } },
          { yAxis: 30, lineStyle: { color: "#22c55e", type: "dashed" }, label: { formatter: "超卖30" } },
        ],
      },
    },
  ],
  kdj: (data) => {
    const { K, D, J } = kdj(
      data.map((d) => d.high),
      data.map((d) => d.low),
      data.map((d) => d.close)
    );
    return [
      line("K", K, "#2563eb"),
      line("D", D, "#f59e0b"),
      line("J", J, "#8b5cf6"),
      {
        type: "line",
        name: "KDJ参考",
        data: [],
        markLine: {
          symbol: "none",
          data: [
            { yAxis: 80, lineStyle: { color: "#ef4444", type: "dashed" }, label: { formatter: "超买80" } },
            { yAxis: 20, lineStyle: { color: "#22c55e", type: "dashed" }, label: { formatter: "超卖20" } },
          ],
        },
      },
    ];
  },
};

function line(name: string, data: (number | null)[], color: string): any {
  return {
    type: "line",
    name,
    data,
    showSymbol: false,
    lineStyle: { color, width: 1.2 },
  };
}

// 大图下方子图：每个可独立选择指标；与主图通过 group="stock" 联动缩放/拖动。
export default function SubChart({
  data,
  indicator,
}: {
  data: QuoteRecord[];
  indicator: SubIndicator;
}) {
  const option = useMemo(() => {
    const dates = data.map((d) => d.date);
    const series = indicator === "none" ? [] : SUB_BUILDERS[indicator](data);
    return {
      animation: false,
      grid: { left: 64, right: 20, top: 10, bottom: 22 },
      tooltip: { trigger: "axis" },
      legend: indicator === "none" ? undefined : { top: 0, right: 8, itemHeight: 8, itemWidth: 14, textStyle: { fontSize: 10 } },
      xAxis: {
        type: "category",
        data: dates,
        boundaryGap: indicator === "volume" || indicator === "amount",
        axisLabel: { show: false },
        axisLine: { lineStyle: { color: "#cbd5e1" } },
      },
      yAxis: {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: "#eef2f7" } },
        axisLabel: { color: "#64748b", fontSize: 10 },
      },
      dataZoom: [{ type: "inside", filterMode: "none" }],
      series,
    };
  }, [data, indicator]);

  if (data.length === 0) {
    return <div className="chart-empty">该区间无交易日数据</div>;
  }
  return <EChart option={option} group="stock" className="chart-canvas" />;
}
