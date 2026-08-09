"""Web 服务配置（集中管理，启动时确定）。"""
import os
from dataclasses import dataclass, field


@dataclass
class Settings:
    repo_root: str
    web_dir: str
    backend_dir: str
    frontend_dir: str
    backend_data_dir: str
    stock_cache_file: str
    default_adjust: str = "hfq"
    cors_origins: list = field(default_factory=lambda: ["*"])
    log_level: str = "INFO"
    host: str = "0.0.0.0"
    port: int = 8000


def get_settings() -> Settings:
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    web_dir = os.path.dirname(backend_dir)
    repo_root = os.path.dirname(web_dir)
    backend_data_dir = os.path.join(web_dir, "backend", "data")
    return Settings(
        repo_root=repo_root,
        web_dir=web_dir,
        backend_dir=backend_dir,
        frontend_dir=os.path.join(web_dir, "frontend"),
        backend_data_dir=backend_data_dir,
        stock_cache_file=os.path.join(backend_data_dir, "stocks.json"),
    )
