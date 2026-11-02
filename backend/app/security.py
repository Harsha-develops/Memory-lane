"""Token/Origin checks and bounded request bodies before routing."""

import secrets
import time
from collections import deque

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.storage import MAX_FILE

APP_ORIGIN = "thing://app"


class BodyTooLarge(Exception):
    pass


class LocalOnlyMiddleware:
    def __init__(self, app: ASGIApp, token: str, rate_limit: int = 1200) -> None:
        self.app = app
        self.token = token.encode("ascii")
        self.rate_limit = rate_limit
        self.requests: deque[float] = deque()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        status, message = 0, ""
        upload = scope["method"] == "PUT" and scope["path"].startswith("/uploads/")
        limit = (
            MAX_FILE
            if upload
            else (65536 if scope["method"] == "POST" and scope["path"] != "/health" else 0)
        )
        try:
            size = int(headers.get(b"content-length", b"0"))
        except ValueError:
            size = -1
        if headers.get(b"origin") != APP_ORIGIN.encode():
            status, message = 403, "This request is not allowed."
        elif not secrets.compare_digest(headers.get(b"x-thing-token", b""), self.token):
            status, message = 401, "Authentication required."
        elif headers.get(b"transfer-encoding") or size < 0 or size > limit:
            status, message = 413, "This request exceeds the allowed size."
        elif scope["path"] == "/health" and scope["method"] != "GET":
            status, message = 405, "This action is not available."
        else:
            now = time.monotonic()
            while self.requests and self.requests[0] <= now - 60:
                self.requests.popleft()
            if len(self.requests) >= self.rate_limit:
                status, message = 429, "Please wait before trying again."
            else:
                self.requests.append(now)
        if status:
            await JSONResponse({"detail": message}, status_code=status)(scope, receive, send)
            return
        received = 0

        async def bounded_receive() -> dict:
            nonlocal received
            packet = await receive()
            received += len(packet.get("body", b""))
            if received > limit or received > size:
                raise BodyTooLarge()
            return packet

        try:
            await self.app(scope, bounded_receive, send)
        except BodyTooLarge:
            await JSONResponse(
                {"detail": "This request exceeds the allowed size."}, status_code=413
            )(scope, receive, send)
