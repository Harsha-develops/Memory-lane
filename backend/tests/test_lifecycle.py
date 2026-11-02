import json
import queue
import secrets
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

import pytest

BACKEND = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("shutdown", ["message", "parent_eof"])
def test_real_backend_starts_and_exits_with_parent(shutdown: str) -> None:
    child = subprocess.Popen(
        [sys.executable, "-m", "app.runner"],
        cwd=BACKEND,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    assert child.stdin and child.stdout
    token = secrets.token_hex(32)
    try:
        child.stdin.write(json.dumps({"token": token}) + "\n")
        child.stdin.flush()
        messages: queue.Queue[str] = queue.Queue()
        threading.Thread(target=lambda: messages.put(child.stdout.readline()), daemon=True).start()
        handshake = json.loads(messages.get(timeout=10))
        assert 0 < handshake["port"] < 65536
        request = Request(
            f"http://127.0.0.1:{handshake['port']}/health",
            headers={"Origin": "thing://app", "X-Thing-Token": token},
        )
        deadline = time.monotonic() + 10
        while True:
            try:
                with urlopen(request, timeout=1) as response:
                    assert json.load(response)["status"] == "ok"
                break
            except (URLError, TimeoutError):
                if time.monotonic() > deadline:
                    pytest.fail("Backend did not become ready")
                time.sleep(0.05)
        if shutdown == "message":
            child.stdin.write("shutdown\n")
            child.stdin.flush()
        else:
            child.stdin.close()
        assert child.wait(timeout=6) == 0
    finally:
        if child.poll() is None:
            child.kill()
            child.wait(timeout=5)


@pytest.mark.parametrize("config", [{"token": "short"}, {"token": "a" * 64, "extra": True}])
def test_invalid_handshake_does_not_start_server(config: dict[str, object]) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "app.runner"],
        cwd=BACKEND,
        input=json.dumps(config) + "\n",
        capture_output=True,
        text=True,
        timeout=10,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    assert result.returncode == 2
    assert result.stdout == ""
