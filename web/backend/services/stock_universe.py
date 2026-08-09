"""A 股全量股票 Universe：抓取 + 本地缓存 + 代码/名称/拼音搜索索引。

缓存策略（避免重复查询、避免触发上游限流）：
- 首次/强制刷新时通过 akshare 获取全量 A 股列表，并预计算拼音/首字母，缓存为 JSON。
- 启动时若缓存文件不存在或数量不完整（< _MIN_STOCKS），视为未储存全部，自动重新抓取。
- 用户查询某只「本地不存在」的股票时，走 find_or_refresh：受节流保护（_ONE_FETCH_THROTTLE），
  只做「单次」上游确认并把结果写回缓存，避免每次搜索都打上游接口。
- 网络不可用时回退到内置样本，保证服务可启动。
- 搜索支持：股票代码、名称、全拼、拼音首字母。
"""
import json
import logging
import os
import time
from typing import Dict, List, Optional

logger = logging.getLogger("web")

# 缓存被认为"完整"的最低数量；低于此值视为未储存全部，重新抓取。
_MIN_STOCKS = 3000
# 单只股票补充抓取的最小间隔（秒），避免频繁调用上游触发限流。
_ONE_FETCH_THROTTLE = 30

# 内置回退样本（网络不可用时使用，仅作演示）
_FALLBACK = [
    {"code": "600519", "name": "贵州茅台"},
    {"code": "601318", "name": "中国平安"},
    {"code": "600036", "name": "招商银行"},
    {"code": "000001", "name": "平安银行"},
    {"code": "000858", "name": "五粮液"},
    {"code": "600276", "name": "恒瑞医药"},
    {"code": "601899", "name": "紫金矿业"},
    {"code": "600900", "name": "长江电力"},
    {"code": "000333", "name": "美的集团"},
    {"code": "000651", "name": "格力电器"},
    {"code": "600030", "name": "中信证券"},
    {"code": "300750", "name": "宁德时代"},
    {"code": "002594", "name": "比亚迪"},
    {"code": "601012", "name": "隆基绿能"},
    {"code": "600887", "name": "伊利股份"},
    {"code": "601166", "name": "兴业银行"},
    {"code": "600000", "name": "浦发银行"},
    {"code": "000002", "name": "万科A"},
    {"code": "600009", "name": "上海机场"},
    {"code": "601398", "name": "工商银行"},
]

# 模块级单例索引
_INDEX: List[Dict] = []
# 上次单只补充抓取的时间戳（用于节流）
_LAST_ONE_FETCH = 0.0


def _fetch_from_akshare() -> List[Dict]:
    try:
        import akshare as ak

        df = ak.stock_info_a_code_name()
        records = [
            {"code": str(c), "name": str(n)}
            for c, n in zip(df["code"], df["name"])
        ]
        logger.info(f"从 akshare 获取 A 股列表 {len(records)} 条")
        return records
    except Exception as e:  # noqa: BLE001
        logger.warning(f"获取全量 A 股列表失败，使用内置样本: {e}")
        return []


def _fetch_one(code: str) -> Optional[Dict]:
    """向上游确认单只股票是否存在并返回 {code, name}，失败返回 None。"""
    try:
        import akshare as ak

        info = ak.stock_individual_info_em(symbol=code)
        col_a = "item" if "item" in info.columns else "name"
        col_b = "value" if "value" in info.columns else "value"
        d = dict(zip(info[col_a], info[col_b]))
        name = d.get("股票简称") or d.get("名称") or ""
        if name:
            logger.info(f"上游确认股票 {code} -> {name}")
            return {"code": code, "name": str(name)}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"单只股票 {code} 上游确认失败: {e}")
    return None


def _build_index(records: List[Dict]) -> List[Dict]:
    try:
        from pypinyin import lazy_pinyin, pinyin as py_pinyin, Style
    except Exception:  # noqa: BLE001
        return [{**r, "pinyin": "", "initials": ""} for r in records]

    def py(name: str):
        full = "".join(lazy_pinyin(name)) if name else ""
        init = "".join(p[0] for p in py_pinyin(name, style=Style.FIRST_LETTER)) if name else ""
        return full, init

    out = []
    for r in records:
        full, init = py(r["name"])
        out.append({**r, "pinyin": full, "initials": init})
    return out


