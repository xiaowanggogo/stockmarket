"""SQLite 本地存储：按股票代码 + 复权方式 + 日期 缓存历史行情。"""
import os
import sqlite3

import pandas as pd

from ..config import DB_NAME


class SQLiteStore:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)
        self.db_path = os.path.join(data_dir, DB_NAME)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS stock_daily (
                    stock    TEXT NOT NULL,
                    adjust   TEXT NOT NULL,
                    date     TEXT NOT NULL,
                    open     REAL,
                    close    REAL,
                    high     REAL,
                    low      REAL,
                    volume   REAL,
                    amount   REAL,
                    turnover REAL,
                    source   TEXT,
                    PRIMARY KEY (stock, adjust, date)
                )
                """
            )
            conn.commit()

    def query(self, stock, adjust, start_date, end_date):
        """按股票/复权/日期区间查询本地已缓存数据，返回统一列 DataFrame。"""
        with sqlite3.connect(self.db_path) as conn:
            df = pd.read_sql_query(
                """
                SELECT date, open, close, high, low, volume, amount, turnover, source
                FROM stock_daily
                WHERE stock=? AND adjust=? AND date>=? AND date<=?
                ORDER BY date
                """,
                conn,
                params=(stock, adjust, start_date, end_date),
            )
        return df

    def insert(self, df, stock, adjust, source):
        """将统一格式的 DataFrame 写入本地（已存在的主键自动忽略）。

        返回实际新写入的行数。
        """
        if df is None or df.empty:
            return 0
        cols = ["date", "open", "close", "high", "low", "volume", "amount", "turnover"]
        rec = df[cols].copy()
        rec["stock"] = stock
        rec["adjust"] = adjust
        rec["source"] = source
        rows = [tuple(r) for r in rec.itertuples(index=False, name=None)]
        sql = (
            "INSERT OR IGNORE INTO stock_daily "
            "(date,open,close,high,low,volume,amount,turnover,stock,adjust,source) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)"
        )
        with sqlite3.connect(self.db_path) as conn:
            conn.executemany(sql, rows)
            conn.commit()
        return len(rows)
