"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import EChart from "./EChart";
import type { QuoteRecord } from "../lib/types";
import { boll } from "../lib/indicators";

const UP = "#ef4444";
const DOWN = "#22c55e";
const C_PRESSURE = "#f59e0b"; // 压力线统一橙黄
const C_SUPPORT = "#06b6d4"; // 支撑线统一青蓝
const C_NEUTRAL = "#64748b"; // 中性（斐波那契50%）

// TD 神奇九转
function tdNine(closes: (number | null)[]) {
  const buy: (number | null)[] = new Array(closes.length).fill(null);
  const sell: (number | null)[] = new Array(closes.length).fill(null);
  let bc = 0;
  let sc = 0;
  for (let i = 4; i < closes.length; i++) {
    const c = closes[i];
    const ref = closes[i - 4];
    if (c == null || ref == null) continue;
    if (c > ref) {
      sc = sc >= 9 ? 9 : sc + 1;
      bc = 0;
      sell[i] = sc;
    } else if (c < ref) {
      bc = bc >= 9 ? 9 : bc + 1;
      sc = 0;
      buy[i] = bc;
    } else {
      bc = 0;
      sc = 0;
    }
  }
  return { buy, sell };
}

function dedupeNear(arr: number[], tol = 0.003): number[] {
  const out: number[] = [];
  for (const v of arr) {
    if (!out.some((x) => Math.abs(x - v) / v < tol)) out.push(v);
  }
  return out;
}

interface SRLine {
  value: number;
  shortLabel: string;
  fullLabel: string;
  color: string;
  lineType: "dashed" | "dotted" | "solid";
  position: string;
}

// 多流派支撑压力线（仅按可见区间 slice 计算）
function computeSR(slice: QuoteRecord[]): SRLine[] {
  const lines: SRLine[] = [];
  if (slice.length < 2) return lines;

  // ① 极值法：取最高3个为压力、最低3个为支撑
  const highs: number[] = [];
  const lows: number[] = [];
  for (const d of slice) {
    if (d.high != null) highs.push(d.high);
    if (d.low != null) lows.push(d.low);
  }
  highs.sort((a, b) => b - a);
  lows.sort((a, b) => a - b);
  const topH = dedupeNear(highs).slice(0, 3);
  const topL = dedupeNear(lows).slice(0, 3);
  const positions = ["insideEndTop", "insideStartTop", "insideEndTop"];
  topH.forEach((p, i) =>
    lines.push({
      value: +p.toFixed(3),
      shortLabel: `压${i + 1}`,
      fullLabel: `压力${i + 1}·极值法`,
      color: C_PRESSURE,
      lineType: "dashed",
      position: positions[i],
    })
  );
  topL.forEach((p, i) =>
    lines.push({
      value: +p.toFixed(3),
      shortLabel: `支${i + 1}`,
      fullLabel: `支撑${i + 1}·极值法`,
      color: C_SUPPORT,
      lineType: "dashed",
      position: i % 2 === 0 ? "insideEndBottom" : "insideStartBottom",
    })
  );

  // ② 斐波那契回撤：38.2%=压力, 50%=中性, 61.8%=支撑
  let mn = Infinity;
  let mx = -Infinity;
  for (const d of slice) {
    if (d.low != null) mn = Math.min(mn, d.low);
    if (d.high != null) mx = Math.max(mx, d.high);
  }
  if (mn !== Infinity && mx !== -Infinity && mx > mn) {
    const fibs: [string, number, "p" | "s" | "n"][] = [
      ["38.2%", 0.382, "p"],
      ["50%", 0.5, "n"],
      ["61.8%", 0.618, "s"],
    ];
    fibs.forEach(([lbl, f, kind]) => {
      const v = mx - (mx - mn) * f;
      const color = kind === "p" ? C_PRESSURE : kind === "s" ? C_SUPPORT : C_NEUTRAL;
      lines.push({
        value: +v.toFixed(3),
        shortLabel: "F" + lbl,
        fullLabel: `斐波那契${lbl}`,
        color,
        lineType: "dotted",
        position: kind === "s" ? "insideEndBottom" : "insideEndTop",
      });
    });
  }

  // ③ 大阳/大阴线实体中点：阳线=支撑，阴线=压力
  const yang = slice
    .filter((d) => d.close != null && d.open != null && d.close > d.open)
    .map((d) => ({ mid: (d.close! + d.open!) / 2, body: Math.abs(d.close! - d.open!) }))
    .sort((a, b) => b.body - a.body)
    .slice(0, 2);
  const yin = slice
    .filter((d) => d.close != null && d.open != null && d.close < d.open)
    .map((d) => ({ mid: (d.close! + d.open!) / 2, body: Math.abs(d.close! - d.open!) }))
    .sort((a, b) => b.body - a.body)
    .slice(0, 2);
  yang.forEach((p, i) =>
    lines.push({
      value: +p.mid.toFixed(3),
      shortLabel: `阳中${i + 1}`,
      fullLabel: `支撑·大阳线中点${i + 1}`,
      color: C_SUPPORT,
      lineType: "dashed",
      position: "insideStartBottom",
    })
  );
  yin.forEach((p, i) =>
    lines.push({
      value: +p.mid.toFixed(3),
      shortLabel: `阴中${i + 1}`,
      fullLabel: `压力·大阴线中点${i + 1}`,
      color: C_PRESSURE,
      lineType: "dashed",
      position: "insideStartTop",
    })
  );
  return lines;
}

