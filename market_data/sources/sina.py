"""新浪财经数据源适配器。"""
from .common import to_unified_sina


def fetch(symbol, start_date, end_date, adjust):
    """调用 akshare.stock_zh_a_daily，返回统一格式的 DataFrame。"""
    import akshare as ak

    df = ak.stock_zh_a_daily(
        symbol=symbol,
        start_date=start_date,
        end_date=end_date,
        adjust=adjust,
    )
    return to_unified_sina(df)
