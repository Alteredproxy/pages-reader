import asyncio
import os

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.api.documents import _error, _user_id
from app.constants import AudioStatus, GenerationStatus, TTS_CONCURRENCY_DEFAULT
from app.db.supabase import get_supabase, run_threaded_with_retry
from app.services.storage import upload_audio
from app.services.tts_service import synthesize_chunk

router = APIRouter()


class ProcessTTSRequest(BaseModel):
    voice_id: str | None = None


def _truncate_error(exc: Exception, limit: int = 500) -> str:
    return str(exc)[:limit]


def _document_for_user(supabase, doc_id: str, user_id: str) -> dict:
    docs = supabase.table("documents").select("*").eq("id", doc_id).eq("user_id", user_id).limit(1).execute().data
    if not docs:
        raise _error(404, "NOT_FOUND", "Document not found")
    return docs[0]


def _raise_if_generating(supabase, doc_id: str) -> None:
    generating = supabase.table("chunks").select("id", count="exact").eq("document_id", doc_id).eq("audio_status", AudioStatus.GENERATING).execute()
    if generating.count and generating.count > 0:
        raise _error(409, "ALREADY_PROCESSING", "TTS generation is already in progress")


def _pending_or_error_chunks(supabase, doc_id: str) -> list[dict]:
    return supabase.table("chunks").select("*").eq("document_id", doc_id).in_("audio_status", [AudioStatus.PENDING, AudioStatus.ERROR]).order("sequence_order").execute().data


def _reset_errored_chunks_to_pending(supabase, doc_id: str):
    return (
        supabase.table("chunks")
        .update({"audio_status": AudioStatus.PENDING, "last_error": None, "error_message": None})
        .eq("document_id", doc_id)
        .eq("audio_status", AudioStatus.ERROR)
        .execute()
    )


async def _document_for_user_async(supabase, doc_id: str, user_id: str) -> dict:
    return await run_threaded_with_retry(lambda: _document_for_user(supabase, doc_id, user_id))


async def _raise_if_generating_async(supabase, doc_id: str) -> None:
    await run_threaded_with_retry(lambda: _raise_if_generating(supabase, doc_id))


async def _pending_or_error_chunks_async(supabase, doc_id: str) -> list[dict]:
    return await run_threaded_with_retry(lambda: _pending_or_error_chunks(supabase, doc_id))


async def _reset_errored_chunks_to_pending_async(supabase, doc_id: str) -> None:
    await run_threaded_with_retry(lambda: _reset_errored_chunks_to_pending(supabase, doc_id))


async def _process_one_chunk(supabase, user_id: str, doc_id: str, chunk: dict, voice_id: str | None) -> None:
    try:
        await run_threaded_with_retry(
            lambda: supabase.table("chunks")
            .update({"audio_status": AudioStatus.GENERATING, "error_message": None})
            .eq("id", chunk["id"])
            .execute()
        )
        result = await synthesize_chunk(chunk["raw_text"], voice_id)
        public_url = await run_threaded_with_retry(
            lambda: upload_audio(user_id, doc_id, chunk["id"], result["audio_bytes"])
        )
        await run_threaded_with_retry(
            lambda: supabase.table("chunks")
            .update(
                {
                    "audio_url": public_url,
                    "audio_status": AudioStatus.READY,
                    "duration_ms": result["duration_ms"],
                    "error_message": None,
                    "last_error": None,
                }
            )
            .eq("id", chunk["id"])
            .execute()
        )
        ready = await run_threaded_with_retry(
            lambda: supabase.table("chunks")
            .select("id", count="exact")
            .eq("document_id", doc_id)
            .eq("audio_status", AudioStatus.READY)
            .execute()
        )
        await run_threaded_with_retry(
            lambda: supabase.table("documents")
            .update({"ready_chunks": ready.count or 0})
            .eq("id", doc_id)
            .execute()
        )
    except Exception as exc:
        last_error = _truncate_error(exc)
        await run_threaded_with_retry(
            lambda: supabase.table("chunks")
            .update({"audio_status": AudioStatus.ERROR, "error_message": str(exc), "last_error": last_error})
            .eq("id", chunk["id"])
            .execute()
        )


