"use client";
import { useEffect, useRef, useState } from "react";
import { searchStocks } from "../lib/api";
import type { StockItem } from "../lib/types";

// 顶部中央搜索框：支持代码 / 名称 / 拼音 模糊搜索，带自动补全下拉与键盘选择。
export default function StockSearch({ onSelect }: { onSelect: (s: StockItem) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<StockItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => {
      searchStocks(q, 30)
        .then((r) => {
          setItems(r.results);
          setOpen(true);
          setActive(-1);
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (s: StockItem) => {
    onSelect(s);
    setQ(`${s.name} (${s.code})`);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      choose(items[active]);
    }
  };

  return (
    <div className="search" ref={boxRef}>
      <input
        className="search-input"
        placeholder="代码 / 名称 / 拼音，如 600519、茅台、mt"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => items.length && setOpen(true)}
      />
      {open && items.length > 0 && (
        <ul className="search-list">
          {items.map((s, i) => (
            <li
              key={s.code}
              className={i === active ? "active" : ""}
              onMouseDown={() => choose(s)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="s-name">{s.name}</span>
              <span className="s-code">{s.code}</span>
              <span className="s-py">{s.initials || s.pinyin || ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
