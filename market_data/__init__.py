"""market_data —— 基于 AKShare 的 A 股行情查询包。

封装东方财富 / 腾讯证券 / 新浪财经三个数据源，提供三个统一接口：

  - stock_data   : 日线历史行情（本地 SQLite 缓存 + 故障切换）
  - stock_status : 分时数据（最近一个交易日，兼容东财/新浪）
  - stock_info   : 股票及公司信息（市值/市盈率/股息率/行业等）

快速示例
--------
    from market_data import stock_data, stock_status, stock_info

    # 日线
    df = stock_data("600519", "20230101", "20231231", adjust="qfq")

    # 分时（最近交易日 1 分钟）
    df = stock_status("600519", period="1", adjust="qfq")

    # 公司信息
    df = stock_info("600519")
"""
from .stock_data import MarketDataError, stock_data
from .stock_status import stock_status
from .stock_info import stock_info

__version__ = "0.2.0"
__all__ = ["stock_data", "stock_status", "stock_info", "MarketDataError"]