// 按可见区间计算支撑压力 + 跳空缺口
function computeMarks(
  data: QuoteRecord[],
  visRange: { s: number; e: number },
  showSR: boolean,
  showGap: boolean
): { markLine: any; markArea: any; srLines: SRLine[] } {
  const N = data.length;
  const empty = { markLine: { data: [] }, markArea: { data: [] }, srLines: [] as SRLine[] };
  if (N === 0) return empty;
  const si = Math.max(0, Math.round((visRange.s / 100) * (N - 1)));
  const ei = Math.min(N - 1, Math.round((visRange.e / 100) * (N - 1)));

  let markLine: any = { data: [] };
  let srLines: SRLine[] = [];
  if (showSR) {
    const slice = data.slice(si, ei + 1);
    srLines = computeSR(slice);
    if (srLines.length) {
      markLine = {
        symbol: "none",
        data: srLines.map((l) => ({
          yAxis: l.value,
          lineStyle: { color: l.color, type: l.lineType, width: 1 },
          label: { formatter: l.shortLabel, color: l.color, position: l.position, fontSize: 10 },
        })),
      };
    }
  }

  // 跳空缺口
  let markArea: any = { data: [] };
  if (showGap && N >= 2) {
    const areas: any[] = [];
    for (let i = Math.max(si, 1); i <= ei; i++) {
      const prev = data[i - 1];
      const cur = data[i];
      if (!prev || !cur) continue;
      if (prev.high == null || cur.low == null || prev.low == null || cur.high == null) continue;
      if (cur.low > prev.high) {
        const top = cur.low;
        const bot = prev.high;
        let fillIdx = ei;
        for (let j = i + 1; j <= ei; j++) {
          if (data[j].low != null && data[j].low <= bot) { fillIdx = j; break; }
        }
        areas.push([
          { xAxis: data[i].date, yAxis: top, itemStyle: { color: "rgba(239,68,68,0.14)" } },
          { xAxis: data[fillIdx].date, yAxis: bot },
        ]);
      } else if (cur.high < prev.low) {
        const top = prev.low;
        const bot = cur.high;
        let fillIdx = ei;
        for (let j = i + 1; j <= ei; j++) {
          if (data[j].high != null && data[j].high >= top) { fillIdx = j; break; }
        }
        areas.push([
          { xAxis: data[i].date, yAxis: top, itemStyle: { color: "rgba(34,197,94,0.14)" } },
          { xAxis: data[fillIdx].date, yAxis: bot },
        ]);
      }
    }
    markArea = { silent: true, data: areas };
  }
  return { markLine, markArea, srLines };
}

