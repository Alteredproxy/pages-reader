import asyncio
import os
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path
from typing import TypeVar

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

T = TypeVar("T")

_TRANSIENT_EXC: tuple[type[BaseException], ...] = (
    OSError,
    httpx.RequestError,
    ConnectionError,
    TimeoutError,
)


@lru_cache
def get_supabase() -> Client:
    supabase_url = os.environ["SUPABASE_URL"]
    service_role_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(supabase_url, service_role_key)


async def run_threaded_with_retry(
    call: Callable[[], T],
    *,
    attempts: int = 4,
    base_backoff: float = 0.5,
) -> T:
    """Run a blocking call in the threadpool, retrying transient network errors."""
    last_err: BaseException | None = None
    for attempt in range(attempts):
        try:
            return await asyncio.to_thread(call)
        except _TRANSIENT_EXC as exc:
            last_err = exc
            if attempt < attempts - 1:
                await asyncio.sleep(base_backoff * (2**attempt))
        except Exception:
            raise
    if last_err is not None:
        raise last_err
    raise RuntimeError("run_threaded_with_retry called with no attempts")
