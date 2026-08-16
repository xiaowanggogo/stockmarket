"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import StockSearch from "../components/StockSearch";
import PriceChart from "../components/PriceChart";
import SubChart, { SUB_LABELS, type SubIndicator } from "../components/SubChart";
import IntradayChart from "../components/IntradayChart";
import InfoPanel from "../components/InfoPanel";
import { getHistory, getMinuteData, getStockInfo } from "../lib/api";
import { useWatchlist } from "../lib/watchlist";
import AddToWatchlist from "../components/AddToWatchlist";
import WatchlistDrawer from "../components/WatchlistDrawer";
import type { QuoteRecord, StockItem, MinuteRecord, StockInfo } from "../lib/types";

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 在 yyyy-mm-dd 上加减天数
function shift(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return fmt(d);
}

// 两个日期相差天数（a - b）
function diffDays(a: string, b: string): number {
  return Math.round((new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) / 86400000);
}

// 按日期去重合并两段行情（保留已有一份，补入更早的数据）
function mergeByDate(a: QuoteRecord[], b: QuoteRecord[]): QuoteRecord[] {
  const m = new Map<string, QuoteRecord>();
  for (const r of a) m.set(r.date, r);
  for (const r of b) if (!m.has(r.date)) m.set(r.date, r);
  return Array.from(m.values()).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

const FLOOR_DATE = "1991-01-01"; // A 股最早上市时间附近，作为向前补取下限
const WARMUP_DAYS = 60; // 预热天数（用于 BOLL/KDJ 等指标的前置数据，不显示在日期框）
const MIN_WINDOW = 20; // 最小可见窗口（日历日）
const INIT_WINDOW = 30; // 初始可见窗口（日历日）：展示最新交易日及其过去 30 天

// 默认窗口：最新交易日及其前 30 天（end=今天，后端会截断到最近交易日）
function defaultWindow(): [string, string] {
  const t = new Date();
  return [shift(fmt(t), -INIT_WINDOW), fmt(t)];
}

export default function Page() {
  const today = new Date();
  const [stock, setStock] = useState<StockItem | null>({ code: "600519", name: "贵州茅台" });
  const [viewStart, setViewStart] = useState(shift(fmt(today), -INIT_WINDOW));
  const [viewEnd, setViewEnd] = useState(fmt(today));
  const [adjust, setAdjust] = useState<"qfq" | "hfq" | "">("qfq");
  const [mainH, setMainH] = useState(420); // 主图高度（px，可拖拽放大/缩小）
  const [subH, setSubH] = useState(540); // 子图行高度（px，可向下拖拽放大；默认抬高以便一打开看清量化/信息）

  const [displayMode, setDisplayMode] = useState<"kline" | "line">("kline");
  const [yAxisType, setYAxisType] = useState<"normal" | "log">("normal");
  const [yAxisRange, setYAxisRange] = useState<"auto" | "zero">("auto");
  const [showBoll, setShowBoll] = useState(true);
  const [showNine, setShowNine] = useState(false);
  const [showSR, setShowSR] = useState(true);
  const [showGap, setShowGap] = useState(false);
  const [subIndicators, setSubIndicators] = useState<SubIndicator[]>(["volume", "turnover", "macd"]);

  // 自选股（localStorage 持久化）
  const wl = useWatchlist();
  const [showAddWL, setShowAddWL] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const newGroupRef = useRef<HTMLDivElement>(null);
  const [showDrawer, setShowDrawer] = useState(false);

  // 新建分组弹层：点击外部关闭
  useEffect(() => {
    if (!showNewGroup) return;
    const onDoc = (e: MouseEvent) => {
      if (newGroupRef.current && !newGroupRef.current.contains(e.target as Node)) {
        setShowNewGroup(false);
        setNewGroupName("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showNewGroup]);

  const createGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    wl.addGroup(name);
    setNewGroupName("");
    setShowNewGroup(false);
  };

  const [data, setData] = useState<QuoteRecord[]>([]);
  const [visRange, setVisRange] = useState<{ s: number; e: number }>({ s: 0, e: 100 });
  const [meta, setMeta] = useState<{ code: string; name: string; count: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minuteData, setMinuteData] = useState<MinuteRecord[]>([]);
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);

  // 内部：查询最早日期（含预热）、可见窗口百分比、补取锁、防抖
  const dataRef = useRef<QuoteRecord[]>([]);
  const fetchStartRef = useRef<string>("");
  const extending = useRef(false);
  const lastZoom = useRef<{ s: number; e: number }>({ s: 0, e: 100 });
  const visTimer = useRef<any>(null);
  const chartAreaRef = useRef<HTMLDivElement | null>(null);

  // 高度拖拽：通用手柄。按像素增量调整目标高度（无地板、无上限，可突破视口并整体滚动）
  const MIN_PANEL_H = 120;
  const MAX_PANEL_H = 6000;
  const onResizeDown = (
    e: React.MouseEvent,
    getVal: () => number,
    setVal: (v: number) => void
  ) => {
    e.preventDefault();
    const startY = e.clientY;
    const start = getVal();
    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - startY;
      setVal(Math.max(MIN_PANEL_H, Math.min(MAX_PANEL_H, start + dy)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // 查询：窗口=[vs,ve]，实际拉取 [vs-预热, ve]；visRange 定位到窗口在 data 中的占比
  const doQuery = useCallback(
    async (vs: string, ve: string, code?: string, adj?: "qfq" | "hfq" | "") => {
      const _code = code ?? stock?.code;
      const _adj = adj ?? adjust;
      if (!_code || !vs || !ve) return;
      // 最小窗口约束
      if (diffDays(ve, vs) < MIN_WINDOW) ve = shift(vs, MIN_WINDOW);
      setLoading(true);
      setError(null);
      try {
        const fs = shift(vs, -WARMUP_DAYS);
        fetchStartRef.current = fs;
        const r = await getHistory(_code, fs, ve, _adj);
        dataRef.current = r.data;
        setData(r.data);
        setMeta({ code: r.code, name: r.name, count: r.count });
        setViewStart(vs);
        setViewEnd(ve);
        // 窗口在 data 中的百分比位置（跳过预热区）
        const N = r.data.length;
        let si = r.data.findIndex((d) => d.date >= vs);
        if (si < 0) si = 0;
        const s = N > 1 ? (si / (N - 1)) * 100 : 0;
        setVisRange({ s, e: 100 });
        lastZoom.current = { s, e: 100 };
      } catch (e: any) {
        setError(e?.message || "查询失败");
        setData([]);
        dataRef.current = [];
      } finally {
        setLoading(false);
      }
    },
    [stock, adjust]
  );

  // 拖到左边缘：向前补取更早历史（prepend + 保持可视窗口位置）
  const extendLeft = useCallback(async () => {
    if (extending.current || !stock) return;
    const fs = fetchStartRef.current;
    if (!fs || fs <= FLOOR_DATE) return;
    const newFs = shift(fs, -180);
    if (newFs >= fs) return;
    extending.current = true;
    try {
      const r = await getHistory(stock.code, newFs, fs, adjust);
      if (r.data.length) {
        const prev = dataRef.current;
        const merged = mergeByDate(r.data, prev);
        const M = merged.length - prev.length;
        if (M > 0) {
          const total = merged.length;
          const ps = ((lastZoom.current.s / 100) * prev.length + M) / total * 100;
          const pe = ((lastZoom.current.e / 100) * prev.length + M) / total * 100;
          const ns = Math.max(0, Math.min(100, ps));
          const ne = Math.max(0, Math.min(100, pe));
          setVisRange({ s: ns, e: ne });
          lastZoom.current = { s: ns, e: ne };
        }
        dataRef.current = merged;
        setData(merged);
        fetchStartRef.current = newFs;
      }
    } catch {
      /* 补取失败不影响当前视图 */
    } finally {
      extending.current = false;
    }
  }, [stock, adjust]);

  // 主图 dataZoom：回写日期框 + 防抖更新 visRange（驱动指标/SR 重算）+ 左边缘补取
  const handleDataZoom = useCallback(
    (s: number, e: number) => {
      lastZoom.current = { s, e };
      if (s <= 1) extendLeft();
      if (visTimer.current) clearTimeout(visTimer.current);
      visTimer.current = setTimeout(() => {
        setVisRange({ s, e });
        const d = dataRef.current;
        if (d.length > 0) {
          const N = d.length;
          const si = Math.max(0, Math.min(N - 1, Math.round((s / 100) * (N - 1))));
          const ei = Math.max(0, Math.min(N - 1, Math.round((e / 100) * (N - 1))));
          setViewStart(d[si].date);
          setViewEnd(d[ei].date);
        }
      }, 180);
    },
    [extendLeft]
  );

  // 首次加载默认标的（最新交易日及其前 30 天）
  useEffect(() => {
    const [vs, ve] = defaultWindow();
    doQuery(vs, ve);
    fetchExtras(stock?.code || "600519", adjust);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 拉取分时数据 + 公司信息（与日线查询独立，仅跟股票代码/复权相关）
  const fetchExtras = useCallback(async (code: string, adj: "qfq" | "hfq" | "") => {
    try {
      const [m, info] = await Promise.all([
        getMinuteData(code, "1", adj),
        getStockInfo(code),
      ]);
      setMinuteData(m.data);
      setStockInfo(info);
    } catch {
      /* 分时/信息获取失败不影响主图 */
    }
  }, []);

  const handleSelect = (s: StockItem) => {
    setStock(s);
    const [vs, ve] = defaultWindow();
    doQuery(vs, ve, s.code);
    fetchExtras(s.code, adjust);
  };

  const handleQueryClick = () => {
    const [vs, ve] = defaultWindow();
    doQuery(vs, ve);
  };

  const handleAdjustChange = (v: "qfq" | "hfq" | "") => {
    setAdjust(v);
    doQuery(viewStart, viewEnd, stock?.code, v);
    fetchExtras(stock?.code || "600519", v);
  };

  const setSub = (idx: number, val: SubIndicator) => {
    setSubIndicators((arr) => arr.map((v, i) => (i === idx ? val : v)));
  };

  return (
    <div className="app">
      <header className="topbar">
        {/* 左上：显示方式 + Y轴 控制 + 主图叠加 */}
        <div className="topbar-left">
          <div className="control">
            <label className="ctl-label">显示</label>
            <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value as any)}>
              <option value="kline">K线图</option>
              <option value="line">折线图</option>
            </select>
          </div>
          <div className="control">
            <label className="ctl-label">Y轴</label>
            <select value={yAxisType} onChange={(e) => setYAxisType(e.target.value as any)}>
              <option value="normal">普通</option>
              <option value="log">对数</option>
            </select>
          </div>
          <div className="control">
            <label className="ctl-label">范围</label>
            <select
              value={yAxisRange}
              onChange={(e) => setYAxisRange(e.target.value as any)}
              title={yAxisType === "log" ? "对数轴：自适应=贴合可见窗口；从0=显示全量数据范围" : ""}
            >
              <option value="auto">自适应</option>
              <option value="zero">从0</option>
            </select>
          </div>
          <div className="overlay-group">
            <span className="ctl-label">主图叠加</span>
            <label className="chk"><input type="checkbox" checked={showBoll} onChange={(e) => setShowBoll(e.target.checked)} />布林线</label>
            <label className="chk"><input type="checkbox" checked={showNine} onChange={(e) => setShowNine(e.target.checked)} />神奇九转</label>
            <label className="chk"><input type="checkbox" checked={showSR} onChange={(e) => setShowSR(e.target.checked)} />支撑压力</label>
            <label className="chk"><input type="checkbox" checked={showGap} onChange={(e) => setShowGap(e.target.checked)} />跳空缺口</label>
          </div>
        </div>

        {/* 正上：搜索框 + 紧跟查询按钮 */}
        <div className="topbar-center">
          <div className="search-row">
            <StockSearch onSelect={handleSelect} />
            <button onClick={handleQueryClick} disabled={loading}>
              {loading ? "查询中…" : "查询"}
            </button>
          </div>
        </div>

        {/* 右上：复权 + 新建分组 + 添加自选 + 自选股抽屉 */}
        <div className="topbar-right">
          <div className="control">
            <label className="ctl-label">复权</label>
            <select value={adjust} onChange={(e) => handleAdjustChange(e.target.value as any)}>
              <option value="qfq">前复权</option>
              <option value="hfq">后复权</option>
              <option value="">不复权</option>
            </select>
          </div>
          <div className="wl-add-wrap">
            <button onClick={() => setShowNewGroup((v) => !v)}>＋ 新建分组</button>
            {showNewGroup && (
              <div className="wl-popover" ref={newGroupRef}>
                <div className="wl-pop-title">新建分组</div>
                <div className="wl-pop-new">
                  <input
                    autoFocus
                    placeholder="分组名称"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createGroup();
                    }}
                  />
                  <button onClick={createGroup}>创建</button>
                </div>
              </div>
            )}
          </div>
          <div className="wl-add-wrap">
            <button onClick={() => setShowAddWL((v) => !v)}>★ 添加自选</button>
            {showAddWL && (
              <AddToWatchlist stock={stock} wl={wl} onClose={() => setShowAddWL(false)} />
            )}
          </div>
          <button onClick={() => setShowDrawer(true)}>☰ 自选股</button>
        </div>
      </header>

      <main className="chart-area" ref={chartAreaRef}>
        <div className="title-bar">
          <span className="t-name">{meta ? meta.name : stock?.name || "—"}</span>
          <span className="t-meta">
            {meta ? `${meta.code} · ${adjust === "qfq" ? "前复权" : adjust === "hfq" ? "后复权" : "不复权"} · 窗口 ${viewStart} ~ ${viewEnd}` : ""}
          </span>
        </div>

        {/* 主图行：2/3 日线主图 + 1/3 分时K线（高度独立可调） */}
        <section className="main-row" style={{ height: mainH, flex: "none" }}>
          <div className="main-chart">
            <PriceChart
              data={data}
              displayMode={displayMode}
              yAxisType={yAxisType}
              yAxisRange={yAxisRange}
              showBoll={showBoll}
              showNine={showNine}
              showSR={showSR}
              showGap={showGap}
              visRange={visRange}
              onDataZoom={handleDataZoom}
            />
          </div>
          <div className="side-chart intraday-chart">
            <div className="subchart-head"><span className="label">分时（最近交易日）</span></div>
            <IntradayChart data={minuteData} />
          </div>
        </section>

        <div className="splitter" onMouseDown={(e) => onResizeDown(e, () => mainH, setMainH)} title="拖拽调整主图高度（向下放大）" />

        {/* 子图行：2/3 量化指标子图（3 指标纵向堆叠）+ 1/3 公司信息；高度独立可调、可向下放大、整体滚动 */}
        <section className="sub-row" style={{ height: subH, flex: "none" }}>
          <div className="quant-panel">
            <div className="panel-head"><span className="label">量化指标子图</span></div>
            <div className="quant-charts">
              {[0, 1, 2].map((i) => (
                <div className="quant-chart" key={i}>
                  <div className="subchart-head">
                    <select value={subIndicators[i]} onChange={(e) => setSub(i, e.target.value as SubIndicator)}>
                      {SUB_LABELS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <SubChart data={data} indicator={subIndicators[i]} />
                </div>
              ))}
            </div>
          </div>
          <div className="side-chart info-chart">
            <div className="subchart-head"><span className="label">公司信息</span></div>
            <InfoPanel info={stockInfo} />
          </div>
        </section>

        <div className="splitter" onMouseDown={(e) => onResizeDown(e, () => subH, setSubH)} title="拖拽向下放大量化指标子图 / 公司信息（整体滚动）" />
      </main>

      <footer className="status-bar">
        {error ? (
          <span className="error">错误：{error}</span>
        ) : loading ? (
          "正在请求行情数据…"
        ) : meta ? (
          `已加载 ${meta.name} (${meta.code})，可见窗口 ${viewStart} ~ ${viewEnd}`
        ) : (
          "就绪"
        )}
      </footer>

      <WatchlistDrawer open={showDrawer} wl={wl} onSelect={handleSelect} onClose={() => setShowDrawer(false)} />
    </div>
  );
}
