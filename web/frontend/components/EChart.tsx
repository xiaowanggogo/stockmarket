"use client";
import { useEffect, useRef } from "react";

// 通用 ECharts 容器：动态 import echarts 避免 SSR 触碰 window；
// group 用于多图联动（echarts.connect），实现主图与子图共享 dataZoom 缩放/拖动。
// 关键健壮性：用 ResizeObserver 监听容器尺寸，flex 布局下初始化时高度可能为 0，
// 尺寸稳定后自动 resize，避免"数据有但图空白"。
export default function EChart({
  option,
  group,
  className,
  onDataZoom,
  onReady,
}: {
  option: any;
  group?: string;
  className?: string;
  onDataZoom?: (start: number, end: number) => void;
  onReady?: (chart: any) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const pending = useRef<any>(null);
  const onZoomRef = useRef(onDataZoom);
  onZoomRef.current = onDataZoom;

  useEffect(() => {
    let cancelled = false;
    let chart: any;
    let ro: any;
    import("echarts").then((echarts) => {
      if (cancelled || !ref.current) return;
      chart = echarts.init(ref.current);
      chartRef.current = chart;
      if (group) {
        chart.group = group;
        (echarts as any).connect(group);
      }
      if (pending.current) {
        chart.setOption(pending.current, true);
        if (ref.current.clientHeight > 0) chart.resize();
      }
      if (onZoomRef.current) {
        chart.on("dataZoom", (e: any) => {
          const b = e.batch ? e.batch[0] : e;
          if (b && b.start != null) onZoomRef.current!(b.start, b.end);
        });
      }
      if (onReady) onReady(chart);
      // 容器尺寸变化即 resize（弹性布局/字体加载/异步布局导致初始高度为 0 的救星）
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => {
          if (chart && ref.current && ref.current.clientHeight > 0) chart.resize();
        });
        ro.observe(ref.current);
      }
      const onResize = () => chart.resize();
      window.addEventListener("resize", onResize);
      (chart as any)._onResize = onResize;
    });
    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      const c = chartRef.current;
      if (c) {
        window.removeEventListener("resize", (c as any)._onResize);
        c.dispose();
        chartRef.current = null;
      }
    };
  }, [group]);

  useEffect(() => {
    pending.current = option;
    const c = chartRef.current;
    if (c) {
      c.setOption(option, true);
      if (ref.current && ref.current.clientHeight > 0) c.resize();
    }
  }, [option]);

  return <div ref={ref} className={className} style={{ width: "100%", height: "100%" }} />;
}
