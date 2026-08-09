"""日期与股票代码归一化工具。"""
import re


def normalize_date(value):
    """将各种常见日期格式统一为 ('YYYY-MM-DD', 'YYYYMMDD')。

    支持的输入：'20230101' / '2023-01-01' / '2023/01/01' 等。
    """
    if value is None:
        raise ValueError("日期参数不能为空")
    s = str(value).strip()
    digits = re.sub(r"\D", "", s)
    if len(digits) != 8:
        raise ValueError(f"无法识别的日期格式: {value!r}（应为 YYYYMMDD 或 YYYY-MM-DD）")
    md = f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    return md, digits


def normalize_stock(stock):
    """股票代码归一化。

    返回 (code_6digit, exchange, em_symbol, tx_sina_symbol)
      - em_symbol       : 纯 6 位数字，供东方财富接口使用
      - tx_sina_symbol  : 带交易所前缀，如 sh600519，供腾讯/新浪接口使用

    规则：
      - 自动剥离 .sh / .sz 这类 tushare 后缀
      - 若已含 sh/sz/bj 前缀则直接采用，否则根据首位数字推断交易所
      - 数字部分自动补充（不足 6 位左补 0）或截断（超过 6 位取末 6 位）
    """
    if not stock:
        raise ValueError("股票代码不能为空")
    raw = str(stock).strip().lower()
    raw = re.sub(r"\.[a-z]+$", "", raw)  # 去掉 .sh/.sz 后缀
    m = re.match(r"^([a-z]{1,2})?(\d+)", raw)
    if not m:
        raise ValueError(f"无法识别的股票代码: {stock!r}")

    prefix, digits = m.group(1), m.group(2)
    code = digits[-6:].zfill(6)  # 自动截断 / 补充为 6 位

    if prefix:
        exchange = prefix
    else:
        if code[0] in ("6", "9"):
            exchange = "sh"
        elif code[0] in ("0", "3"):
            exchange = "sz"
        elif code[0] in ("8", "4"):
            exchange = "bj"
        else:
            exchange = "sh"

    return code, exchange, code, f"{exchange}{code}"
