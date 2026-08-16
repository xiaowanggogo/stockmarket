"""分时数据源适配器（东方财富 + 新浪）。

兼容 akshare 的 stock_zh_a_hist_min_em（东财）和 stock_zh_a_minute（新浪）。
统一列：date, open, close, high, low, volume, amount
"""
import pandas as pd


def fetch_em(symbol, period, adjust):
    """东方财富：ak.stock_zh_a_hist_min_em。

    symbol: 纯 6 位代码（如 '600519'）
    period: '1'/'5'/'15'/'30'/'60'
    返回统一格式 DataFrame。
    """
    import akshare as ak

    df = ak.stock_zh_a_hist_min_em(symbol=symbol, period=period, adjust=adjust)
    out = pd.DataFrame()
    out["date"] = pd.to_datetime(df["时间"]).dt.strftime("%Y-%m-%d %H:%M:%S")
    out["open"] = pd.to_numeric(df["开盘"], errors="coerce")
    out["close"] = pd.to_numeric(df["收盘"], errors="coerce")
    out["high"] = pd.to_numeric(df["最高"], errors="coerce")
    out["low"] = pd.to_numeric(df["最低"], errors="coerce")
    out["volume"] = pd.to_numeric(df["成交量"], errors="coerce")
    out["amount"] = pd.to_numeric(df["成交额"], errors="coerce")
    return out


def fetch_sina(symbol, period, adjust):
    """新浪：ak.stock_zh_a_minute。

    symbol: 带交易所前缀（如 'sh600519'）
    period: '1'/'5'/'15'/'30'/'60'
    注意：新浪不提供成交额，amount 填 NaN。
    """
    import akshare as ak

    df = ak.stock_zh_a_minute(symbol=symbol, period=period, adjust=adjust)
    out = pd.DataFrame()
    out["date"] = pd.to_datetime(df["day"]).dt.strftime("%Y-%m-%d %H:%M:%S")
    out["open"] = pd.to_numeric(df["open"], errors="coerce")
    out["close"] = pd.to_numeric(df["close"], errors="coerce")
    out["high"] = pd.to_numeric(df["high"], errors="coerce")
    out["low"] = pd.to_numeric(df["low"], errors="coerce")
    out["volume"] = pd.to_numeric(df["volume"], errors="coerce")
    out["amount"] = float("nan")
    return out


def filter_latest_trading_day(df):
    """只保留最近一个交易日的分时数据。

    如果今天是交易日且有分时数据则返回今天的，否则返回数据中最新交易日的。
    """
    if df is None or df.empty:
        return df
    dates = pd.to_datetime(df["date"]).dt.date
    latest = dates.max()
    return df[dates == latest].reset_index(drop=True)
