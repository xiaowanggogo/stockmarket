"""自选股 / 分组管理路由（数据持久化于 web/backend/data/watchlist.json）。

所有写操作返回更新后的完整分组列表，前端直接以服务端为准覆盖本地状态，避免二次 GET。
"""
from typing import Any, Dict, List

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..config import get_settings
from ..services import watchlist as svc

router = APIRouter()


class StockIn(BaseModel):
    code: str
    name: str = ""


class GroupName(BaseModel):
    name: str = ""


class ImportBody(BaseModel):
    groups: List[Dict[str, Any]] = Field(default_factory=list)


def _dir() -> str:
    return get_settings().backend_data_dir


@router.get("/watchlist")
def get_watchlist() -> List[Dict[str, Any]]:
    """获取全部分组。"""
    return svc.get_groups(_dir())


@router.post("/watchlist/groups")
def create_group(body: GroupName) -> Dict[str, Any]:
    """新建分组，返回新建对象 + 完整列表。"""
    g = svc.add_group(_dir(), body.name)
    return {"group": g, "groups": svc.get_groups(_dir())}


@router.delete("/watchlist/groups/{group_id}")
def delete_group(group_id: str) -> List[Dict[str, Any]]:
    """删除分组（保留至少一个）。"""
    return svc.remove_group(_dir(), group_id)


@router.patch("/watchlist/groups/{group_id}")
def rename_group(group_id: str, body: GroupName) -> List[Dict[str, Any]]:
    """重命名分组。"""
    return svc.rename_group(_dir(), group_id, body.name)


@router.post("/watchlist/groups/{group_id}/stocks")
def add_stock(group_id: str, body: StockIn) -> List[Dict[str, Any]]:
    """向分组添加一只股票（去重）。"""
    return svc.add_stock(_dir(), group_id, body.code, body.name)


@router.delete("/watchlist/groups/{group_id}/stocks/{code}")
def remove_stock(group_id: str, code: str) -> List[Dict[str, Any]]:
    """从分组移除一只股票。"""
    return svc.remove_stock(_dir(), group_id, code)


@router.post("/watchlist/groups/{group_id}/toggle")
def toggle_stock(group_id: str, body: StockIn) -> List[Dict[str, Any]]:
    """在分组内切换一只股票的归属（有则删、无则加）。"""
    return svc.toggle_stock(_dir(), group_id, body.code, body.name)


@router.post("/watchlist/import")
def import_watchlist(body: ImportBody) -> List[Dict[str, Any]]:
    """整体替换分组（用于从浏览器 localStorage 一次性迁移）。"""
    return svc.import_groups(_dir(), body.groups)