export default function PriceChart({
  data,
  displayMode,
  yAxisType,
  yAxisRange,
  showBoll,
  showNine,
  showSR,
  showGap,
  visRange,
  onDataZoom,
}: {
  data: QuoteRecord[];
  displayMode: "kline" | "line";
  yAxisType: "normal" | "log";
  yAxisRange: "auto" | "zero";
  showBoll: boolean;
  showNine: boolean;
  showSR: boolean;
  showGap: boolean;
  visRange: { s: number; e: number };
  onDataZoom?: (start: number, end: number) => void;
}) {
  const chartRef = useRef<any>(null);
  const visRangeRef = useRef(visRange);
  visRangeRef.current = visRange;
  const progRef = useRef(false);
  const srRef = useRef<SRLine[]>([]); // 供 tooltip formatter 读取

  const option = useMemo(() => {
    const dates = data.map((d) => d.date);
    const closes = data.map((d) => d.close);
    const candle = data.map((d) => [d.open, d.close, d.low, d.high]);

    const series: any[] = [];
    if (displayMode === "kline") {
      series.push({
        type: "candlestick",
        name: "K线",
        data: candle,
        itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
      });
    } else {
      series.push({
        type: "line",
        name: "收盘",
        data: closes,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.6, color: "#2563eb" },
        areaStyle: { color: "rgba(37,99,235,0.08)" },
      });
    }

    if (showBoll) {
      const { mid, upper, lower } = boll(closes, 20, 2);
      series.push(line("BOLL中轨", mid, "#f59e0b"));
      series.push(line("BOLL上轨", upper, "#ef4444"));
      series.push(line("BOLL下轨", lower, "#22c55e"));
    }

    if (showNine) {
      const { buy, sell } = tdNine(closes);
      const sellPts = data.map((d, i) => (sell[i] != null ? { value: [i, (d.high ?? d.close)! * 1.01], num: sell[i] } : null)).filter(Boolean as any);
      const buyPts = data.map((d, i) => (buy[i] != null ? { value: [i, (d.low ?? d.close)! * 0.99], num: buy[i] } : null)).filter(Boolean as any);
      series.push(nineSeries(sellPts, "top", UP));
      series.push(nineSeries(buyPts, "bottom", DOWN));
    }

    const isLog = yAxisType === "log";
    return {
      animation: false,
      grid: { left: 64, right: 20, top: showNine ? 28 : 18, bottom: 56 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        formatter: (params: any) => {
          const p = params.find((x: any) => x.seriesName === "K线" || x.seriesName === "收盘");
          if (!p) return "";
          const d = data[p.dataIndex];
          if (!d) return "";
          let html = `<b>${d.date}</b>`;
          html += `<br/>开 ${d.open ?? "—"} 高 ${d.high ?? "—"} 低 ${d.low ?? "—"} 收 ${d.close ?? "—"}`;
          if (srRef.current.length && d.close != null) {
            const close = d.close;
            const nearby = srRef.current
              .map((l) => ({ ...l, dist: Math.abs(l.value - close) / close }))
              .filter((l) => l.dist < 0.05)
              .sort((a, b) => a.dist - b.dist)
              .slice(0, 5);
            if (nearby.length) {
              html += `<br/><span style="color:#94a3b8">— 附近支撑压力 —</span>`;
              nearby.forEach((l) => {
                html += `<br/><span style="color:${l.color}">${l.fullLabel} ¥${l.value.toFixed(2)} (${(l.dist * 100).toFixed(1)}%)</span>`;
              });
            }
          }
          return html;
        },
      },
      legend: showBoll ? { top: 0, right: 8, itemHeight: 8, itemWidth: 14, textStyle: { fontSize: 10 } } : undefined,
      xAxis: {
        type: "category",
        data: dates,
        boundaryGap: displayMode === "kline",
        axisLine: { lineStyle: { color: "#94a3b8" } },
        axisLabel: { color: "#475569" },
      },
      // Y轴 min/max 由 applyMarks merge 设置（跟随可见窗口）
      yAxis: {
        type: isLog ? "log" : "value",
        splitLine: { lineStyle: { color: "#eef2f7" } },
        axisLabel: { color: "#475569" },
      },
      dataZoom: [
        { type: "inside", filterMode: "none" },
        { type: "slider", height: 18, bottom: 18 },
      ],
      series,
    };
  }, [data, displayMode, yAxisType, showBoll, showNine]);

  // option 变化后：dispatch dataZoom 到 visRange（定位到可见窗口）
  useEffect(() => {
    if (chartRef.current && !chartRef.current.isDisposed?.()) {
      progRef.current = true;
      chartRef.current.dispatchAction({ type: "dataZoom", start: visRangeRef.current.s, end: visRangeRef.current.e });
      setTimeout(() => { progRef.current = false; }, 0);
    }
  }, [option]);

  // merge 更新：Y轴范围(跟随窗口) + 支撑压力 + 跳空缺口（不重置 dataZoom）
  const applyMarks = useCallback(() => {
    if (!chartRef.current || chartRef.current.isDisposed?.()) return;
    const { markLine, markArea, srLines } = computeMarks(data, visRange, showSR, showGap);
    srRef.current = srLines;
    // Y轴 min/max 跟随可见窗口
    const N = data.length;
    const si = Math.max(0, Math.round((visRange.s / 100) * (N - 1)));
    const ei = Math.min(N - 1, Math.round((visRange.e / 100) * (N - 1)));
    const slice = data.slice(si, ei + 1);
    let visMin = Infinity, visMax = -Infinity;
    for (const d of slice) {
      if (d.low != null) visMin = Math.min(visMin, d.low);
      if (d.high != null) visMax = Math.max(visMax, d.high);
    }
    const isLog = yAxisType === "log";
    let yMin: any = undefined, yMax: any = undefined;
    if (visMin !== Infinity && visMax !== -Infinity) {
      if (yAxisRange === "auto") {
        yMin = visMin; yMax = visMax;
      } else {
        // 从0：普通轴 min=0；对数轴用全量数据最低作为"底部"（log不能真0）
        if (isLog) {
          let allMin = Infinity;
          for (const d of data) { if (d.low != null) allMin = Math.min(allMin, d.low); }
          yMin = allMin !== Infinity ? allMin : undefined;
          yMax = visMax;
        } else {
          yMin = 0; yMax = visMax;
        }
      }
    }
    chartRef.current.setOption({
      yAxis: { min: yMin, max: yMax },
      series: [{ markLine, markArea }],
    }, false);
  }, [data, visRange, showSR, showGap, yAxisType, yAxisRange, displayMode, showBoll, showNine]);

  useEffect(() => { if (data.length > 0) applyMarks(); }, [applyMarks, data.length]);

  // data 变空时清除 chartRef（EChart 已卸载，避免 applyMarks 持有已销毁实例）
  useEffect(() => {
    if (data.length === 0) chartRef.current = null;
  }, [data.length]);

  if (data.length === 0) {
    return <div className="chart-empty">该区间无交易日数据（请调整起始/结束日期）</div>;
  }
  return (
    <EChart
      option={option}
      group="stock"
      className="chart-canvas"
      onDataZoom={(s, e) => {
        if (progRef.current) return;
        onDataZoom?.(s, e);
      }}
      onReady={(chart) => {
        chartRef.current = chart;
        chart.dispatchAction({ type: "dataZoom", start: visRangeRef.current.s, end: visRangeRef.current.e });
        applyMarks();
      }}
    />
  );
}

function line(name: string, data: (number | null)[], color: string): any {
  return { type: "line", name, data, showSymbol: false, lineStyle: { color, width: 1.2 } };
}

function nineSeries(points: any[], position: "top" | "bottom", color: string): any {
  return {
    type: "scatter",
    symbolSize: 1,
    data: points,
    tooltip: { show: false },
    itemStyle: { color },
    label: { show: true, position, color, fontSize: 10, formatter: (p: any) => p.data.num },
    z: 10,
  };
}
