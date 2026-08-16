"""自选股与分组：本地磁盘持久化（统一存放于 web/backend/data/watchlist.json）。

- 所有本地数据（股价 db、股票列表、自选股）统一收口到 backend_data_dir。
- 单文件 JSON，结构简易；首次无数据时播种一个默认分组。
- 线程安全：模块级锁保护读写，避免并发写损坏；写入采用临时文件 + 原子替换。
"""
import json
import logging
import os
import threading
import uuid

logger = logging.getLogger("web")

# 可重入锁：mutator 在持锁状态下会调用 load()（其内部也加锁），必须用 RLock 避免自死锁。
_lock = threading.RLock()
_groups = None  # 模块级缓存（首次加载后常驻内存）

DEFAULT_GROUP_NAME = "我的自选"


def _path(data_dir: str) -> str:
    return os.path.join(data_dir, "watchlist.json")


def _uid() -> str:
    return uuid.uuid4().hex[:12]


def _seed() -> list:
    return [{"id": _uid(), "name": DEFAULT_GROUP_NAME, "stocks": []}]


def _sanitize(groups: list) -> list:
    """清洗外部传入的分组结构，保证字段齐全、类型安全。"""
    out = []
    for g in groups or []:
        if not isinstance(g, dict):
            continue
        gid = str(g.get("id") or _uid())
        name = str(g.get("name") or "未命名分组")
        stocks = []
        for s in g.get("stocks", []) or []:
            if not isinstance(s, dict):
                continue
            code = str(s.get("code") or "").strip()
            if not code:
                continue
            stocks.append({"code": code, "name": str(s.get("name") or "").strip()})
        out.append({"id": gid, "name": name, "stocks": stocks})
    return out


def _save(data_dir: str, groups: list) -> None:
    p = _path(data_dir)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(groups, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)  # 原子替换，避免半写文件
    global _groups
    _groups = groups


def load(data_dir: str) -> list:
    """加载分组（带缓存 + 播种默认分组）。返回副本，防止外部就地篡改。"""
    global _groups
    with _lock:
        if _groups is not None:
            return [dict(g, stocks=list(g.get("stocks", []))) for g in _groups]
        groups = []
        p = _path(data_dir)
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                if isinstance(raw, list):
                    groups = raw
            except Exception as e:  # noqa: BLE001
                logger.warning(f"读取自选股缓存失败，重新播种: {e}")
        if not groups:
            groups = _seed()
            _save(data_dir, groups)
        else:
            # 规范化内存缓存
            groups = _sanitize(groups)
            _groups = groups
        return [dict(g, stocks=list(g.get("stocks", []))) for g in groups]


def reload(data_dir: str) -> list:
    """强制从磁盘重载（供外部变更或测试使用）。"""
    global _groups
    with _lock:
        _groups = None
    return load(data_dir)


def get_groups(data_dir: str) -> list:
    return load(data_dir)


def add_group(data_dir: str, name: str) -> dict:
    name = (name or "").strip() or "未命名分组"
    with _lock:
        groups = load(data_dir)
        g = {"id": _uid(), "name": name, "stocks": []}
        groups.append(g)
        _save(data_dir, groups)
        return dict(g, stocks=list(g["stocks"]))


def remove_group(data_dir: str, group_id: str) -> list:
    with _lock:
        groups = [g for g in load(data_dir) if g["id"] != group_id]
        # 至少保留一个分组，避免空态无法添加
        if not groups:
            groups = _seed()
        _save(data_dir, groups)
        return [dict(g, stocks=list(g.get("stocks", []))) for g in groups]


def rename_group(data_dir: str, group_id: str, name: str) -> list:
    name = (name or "").strip()
    with _lock:
        groups = load(data_dir)
        for g in groups:
            if g["id"] == group_id:
                g["name"] = name or g["name"]
        _save(data_dir, groups)
        return [dict(g, stocks=list(g.get("stocks", []))) for g in groups]


def add_stock(data_dir: str, group_id: str, code: str, name: str) -> list:
    code = (code or "").strip()
    if not code:
        return load(data_dir)
    with _lock:
        groups = load(data_dir)
        for g in groups:
            if g["id"] == group_id:
                stocks = [s for s in g.get("stocks", []) if s["code"] != code]
                stocks.append({"code": code, "name": (name or "").strip()})
                g["stocks"] = stocks
                break
        _save(data_dir, groups)
        return [dict(g, stocks=list(g.get("stocks", []))) for g in groups]


def remove_stock(data_dir: str, group_id: str, code: str) -> list:
    code = (code or "").strip()
    with _lock:
        groups = load(data_dir)
        for g in groups:
            if g["id"] == group_id:
                g["stocks"] = [s for s in g.get("stocks", []) if s["code"] != code]
                break
        _save(data_dir, groups)
        return [dict(g, stocks=list(g.get("stocks", []))) for g in groups]


def toggle_stock(data_dir: str, group_id: str, code: str, name: str) -> list:
    code = (code or "").strip()
    if not code:
        return load(data_dir)
    with _lock:
        groups = load(data_dir)
        for g in groups:
            if g["id"] == group_id:
                stocks = g.get("stocks", [])
                if any(s["code"] == code for s in stocks):
                    g["stocks"] = [s for s in stocks if s["code"] != code]
                else:
                    g["stocks"] = stocks + [{"code": code, "name": (name or "").strip()}]
                break
        _save(data_dir, groups)
        return [dict(g, stocks=list(g.get("stocks", []))) for g in groups]


def import_groups(data_dir: str, groups: list) -> list:
    """整体替换分组（用于从浏览器 localStorage 一次性迁移）。"""
    cleaned = _sanitize(groups)
    if not cleaned:
        cleaned = _seed()
    with _lock:
        _save(data_dir, cleaned)
        return [dict(g, stocks=list(g.get("stocks", []))) for g in cleaned]
