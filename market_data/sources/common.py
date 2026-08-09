"""将各数据源返回的原始 DataFrame 转换为统一格式。

统一列：date, open, close, high, low, volume, amount, turnover
"""
import pandas as pd


def to_unified_em_tx(df):
    """东方财富 / 腾讯证券：原始列为中文（日期,开盘,收盘,最高,最低,成交量,成交额,换手率...）。"""
    out = pd.DataFrame()
    out["date"] = pd.to_datetime(df["日期"]).dt.strftime("%Y-%m-%d")
    out["open"] = pd.to_numeric(df["开盘"], errors="coerce")
    out["close"] = pd.to_numeric(df["收盘"], errors="coerce")
    out["high"] = pd.to_numeric(df["最高"], errors="coerce")
    out["low"] = pd.to_numeric(df["最低"], errors="coerce")
    out["volume"] = pd.to_numeric(df["成交量"], errors="coerce")
    out["amount"] = pd.to_numeric(df["成交额"], errors="coerce")
    out["turnover"] = pd.to_numeric(df["换手率"], errors="coerce")
    return out


def to_unified_sina(df):
    """新浪财经：原始列为英文（date,open,high,low,close,volume,...,turnover）。

    注意：新浪接口不提供成交额(amount)，统一填充为 NaN。
    """
    out = pd.DataFrame()
    out["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    out["open"] = pd.to_numeric(df["open"], errors="coerce")
    out["close"] = pd.to_numeric(df["close"], errors="coerce")
    out["high"] = pd.to_numeric(df["high"], errors="coerce")
    out["low"] = pd.to_numeric(df["low"], errors="coerce")
    out["volume"] = pd.to_numeric(df["volume"], errors="coerce")
    out["amount"] = float("nan")  # 新浪接口无成交额字段
    out["turnover"] = pd.to_numeric(df["turnover"], errors="coerce")
    return out