async def process_document_tts(user_id: str, doc_id: str, chunks: list[dict], voice_id: str | None) -> None:
    supabase = get_supabase()
    await run_threaded_with_retry(
        lambda: supabase.table("documents")
        .update({"generation_status": GenerationStatus.RUNNING})
        .eq("id", doc_id)
        .execute()
    )
    limit = int(os.getenv("TTS_CONCURRENCY", str(TTS_CONCURRENCY_DEFAULT)))
    semaphore = asyncio.Semaphore(limit)

    async def guarded(chunk: dict) -> None:
        async with semaphore:
            docs = (
                await run_threaded_with_retry(
                    lambda: supabase.table("documents")
                    .select("generation_status")
                    .eq("id", doc_id)
                    .limit(1)
                    .execute()
                )
            ).data
            if docs and docs[0].get("generation_status") == GenerationStatus.PAUSED:
                return
            await _process_one_chunk(supabase, user_id, doc_id, chunk, voice_id)

    await asyncio.gather(*(guarded(chunk) for chunk in chunks))
    docs = (
        await run_threaded_with_retry(
            lambda: supabase.table("documents")
            .select("generation_status")
            .eq("id", doc_id)
            .limit(1)
            .execute()
        )
    ).data
    if docs and docs[0].get("generation_status") == GenerationStatus.RUNNING:
        await run_threaded_with_retry(
            lambda: supabase.table("documents")
            .update({"generation_status": GenerationStatus.IDLE})
            .eq("id", doc_id)
            .execute()
        )


@router.post("/documents/{doc_id}/process-tts", status_code=202)
async def process_tts(
    doc_id: str,
    payload: ProcessTTSRequest | None = None,
    background_tasks: BackgroundTasks = None,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    user_id = _user_id(user)
    await _document_for_user_async(supabase, doc_id, user_id)
    await _raise_if_generating_async(supabase, doc_id)
    chunks = await _pending_or_error_chunks_async(supabase, doc_id)
    voice_id = payload.voice_id if payload else None
    background_tasks.add_task(process_document_tts, user_id, doc_id, chunks, voice_id)
    return {"data": {"document_id": doc_id, "queued_chunks": len(chunks), "message": "TTS generation started"}, "meta": None}


@router.post("/documents/{doc_id}/pause-tts")
async def pause_tts(doc_id: str, user=Depends(get_current_user), supabase=Depends(get_supabase)):
    user_id = _user_id(user)
    await _document_for_user_async(supabase, doc_id, user_id)
    await run_threaded_with_retry(
        lambda: supabase.table("documents")
        .update({"generation_status": GenerationStatus.PAUSED})
        .eq("id", doc_id)
        .execute()
    )
    return {"data": {"document_id": doc_id, "generation_status": GenerationStatus.PAUSED}, "meta": None}


@router.post("/documents/{doc_id}/resume-tts", status_code=202)
async def resume_tts(
    doc_id: str,
    payload: ProcessTTSRequest | None = None,
    background_tasks: BackgroundTasks = None,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    user_id = _user_id(user)
    await _document_for_user_async(supabase, doc_id, user_id)
    await _raise_if_generating_async(supabase, doc_id)
    await _reset_errored_chunks_to_pending_async(supabase, doc_id)
    chunks = await _pending_or_error_chunks_async(supabase, doc_id)
    await run_threaded_with_retry(
        lambda: supabase.table("documents")
        .update({"generation_status": GenerationStatus.RUNNING})
        .eq("id", doc_id)
        .execute()
    )
    voice_id = payload.voice_id if payload else None
    background_tasks.add_task(process_document_tts, user_id, doc_id, chunks, voice_id)
    return {
        "data": {
            "document_id": doc_id,
            "queued_chunks": len(chunks),
            "generation_status": GenerationStatus.RUNNING,
            "message": "TTS generation resumed",
        },
        "meta": None,
    }
