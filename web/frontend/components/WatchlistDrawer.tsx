"use client";
import { useState } from "react";
import type { StockItem } from "../lib/types";
import type { WatchlistApi } from "../lib/watchlist";

// 右侧弹出式侧边栏：管理自选股分组，点击股票直接跳转；支持编辑分组与多组归属。
export default function WatchlistDrawer({
  open,
  wl,
  onSelect,
  onClose,
}: {
  open: boolean;
  wl: WatchlistApi;
  onSelect: (s: StockItem) => void;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  // 全部已知自选股（跨分组去重），作为编辑分组时的候选池——同一股票可加入多个分组
  const allStocks = (() => {
    const m = new Map<string, StockItem>();
    wl.groups.forEach((g) => g.stocks.forEach((s) => { if (!m.has(s.code)) m.set(s.code, s); }));
    return Array.from(m.values());
  })();

  // 新建空分组并直接进入编辑态
  const onNewGroup = async () => {
    const g = await wl.addGroup("新建分组");
    setEditingId(g.id);
  };

  return (
    <>
      <div className={`wl-mask ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`wl-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="wl-drawer-head">
          <span className="wl-drawer-title">自选股</span>
          <div className="wl-drawer-actions">
            <button className="wl-new-group" onClick={onNewGroup} title="新建分组">＋ 新建</button>
            <button className="wl-close" onClick={onClose} title="关闭">×</button>
          </div>
        </div>
        <div className="wl-drawer-body">
          {wl.groups.length === 0 && (
            <div className="wl-empty">还没有分组，点击右上角「＋ 新建分组」或上方「＋ 新建」</div>
          )}
          {wl.groups.map((g) => {
            const isEditing = editingId === g.id;
            if (isEditing) {
              return (
                <div className="wl-group wl-group-editing" key={g.id}>
                  <div className="wl-edit-row">
                    <input
                      className="wl-edit-name"
                      value={g.name}
                      autoFocus
                      onChange={(e) => wl.renameGroup(g.id, e.target.value)}
                    />
                    <button className="wl-edit-done" onClick={() => setEditingId(null)}>完成</button>
                  </div>
                  <div className="wl-edit-hint">勾选股票加入本组（同一股票可同时属于多个分组）</div>
                  <ul className="wl-edit-members">
                    {allStocks.map((s) => {
                      const checked = g.stocks.some((x) => x.code === s.code);
                      return (
                        <li key={s.code} className={checked ? "on" : ""} onClick={() => wl.toggleStock(g.id, s)}>
                          <span className="wl-check">{checked ? "✓" : ""}</span>
                          <span className="wl-gname">{s.name}</span>
                          <span className="wl-gcount">{s.code}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            }
            return (
              <div className="wl-group" key={g.id}>
                <div className="wl-group-head">
                  <span className="wl-group-name">{g.name}</span>
                  <span className="wl-group-count">{g.stocks.length}</span>
                  <button className="wl-edit-group" title="编辑分组" onClick={() => setEditingId(g.id)}>编辑</button>
                  <button className="wl-del-group" title="删除分组" onClick={() => wl.removeGroup(g.id)}>删除</button>
                </div>
                {g.stocks.length === 0 && <div className="wl-group-empty">空分组（点击「编辑」添加股票）</div>}
                {g.stocks.map((s) => (
                  <div className="wl-stock" key={s.code}>
                    <span className="wl-stock-name" onClick={() => { onSelect(s); onClose(); }}>
                      {s.name}
                    </span>
                    <span className="wl-stock-code">{s.code}</span>
                    <button
                      className="wl-del-stock"
                      title="移除"
                      onClick={() => wl.removeStock(g.id, s.code)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
