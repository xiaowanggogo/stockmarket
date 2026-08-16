"""market_data 分时接口：stock_status。

查询指定股票最近一个交易日的分时数据，支持多数据源故障切换。
"""
import os

import pandas as pd

from .config import DEFAULT_DATA_DIR, LOG_FILE_NAME, MINUTE_COLUMNS
from .core.logging_setup import setup_logger
from .core.normalize import normalize_stock
from .sources import minute as minute_src
from .stock_data import MarketDataError

# 分时数据源故障切换顺序：东财(有成交额) -> 新浪(无成交额)
_DEFAULT_MINUTE_SOURCES = ["eastmoney", "sina"]


def stock_status(
    symbol,
    period="1",
    adjust="qfq",
    data_dir=None,
    source_order=None,
):
    """查询最近一个交易日的分时数据，返回统一格式的 DataFrame。

    参数
    ----
    symbol : str
        股票代码，如 '600519' / 'sh600519'（自动补/截为 6 位）。
    period : str, 默认 '1'
        频率：'1' / '5' / '15' / '30' / '60' 分钟。
    adjust : str, 默认 'qfq'
        复权方式：'' 不复权 / 'qfq' 前复权 / 'hfq' 后复权。
    data_dir : str, 可选
        本地数据目录（用于日志），默认当前路径下的 ./data。
    source_order : list[str], 可选
        自定义故障切换顺序，默认 ['eastmoney', 'sina']。

    返回
    ----
    pandas.DataFrame
        列固定为 date, open, close, high, low, volume, amount；
        date 精确到分钟（YYYY-MM-DD HH:MM:SS）；
        无数据时返回空 DataFrame（含这些列）。
    """
    data_dir = data_dir or DEFAULT_DATA_DIR
    source_order = source_order or _DEFAULT_MINUTE_SOURCES
    logger = setup_logger(data_dir, log_file=os.path.join(data_dir, LOG_FILE_NAME))

    code, exchange, em_sym, tx_sym = normalize_stock(symbol)
    logger.info(
        f"分时查询: code={code} period={period} adjust='{adjust}' sources={source_order}"
    )

    last_err = None
    for name in source_order:
        try:
            if name == "eastmoney":
                df = minute_src.fetch_em(em_sym, period, adjust)
            elif name == "sina":
                df = minute_src.fetch_sina(tx_sym, period, adjust)
            else:
                logger.warning(f"未知分时数据源: {name}，跳过")
                continue

            if df is not None and not df.empty:
                df = minute_src.filter_latest_trading_day(df)
                if not df.empty:
                    logger.info(f"分时数据源 {name} 成功，返回 {len(df)} 条")
                    return df[MINUTE_COLUMNS]
                logger.warning(f"数据源 {name} 过滤最近交易日后为空")
            else:
                logger.warning(f"数据源 {name} 返回空数据")
        except Exception as e:  # noqa: BLE001
            logger.warning(f"分时数据源 {name} 失败: {type(e).__name__}: {e}")
            last_err = e

    logger.error(f"全部分时数据源失败: {last_err}")
    return pd.DataFrame(columns=MINUTE_COLUMNS)
