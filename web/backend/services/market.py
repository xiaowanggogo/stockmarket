"""行情服务：封装 market_data 的 stock_data/stock_status/stock_info。

技术指标（MA/MACD 等）一律放前端计算，保证后端接口稳定、可扩展。
"""
import math
from typing import Optional

from market_data import stock_data as _md_stock_data
from market_data import stock_status as _md_stock_status
from market_data import stock_info as _md_stock_info


def _clean(value):
    """将 NaN/Inf 转为 None，保证 JSON 可序列化（如新浪接口无成交额 amount）。"""
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def get_history(
    code: str,
    start: str,
    end: str,
    adjust: str = "qfq",
    data_dir: Optional[str] = None,
    source_order: Optional[list] = None,
) -> dict:
    """返回统一结构：
    {
      "code", "adjust", "start", "end", "count",
      "data": [ {date,open,close,high,low,volume,amount,turnover}, ... ]
    }
    """
    df = _md_stock_data(
        code,
        start,
        end,
        adjust=adjust,
        data_dir=data_dir,
        source_order=source_order,
    )
    records = df.to_dict(orient="records")
    for r in records:
        for k, v in r.items():
            r[k] = _clean(v)
    return {
        "code": code,
        "adjust": adjust,
        "start": start,
        "end": end,
        "count": int(len(df)),
        "data": records,
    }


def get_status(
    code: str,
    period: str = "1",
    adjust: str = "qfq",
    data_dir: Optional[str] = None,
) -> dict:
    """返回最近一个交易日的分时数据：
    { "code", "period", "adjust", "count", "data": [{date,open,close,high,low,volume,amount}, ...] }
    """
    df = _md_stock_status(code, period=period, adjust=adjust, data_dir=data_dir)
    records = df.to_dict(orient="records")
    for r in records:
        for k, v in r.items():
            r[k] = _clean(v)
    return {
        "code": code,
        "period": period,
        "adjust": adjust,
        "count": int(len(df)),
        "data": records,
    }


def get_info(code: str, data_dir: Optional[str] = None) -> dict:
    """返回股票及公司信息：
    { name, code, market_cap, circ_market_cap, pe_*, dividend_yield_*, relative_valuation, ... }
    """
    df = _md_stock_info(code, data_dir=data_dir)
    if df.empty:
        return {"code": code}
    info = df.iloc[0].to_dict()
    for k, v in info.items():
        info[k] = _clean(v)
    return info
