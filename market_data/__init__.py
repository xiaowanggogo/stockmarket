"""market_data —— 基于 AKShare 的 A 股历史行情查询包。

封装东方财富 / 腾讯证券 / 新浪财经三个数据源，提供统一的 stock_data 接口，
支持本地 SQLite 缓存、最小化补全、故障切换与诊断日志。

快速示例
--------
    from market_data import stock_data

    df = stock_data("600519", "20230101", "20231231", adjust="qfq")
    print(df.head())

    # 指定数据源顺序（故障切换）
    df = stock_data("000001", "20230101", "20230131",
                    source_order=["eastmoney", "sina", "tencent"])
"""
from .stock_data import MarketDataError, stock_data

__version__ = "0.1.0"
__all__ = ["stock_data", "MarketDataError"]
