"""诊断日志配置：同时输出到控制台与 data 目录下的日志文件，便于问题定位。"""
import logging
import os


def setup_logger(data_dir, level=logging.INFO, log_file=None):
    """获取（并仅首次配置）名为 market_data 的 logger。

    返回已配置好的 logger；重复调用不会叠加 handler。
    """
    logger = logging.getLogger("market_data")
    if logger.handlers:
        return logger

    logger.setLevel(level)
    logger.propagate = False

    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    if log_file:
        try:
            os.makedirs(data_dir, exist_ok=True)
            fh = logging.FileHandler(log_file, encoding="utf-8")
            fh.setFormatter(fmt)
            logger.addHandler(fh)
        except Exception:
            # 日志文件不可写不应阻断主流程
            pass

    return logger
