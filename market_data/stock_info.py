"""market_data 公司信息接口：stock_info。

查询股票对应的公司基本信息与估值指标。
"""
import os

import pandas as pd

from .config import DEFAULT_DATA_DIR, INFO_COLUMNS, LOG_FILE_NAME
from .core.logging_setup import setup_logger
from .core.normalize import normalize_stock
from .sources import info as info_src


def stock_info(symbol, data_dir=None):
    """查询股票及公司信息，返回单行 DataFrame。

    参数
    ----
    symbol : str
        股票代码，如 '600519' / 'sh600519'（自动补/截为 6 位）。
    data_dir : str, 可选
        本地数据目录（用于日志），默认当前路径下的 ./data。

    返回
    ----
    pandas.DataFrame
        单行，列见 market_data.config.INFO_COLUMNS（含市值/市盈率/股息率/
        板块 boards/目标价 target_price/最新评级 latest_rating/评级日期 rating_date 等）。
    """
    data_dir = data_dir or DEFAULT_DATA_DIR
    logger = setup_logger(data_dir, log_file=os.path.join(data_dir, LOG_FILE_NAME))

    code, exchange, em_sym, _ = normalize_stock(symbol)
    logger.info(f"公司信息查询: code={code}")

    try:
        df = info_src.fetch_info(code, exchange)
        if df is not None and not df.empty:
            logger.info(f"公司信息获取成功: {df.iloc[0].get('name', '')} ({code})")
            return df[INFO_COLUMNS]
    except Exception as e:  # noqa: BLE001
        logger.error(f"公司信息获取失败: {type(e).__name__}: {e}")

    return pd.DataFrame(columns=INFO_COLUMNS)
