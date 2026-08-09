"""结构化 JSON 日志 + request id 中间件。"""
import contextvars
import json
import logging
import sys
import time
import uuid

request_id_var = contextvars.ContextVar("request_id", default="")


class JSONFormatter(logging.Formatter):
    def format(self, record):
        log = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        rid = getattr(record, "request_id", "") or request_id_var.get()
        if rid:
            log["request_id"] = rid
        return json.dumps(log, ensure_ascii=False)


class RequestIDFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id_var.get()
        return True


def setup_logging(level: str = "INFO"):
    logger = logging.getLogger()
    logger.setLevel(level)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
        handler.addFilter(RequestIDFilter())
        logger.addHandler(handler)
    return logger


class RequestIDMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        rid = (dict(scope.get("headers", {})).get(b"x-request-id") or b"").decode() or uuid.uuid4().hex[:8]
        request_id_var.set(rid)
        try:
            await self.app(scope, receive, send)
        finally:
            request_id_var.set("")
