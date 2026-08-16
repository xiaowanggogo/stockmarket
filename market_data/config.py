"""market_data 包级配置常量。"""
import os

# SQLite 数据库文件名（保存在 data 目录内）
DB_NAME = "market_data.db"

# 默认本地数据目录：当前工作路径下的 data 文件夹
DEFAULT_DATA_DIR = os.path.join(os.getcwd(), "data")

# 故障切换顺序：腾讯证券 -> 东方财富 -> 新浪财经
DEFAULT_SOURCE_ORDER = ["tencent", "eastmoney", "sina"]

# 统一后的日线数据列顺序
UNIFIED_COLUMNS = ["date", "open", "close", "high", "low", "volume", "amount", "turnover"]

# 统一后的分时数据列顺序
MINUTE_COLUMNS = ["date", "open", "close", "high", "low", "volume", "amount"]

# 统一后的公司信息列顺序
# 板块统一为一个合并字段 boards（行业+概念+地域+风格，不区分）；
# industry_board 保留主行业、concept_boards 保留非行业板块，向下兼容旧前端。
# 已移除无免费源可稳定获取的三个字段：pe_static / dividend_yield_dynamic / dividend_yield_static。
# data_sources：标注本次实际成功的数据源（用于前端展示与诊断）。
INFO_COLUMNS = [
    "name", "code", "current_price",
    "market_cap", "circ_market_cap",
    "pe_dynamic", "pe_ttm", "pb",
    "dividend_yield_ttm",
    "relative_valuation",
    "industry_board", "concept_boards", "boards",
    "target_price", "latest_rating", "rating_date",
    "hk_code", "hk_name", "hk_price",
    "data_sources",
]

# 诊断日志文件名
LOG_FILE_NAME = "market_data.log"
