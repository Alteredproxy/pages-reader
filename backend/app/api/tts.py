import asyncio
import os

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.api.documents import _error, _user_id
from app.constants import AudioStatus, TTS_CONCURRENCY_DEFAULT
from app.db.supabase import get_supabase
from app.services.storage import upload_audio
from app.services.tts_service import synthesize_chunk

router = APIRouter()


class ProcessTTSRequest(BaseModel):
    voice_id: str | None = None


async def _process_one_chunk(supabase, user_id: str, doc_id: str, chunk: dict, voice_id: str | None) -> None:
    try:
        supabase.table("chunks").update({"audio_status": AudioStatus.GENERATING, "error_message": None}).eq("id", chunk["id"]).execute()
        result = await synthesize_chunk(chunk["raw_text"], voice_id)
        public_url = upload_audio(user_id, doc_id, chunk["id"], result["audio_bytes"])
        supabase.table("chunks").update(
            {
                "audio_url": public_url,
                "audio_status": AudioStatus.READY,
                "duration_ms": result["duration_ms"],
                "error_message": None,
            }
        ).eq("id", chunk["id"]).execute()
        ready = (
            supabase.table("chunks")
            .select("id", count="exact")
            .eq("document_id", doc_id)
            .eq("audio_status", AudioStatus.READY)
            .execute()
        )
        supabase.table("documents").update({"ready_chunks": ready.count or 0}).eq("id", doc_id).execute()
    except Exception as exc:
        supabase.table("chunks").update(
            {"audio_status": AudioStatus.ERROR, "error_message": str(exc)}
        ).eq("id", chunk["id"]).execute()


async def process_document_tts(user_id: str, doc_id: str, chunks: list[dict], voice_id: str | None) -> None:
    supabase = get_supabase()
    limit = int(os.getenv("TTS_CONCURRENCY", str(TTS_CONCURRENCY_DEFAULT)))
    semaphore = asyncio.Semaphore(limit)

    async def guarded(chunk: dict) -> None:
        async with semaphore:
            await _process_one_chunk(supabase, user_id, doc_id, chunk, voice_id)

    await asyncio.gather(*(guarded(chunk) for chunk in chunks))


@router.post("/documents/{doc_id}/process-tts", status_code=202)
async def process_tts(
    doc_id: str,
    payload: ProcessTTSRequest | None = None,
    background_tasks: BackgroundTasks = None,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    user_id = _user_id(user)
    docs = supabase.table("documents").select("id").eq("id", doc_id).eq("user_id", user_id).limit(1).execute().data
    if not docs:
        raise _error(404, "NOT_FOUND", "Document not found")
    generating = supabase.table("chunks").select("id", count="exact").eq("document_id", doc_id).eq("audio_status", AudioStatus.GENERATING).execute()
    if generating.count and generating.count > 0:
        raise _error(409, "ALREADY_PROCESSING", "TTS generation is already in progress")
    chunks = supabase.table("chunks").select("*").eq("document_id", doc_id).in_("audio_status", [AudioStatus.PENDING, AudioStatus.ERROR]).order("sequence_order").execute().data
    voice_id = payload.voice_id if payload else None
    background_tasks.add_task(process_document_tts, user_id, doc_id, chunks, voice_id)
    return {"data": {"document_id": doc_id, "queued_chunks": len(chunks), "message": "TTS generation started"}, "meta": None}
