"""股票 Universe 相关路由。"""
from fastapi import APIRouter, Query

from ..config import get_settings
from ..services import stock_universe

router = APIRouter()


@router.get("/stock/search")
def search_stocks(q: str = Query(..., min_length=1), limit: int = Query(20, ge=1, le=50)):
    """按 代码/名称/拼音 模糊搜索 A 股，返回带自动补全结构的结果。

    若输入像股票代码且本地无精确命中，会触发一次受节流保护的单只上游确认，
    再重新搜索——这样用户能查到「本地尚未缓存」的新股，又不会频繁打上游接口。
    """
    settings = get_settings()
    index = stock_universe.ensure_loaded(settings.stock_cache_file)
    q_clean = q.strip()
    results = stock_universe.search(index, q_clean, limit)
    if q_clean.isdigit() and not any(r["code"] == q_clean for r in results):
        stock_universe.find_or_refresh(q_clean, settings.stock_cache_file)
        results = stock_universe.search(stock_universe.get_index(), q_clean, limit)
    return {"query": q, "total": len(stock_universe.get_index()), "results": results}


@router.get("/stock/resolve")
def resolve_stock(code: str = Query(..., min_length=1)):
    """解析股票代码对应的名称（本地优先，未命中则单次上游确认）。"""
    settings = get_settings()
    name = stock_universe.resolve_name(code.strip(), settings.stock_cache_file)
    return {"code": code.strip(), "name": name, "found": bool(name)}


@router.get("/stock/list")
def list_stocks(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200)):
    """分页列出全部股票（用于前端全量缓存可选）。"""
    index = stock_universe.ensure_loaded(get_settings().stock_cache_file)
    return {"total": len(index), "results": index[offset : offset + limit]}


@router.post("/stock/universe/refresh")
def refresh_universe():
    """强制重新抓取并缓存全量 A 股列表（含拼音索引）。"""
    index = stock_universe.load_universe(get_settings().stock_cache_file, force=True)
    return {"total": len(index), "message": "已刷新股票列表缓存"}
