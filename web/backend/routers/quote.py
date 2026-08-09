"""行情查询路由。"""
from fastapi import APIRouter, Query

from ..config import get_settings
from ..errors import UpstreamError, ValidationError
from ..services import market, stock_universe

router = APIRouter()

_ALLOW_ADJUST = {"", "qfq", "hfq"}


@router.get("/quote/history")
def quote_history(
    code: str = Query(..., min_length=1),
    start: str = Query(..., min_length=6),
    end: str = Query(..., min_length=6),
    adjust: str = Query("qfq"),
):
    """查询历史日线（默认前复权 qfq），返回原始 OHLCV。"""
    if adjust not in _ALLOW_ADJUST:
        raise ValidationError(f"adjust 仅支持 {sorted(_ALLOW_ADJUST)}")
    if len(start.replace("-", "")) != 8 or len(end.replace("-", "")) != 8:
        raise ValidationError("start/end 需为 YYYYMMDD 或 YYYY-MM-DD")

    name = stock_universe.resolve_name(code, get_settings().stock_cache_file)
    try:
        result = market.get_history(
            code,
            start,
            end,
            adjust=adjust,
            data_dir=get_settings().backend_data_dir,
        )
    except Exception as e:  # noqa: BLE001
        raise UpstreamError(f"行情获取失败: {e}")
    result["name"] = name
    return result
