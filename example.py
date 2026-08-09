"""market_data 使用示例。

运行前安装依赖：
    pip install -r requirements.txt

然后：
    python example.py
"""
from market_data import stock_data

# 1) 基础用法（默认腾讯证券，自动故障切换）
df = stock_data("600519", "20230101", "20231231", adjust="qfq")
print("=== 贵州茅台 2023 年前复权日线（前若干行）===")
print(df.head())

# 2) 自定义故障切换顺序
df2 = stock_data(
    "000001", "20230101", "20230131",
    adjust="",
    source_order=["eastmoney", "sina", "tencent"],
)
print("\n=== 平安银行 2023-01 日线 ===")
print(df2.head())

# 3) 再次查询同一区间：直接命中本地 SQLite 缓存，不再请求网络
df3 = stock_data("600519", "20230101", "20231231", adjust="qfq")
print(f"\n=== 二次查询返回 {len(df3)} 行（本地缓存优先）===")

# 4) 数据默认保存在当前路径下的 data/ 目录（market_data.db + market_data.log）
print("\n数据目录：./data  日志：./data/market_data.log")
