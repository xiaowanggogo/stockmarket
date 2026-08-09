"""market_data 包级配置常量。"""
import os

# SQLite 数据库文件名（保存在 data 目录内）
DB_NAME = "market_data.db"

# 默认本地数据目录：当前工作路径下的 data 文件夹
DEFAULT_DATA_DIR = os.path.join(os.getcwd(), "data")

# 故障切换顺序：腾讯证券 -> 东方财富 -> 新浪财经
DEFAULT_SOURCE_ORDER = ["tencent", "eastmoney", "sina"]

# 统一后的数据列顺序
UNIFIED_COLUMNS = ["date", "open", "close", "high", "low", "volume", "amount", "turnover"]

# 诊断日志文件名
LOG_FILE_NAME = "market_data.log"
