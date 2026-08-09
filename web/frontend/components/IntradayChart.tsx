"use client";
import { useMemo } from "react";
import EChart from "./EChart";
import type { MinuteRecord } from "../lib/types";

const UP = "#ef4444";
const DOWN = "#22c55e";

// 分时K线图：显示当天分时数据（1分钟K线/折线），无 dataZoom，简洁紧凑。
export default function IntradayChart({ data }: { data: MinuteRecord[] }) {
  const option = useMemo(() => {
    const times = data.map((d) => d.date.slice(11, 16)); // HH:MM
    const closes = data.map((d) => d.close);
    const candle = data.map((d) => [d.open, d.close, d.low, d.high]);

    return {
      animation: false,
      grid: { left: 50, right: 10, top: 20, bottom: 24 },
      tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
      xAxis: {
        type: "category",
        data: times,
        boundaryGap: true,
        axisLine: { lineStyle: { color: "#94a3b8" } },
        axisLabel: { color: "#64748b", fontSize: 10, interval: 29 },
      },
      yAxis: {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: "#eef2f7" } },
        axisLabel: { color: "#64748b", fontSize: 10 },
      },
      series: [
        {
          type: "candlestick",
          name: "分时",
          data: candle,
          itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
        },
      ],
    };
  }, [data]);

  if (data.length === 0) {
    return <div className="chart-empty">无分时数据</div>;
  }
  return <EChart option={option} className="chart-canvas" />;
}
