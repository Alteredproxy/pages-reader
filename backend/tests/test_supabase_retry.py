import asyncio

import httpx
import pytest

from app.db.supabase import run_threaded_with_retry


def test_retries_oserror_then_succeeds():
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise OSError("WinError 10035 simulated")
        return "ok"

    result = asyncio.run(run_threaded_with_retry(flaky, attempts=4, base_backoff=0.001))

    assert result == "ok"
    assert calls["n"] == 3


def test_retries_httpx_connect_error_then_succeeds():
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 2:
            raise httpx.ConnectError("simulated transport failure")
        return "ok"

    result = asyncio.run(run_threaded_with_retry(flaky, attempts=4, base_backoff=0.001))

    assert result == "ok"
    assert calls["n"] == 2


def test_non_transient_exception_does_not_retry():
    calls = {"n": 0}

    def boom():
        calls["n"] += 1
        raise ValueError("should not be retried")

    with pytest.raises(ValueError):
        asyncio.run(run_threaded_with_retry(boom, attempts=4, base_backoff=0.001))

    assert calls["n"] == 1


def test_transient_exhausted_raises_last_error():
    def always_fails():
        raise httpx.ReadError("persistent transport failure")

    with pytest.raises(httpx.ReadError):
        asyncio.run(run_threaded_with_retry(always_fails, attempts=3, base_backoff=0.001))
