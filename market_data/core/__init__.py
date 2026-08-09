"""核心子包入口。"""
from . import normalize
from .logging_setup import setup_logger

__all__ = ["normalize", "setup_logger"]
