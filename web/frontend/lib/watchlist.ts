"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StockItem } from "./types";
import {
  getWatchlist,
  createGroup as apiCreateGroup,
  deleteGroup as apiDeleteGroup,
  renameGroup as apiRenameGroup,
  addStock as apiAddStock,
  removeStock as apiRemoveStock,
  toggleStock as apiToggleStock,
  importWatchlist,
} from "./api";

export interface WatchGroup {
  id: string;
  name: string;
  stocks: StockItem[];
}

export interface WatchlistApi {
  groups: WatchGroup[];
  ready: boolean;
  addGroup: (name: string) => Promise<WatchGroup>;
  removeGroup: (id: string) => Promise<void>;
  renameGroup: (id: string, name: string) => Promise<void>;
  addStock: (groupId: string, stock: StockItem) => Promise<void>;
  removeStock: (groupId: string, code: string) => Promise<void>;
  toggleStock: (groupId: string, stock: StockItem) => Promise<void>;
  isInGroup: (groupId: string, code: string) => boolean;
}

// 旧版浏览器 localStorage 键（迁移后清除）
const LEGACY_KEY = "stockmarket_watchlist_v1";

// 判断后端是否仍处于初始播种态（仅一个"我的自选"且为空），此时才允许从旧 localStorage 迁移
function isInitialState(groups: WatchGroup[]): boolean {
  return (
    groups.length === 1 &&
    groups[0].name === "我的自选" &&
    (!groups[0].stocks || groups[0].stocks.length === 0)
  );
}

export function useWatchlist(): WatchlistApi {
  const [groups, setGroups] = useState<WatchGroup[]>([]);
  const [ready, setReady] = useState(false);
  const migrated = useRef(false);

  // 启动时从后端（web/backend/data/watchlist.json）拉取分组；首次使用做一次旧数据迁移
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const g = await getWatchlist();
        if (!alive) return;
        // 一次性迁移：仅当后端为空态且浏览器有旧数据时，导入并清理旧键
        if (!migrated.current && isInitialState(g)) {
          const legacy = (() => {
            try {
              const raw = localStorage.getItem(LEGACY_KEY);
              return raw ? (JSON.parse(raw) as WatchGroup[]) : null;
            } catch {
              return null;
            }
          })();
          if (legacy && Array.isArray(legacy) && legacy.length > 0) {
            const imported = await importWatchlist(legacy);
            if (alive) setGroups(imported);
            migrated.current = true;
            try {
              localStorage.removeItem(LEGACY_KEY);
            } catch {
              /* ignore */
            }
            return;
          }
        }
        setGroups(g);
      } catch {
        /* 后端不可用时保持空分组 */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const addGroup = useCallback(async (name: string): Promise<WatchGroup> => {
    const res = await apiCreateGroup(name);
    setGroups(res.groups);
    return res.group;
  }, []);

  const removeGroup = useCallback(async (id: string) => {
    setGroups(await apiDeleteGroup(id));
  }, []);

  const renameGroup = useCallback(async (id: string, name: string) => {
    setGroups(await apiRenameGroup(id, name));
  }, []);

  const addStock = useCallback(async (groupId: string, stock: StockItem) => {
    setGroups(await apiAddStock(groupId, stock.code, stock.name));
  }, []);

  const removeStock = useCallback(async (groupId: string, code: string) => {
    setGroups(await apiRemoveStock(groupId, code));
  }, []);

  const toggleStock = useCallback(async (groupId: string, stock: StockItem) => {
    setGroups(await apiToggleStock(groupId, stock.code, stock.name));
  }, []);

  const isInGroup = useCallback(
    (groupId: string, code: string) =>
      groups.some((g) => g.id === groupId && g.stocks.some((s) => s.code === code)),
    [groups]
  );

  return { groups, ready, addGroup, removeGroup, renameGroup, addStock, removeStock, toggleStock, isInGroup };
}
