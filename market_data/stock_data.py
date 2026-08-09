"""market_data 主接口：stock_data。

设计要点：
  1. 本地优先：先查 SQLite，命中部分/全部则避免重复远程请求。
  2. 最小补数：远程只拉取请求区间数据，仅将本地缺失的交易日写入库。
  3. 故障切换：腾讯证券 -> 东方财富 -> 新浪财经，任一可用即用。
  4. 诊断日志：console + data/market_data.log，全程记录关键步骤与异常。
"""
import os

import pandas as pd

from .config import DEFAULT_DATA_DIR, DEFAULT_SOURCE_ORDER, LOG_FILE_NAME, UNIFIED_COLUMNS
from .core.logging_setup import setup_logger
from .core.normalize import normalize_date, normalize_stock
from .sources import eastmoney, sina, tencent
from .storage.sqlite_store import SQLiteStore

# 数据源名称 -> 对应子模块（调用时再取 .fetch，便于运行时替换/扩展）
_SOURCE_MODS = {
    "tencent": tencent,
    "eastmoney": eastmoney,
    "sina": sina,
}


class MarketDataError(Exception):
    """所有数据源均不可用或参数非法时抛出。"""


def stock_data(
    stock,
    start_date,
    end_date,
    adjust="qfq",
    data_dir=None,
    source_order=None,
):
    """查询 A 股历史行情，返回统一格式的 pandas.DataFrame。

    参数
    ----
    stock : str
        股票代码，如 '600519' / 'sh600519' / '600519.SH'（自动补充/截断为 6 位）。
    start_date, end_date : str
        查询区间（含端点），支持 '20230101' 或 '2023-01-01'。
    adjust : str, 默认 'qfq'
        复权方式：'' 不复权 / 'qfq' 前复权 / 'hfq' 后复权。
    data_dir : str, 可选
        本地数据目录，默认当前路径下的 ./data。
    source_order : list[str], 可选
        自定义故障切换顺序，默认 ['tencent','eastmoney','sina']。

    返回
    ----
    pandas.DataFrame
        列固定为 date, open, close, high, low, volume, amount, turnover；
        无任何数据时返回空 DataFrame（含这些列）。
    """
    data_dir = data_dir or DEFAULT_DATA_DIR
    source_order = source_order or DEFAULT_SOURCE_ORDER
    logger = setup_logger(data_dir, log_file=os.path.join(data_dir, LOG_FILE_NAME))

    start_md, start_api = normalize_date(start_date)
    end_md, end_api = normalize_date(end_date)
    code, exchange, em_sym, tx_sym = normalize_stock(stock)
    logger.info(
        f"查询请求: code={code} exchange={exchange} adjust='{adjust}' "
        f"range=[{start_md} ~ {end_md}] sources={source_order}"
    )

    store = SQLiteStore(data_dir)

    # 1) 本地优先查询
    local_df = store.query(code, adjust, start_md, end_md)
    local_dates = set(local_df["date"]) if not local_df.empty else set()
    logger.info(f"本地缓存命中 {len(local_dates)} 条（{'完全覆盖' if local_dates else '无'}）")

    # 2) 远程拉取 + 故障切换
    try:
        remote_df, used = _fetch_with_failover(
            source_order, em_sym, tx_sym, start_api, end_api, adjust, logger
        )
    except MarketDataError as e:
        logger.error(f"所有数据源均不可用: {e}")
        remote_df, used = None, None

    # 3) 合并本地与远程，并将缺失部分写回本地
    if remote_df is None or remote_df.empty:
        logger.warning("远程无数据，回退到本地已有数据（如有）")
        combined = local_df
    else:
        if local_dates:
            missing = remote_df[~remote_df["date"].isin(local_dates)]
            if not missing.empty:
                n = store.insert(missing, code, adjust, used)
                logger.info(f"补全本地缺失 {n} 条（source={used}）")
            combined = pd.concat([local_df, missing], ignore_index=True)
        else:
            n = store.insert(remote_df, code, adjust, used)
            logger.info(f"首次写入本地 {n} 条（source={used}）")
            combined = remote_df

    if combined is None or combined.empty:
        logger.warning("未获取到任何数据，返回空 DataFrame")
        return pd.DataFrame(columns=UNIFIED_COLUMNS)

    combined = combined[
        (combined["date"] >= start_md) & (combined["date"] <= end_md)
    ].sort_values("date").reset_index(drop=True)
    result = combined[UNIFIED_COLUMNS].copy()
    logger.info(f"返回 {len(result)} 条数据")
    return result


def _fetch_with_failover(source_order, em_sym, tx_sym, start_api, end_api, adjust, logger):
    """按 source_order 依次尝试数据源，成功即返回 (df, source_name)。"""
    last_err = None
    for name in source_order:
        mod = _SOURCE_MODS.get(name)
        if mod is None:
            logger.warning(f"未知数据源: {name}，跳过")
            continue
        fn = mod.fetch
        if fn is None:
            logger.warning(f"未知数据源: {name}，跳过")
            continue
        symbol = tx_sym if name != "eastmoney" else em_sym
        try:
            logger.info(f"尝试数据源: {name}（symbol={symbol}）")
            df = fn(symbol, start_api, end_api, adjust)
            if df is not None and not df.empty:
                logger.info(f"数据源 {name} 成功，返回 {len(df)} 条")
                return df, name
            logger.warning(f"数据源 {name} 返回空数据")
        except Exception as e:  # noqa: BLE001 - 故障切换需捕获一切异常
            logger.warning(f"数据源 {name} 失败: {type(e).__name__}: {e}")
            last_err = e
    raise MarketDataError(f"全部数据源失败，最后错误: {last_err}")
