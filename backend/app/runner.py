"""Run one backend, attached to its parent by a private stdin pipe."""

import json
import socket
import sys
import threading
from pathlib import Path

import uvicorn
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.main import create_app


class LaunchConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    token: str = Field(pattern=r"^[0-9a-f]{64}$")
    data_root: str | None = Field(default=None, max_length=4096)


def main() -> int:
    try:
        line = sys.stdin.buffer.readline(16385)
        if len(line) > 16384 or not line.endswith(b"\n"):
            return 2
        launch = LaunchConfig.model_validate_json(line)
    except (OSError, ValidationError, ValueError):
        return 2

    # Keep ownership of the port: never choose it by binding, closing, then reopening.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        try:
            if sys.platform == "win32":
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            listener.bind(("127.0.0.1", 0))
            listener.listen(32)
            listener.setblocking(False)
            config = uvicorn.Config(
                create_app(
                    launch.token, data_root=Path(launch.data_root) if launch.data_root else None
                ),
                access_log=False,
                log_config=None,
                log_level="critical",
                server_header=False,
                proxy_headers=False,
                timeout_graceful_shutdown=2,
                limit_concurrency=16,
                h11_max_incomplete_event_size=8192,
            )
            server = uvicorn.Server(config)

            def watch_parent() -> None:
                try:
                    # A shutdown message or EOF (including a crashed shell) ends the server.
                    sys.stdin.buffer.readline(128)
                except OSError:
                    pass  # A broken pipe means the parent has gone away.
                finally:
                    server.should_exit = True

            threading.Thread(target=watch_parent, daemon=True).start()
            print(json.dumps({"port": listener.getsockname()[1]}), flush=True)
            server.run(sockets=[listener])
            return 0
        except (OSError, RuntimeError):
            print("BACKEND_START_FAILED", file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
