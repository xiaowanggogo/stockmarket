"""类型化错误层级 + 全局处理。"""
from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, message: str, status_code: int = 400, code: str = "bad_request"):
        self.message = message
        self.status_code = status_code
        self.code = code


class NotFoundError(AppError):
    def __init__(self, message: str = "未找到资源"):
        super().__init__(message, 404, "not_found")


class UpstreamError(AppError):
    def __init__(self, message: str = "上游数据获取失败"):
        super().__init__(message, 502, "upstream_error")


class ValidationError(AppError):
    def __init__(self, message: str = "参数校验失败"):
        super().__init__(message, 422, "validation_error")


def register_error_handlers(app):
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal_error", "message": str(exc)}},
        )