def _save_index(cache_file: str) -> None:
    os.makedirs(os.path.dirname(cache_file), exist_ok=True)
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(_INDEX, f, ensure_ascii=False)


def load_universe(cache_file: str, force: bool = False) -> List[Dict]:
    """加载/构建全量股票索引。

    - force=True 或缓存不存在 -> 重新抓取。
    - 缓存存在但不完整（数量 < _MIN_STOCKS）-> 视为「未储存全部」，重新抓取。
    """
    global _INDEX
    if not force and os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cached = json.load(f)
            if isinstance(cached, list) and len(cached) >= _MIN_STOCKS:
                _INDEX = cached
                logger.info(f"命中本地缓存股票列表 {len(_INDEX)} 条（完整，无需查询）")
                return _INDEX
            logger.info(
                f"本地缓存不完整（{len(cached) if isinstance(cached, list) else 0} 条 < {_MIN_STOCKS}），重新抓取全量"
            )
        except Exception as e:  # noqa: BLE001
            logger.warning(f"读取缓存失败，重新构建: {e}")

    records = _fetch_from_akshare() or _FALLBACK
    _INDEX = _build_index(records)
    _save_index(cache_file)
    logger.info(f"已写入本地缓存股票列表 {len(_INDEX)} 条 -> {cache_file}")
    return _INDEX


def ensure_loaded(cache_file: str) -> List[Dict]:
    global _INDEX
    if not _INDEX:
        load_universe(cache_file)
    return _INDEX


def get_index() -> List[Dict]:
    return _INDEX


def name_by_code(code: str) -> str:
    for r in _INDEX:
        if r["code"] == code:
            return r["name"]
    return ""


def find_or_refresh(code: str, cache_file: str) -> Optional[str]:
    """本地未命中时，受节流保护地单次确认并写回缓存，避免频繁调用上游。

    返回该股票名称（若确认成功），否则 None。
    """
    global _INDEX, _LAST_ONE_FETCH
    code = (code or "").strip()
    if not code:
        return None
    hit = name_by_code(code)
    if hit:
        return hit

    now = time.time()
    if now - _LAST_ONE_FETCH < _ONE_FETCH_THROTTLE:
        logger.info(f"股票 {code} 本地未命中，但距上次补充抓取不足 {_ONE_FETCH_THROTTLE}s，跳过本次上游调用")
        return None
    _LAST_ONE_FETCH = now

    one = _fetch_one(code)
    if one:
        _INDEX = _INDEX + [one]
        _save_index(cache_file)
        logger.info(f"已补充缓存单只股票 {code} {one['name']}")
        return one["name"]
    return None


def resolve_name(code: str, cache_file: str) -> str:
    """解析股票名称：优先本地，未命中则单次上游确认（节流）。"""
    name = name_by_code(code)
    if name:
        return name
    return find_or_refresh(code, cache_file) or ""


def _score(rec: Dict, q: str) -> int:
    code = rec["code"]
    name = rec["name"]
    pinyin = rec.get("pinyin", "")
    initials = rec.get("initials", "")
    if code == q:
        return 100
    if code.startswith(q):
        return 90
    if name == q:
        return 85
    if name.startswith(q):
        return 80
    if initials == q:
        return 75
    if initials.startswith(q):
        return 70
    if pinyin.startswith(q):
        return 65
    if q in name:
        return 60
    if q in pinyin:
        return 50
    if q in initials:
        return 45
    return 0


def search(index: List[Dict], q: str, limit: int = 20) -> List[Dict]:
    q = (q or "").strip().lower()
    if not q:
        return []
    scored = [(_score(r, q), r) for r in index]
    scored = [(s, r) for s, r in scored if s > 0]
    scored.sort(key=lambda x: -x[0])
    return [r for _, r in scored[:limit]]
