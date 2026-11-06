import pytest
from fastapi.testclient import TestClient

from app.main import create_app

TOKEN = "a" * 64
HEADERS = {"Origin": "thing://app", "X-Thing-Token": TOKEN}


def test_authenticated_health() -> None:
    with TestClient(create_app(TOKEN)) as client:
        result = client.get("/health", headers=HEADERS)
        assert result.status_code == 200
        assert result.json() == {"status": "ok", "version": "0.15.0"}


@pytest.mark.parametrize("token", [None, "wrong", "b" * 64])
def test_missing_or_wrong_token_is_rejected(token: str | None) -> None:
    headers = {"Origin": "thing://app"}
    if token is not None:
        headers["X-Thing-Token"] = token
    with TestClient(create_app(TOKEN)) as client:
        assert client.get("/health", headers=headers).status_code == 401


@pytest.mark.parametrize("origin", [None, "null", "https://example.com", "thing://evil"])
def test_foreign_or_missing_origin_is_rejected(origin: str | None) -> None:
    headers = {"X-Thing-Token": TOKEN}
    if origin is not None:
        headers["Origin"] = origin
    with TestClient(create_app(TOKEN)) as client:
        assert client.get("/health", headers=headers).status_code == 403


@pytest.mark.parametrize("route", ["/docs", "/redoc", "/openapi.json", "/../secret"])
def test_no_documentation_or_file_access(route: str) -> None:
    with TestClient(create_app(TOKEN)) as client:
        assert client.get(route, headers=HEADERS).status_code == 404


def test_bodies_and_unsupported_methods_rejected() -> None:
    with TestClient(create_app(TOKEN)) as client:
        assert client.post("/health", headers=HEADERS, content=b"x" * 10000).status_code == 413
        assert client.post("/health", headers=HEADERS).status_code == 405
        assert (
            client.get("/health", headers={**HEADERS, "Transfer-Encoding": "chunked"}).status_code
            == 413
        )


def test_rate_limit_is_enforced() -> None:
    with TestClient(create_app(TOKEN, rate_limit=2)) as client:
        assert client.get("/health", headers=HEADERS).status_code == 200
        assert client.get("/health", headers=HEADERS).status_code == 200
        assert client.get("/health", headers=HEADERS).status_code == 429


def test_invalid_configuration_fails_closed() -> None:
    with pytest.raises(ValueError):
        create_app("short")
