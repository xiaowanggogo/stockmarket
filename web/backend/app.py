"""FastAPI 应用入口（纯 JSON API，前端由 Next.js 独立提供）。

- 所有业务接口挂在 /api 下；/health 用于探活。
- market_data 位于仓库根目录，启动时加入 sys.path，保持其后端独立。
- 前端（Next.js）通过 next.config 的 rewrites 将 /api 反向代理到本服务，
  因此浏览器侧为同源访问，无需依赖 CORS（此处仍放开以便独立调试）。
"""
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 让 market_data（仓库根目录下的包）可被导入
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_WEB_DIR = os.path.dirname(_BACKEND_DIR)
_REPO_ROOT = os.path.dirname(_WEB_DIR)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from .config import get_settings  # noqa: E402
from .errors import register_error_handlers  # noqa: E402
from .logging_setup import RequestIDMiddleware, setup_logging  # noqa: E402
from .routers import quote, stock  # noqa: E402
from .services import stock_universe  # noqa: E402

settings = get_settings()
setup_logging(settings.log_level)

app = FastAPI(title="market_data web", version="0.1.0")

app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stock.router, prefix="/api")
app.include_router(quote.router, prefix="/api")
register_error_handlers(app)


@app.get("/health")
def health():
    return {"status": "ok", "universe": len(stock_universe.get_index())}


# 启动即加载股票 Universe（首次会抓取并缓存，失败则回退内置样本）
try:
    stock_universe.ensure_loaded(settings.stock_cache_file)
except Exception as e:  # noqa: BLE001
    setup_logging().warning(f"初始化股票 Universe 失败: {e}")
