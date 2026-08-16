"use client";
import { useEffect, useRef } from "react";
import type { StockItem } from "../lib/types";
import type { WatchlistApi } from "../lib/watchlist";

// 点击「★ 添加自选」后弹出的分组选择层：仅勾选现有分组来增减当前股票（与"新建分组"分离）。
export default function AddToWatchlist({
  stock,
  wl,
  onClose,
}: {
  stock: StockItem | null;
  wl: WatchlistApi;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  if (!stock) return null;

  return (
    <div className="wl-popover" ref={boxRef}>
      <div className="wl-pop-title">添加「{stock.name}」到分组</div>
      {wl.groups.length === 0 ? (
        <div className="wl-pop-hint">还没有分组，请先点击右上角「＋ 新建分组」</div>
      ) : (
        <ul className="wl-pop-list">
          {wl.groups.map((g) => {
            const checked = wl.isInGroup(g.id, stock.code);
            return (
              <li key={g.id} className={checked ? "checked" : ""} onClick={() => wl.toggleStock(g.id, stock)}>
                <span className="wl-check">{checked ? "✓" : ""}</span>
                <span className="wl-gname">{g.name}</span>
                <span className="wl-gcount">{g.stocks.length}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
