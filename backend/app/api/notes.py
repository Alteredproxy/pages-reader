from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_current_user
from app.api.documents import _error, _user_id
from app.db.supabase import get_supabase, run_threaded_with_retry

router = APIRouter()


class CreateNoteRequest(BaseModel):
    document_id: str
    chunk_id: str
    content: str = Field(..., min_length=1, max_length=10000)
    playback_offset_ms: int | None = None


def _chunk_context(chunk: dict) -> dict:
    return {"sequence_order": chunk["sequence_order"], "raw_text": chunk["raw_text"][:200]}


@router.post("/notes", status_code=201)
async def create_note(payload: CreateNoteRequest, user=Depends(get_current_user), supabase=Depends(get_supabase)):
    user_id = _user_id(user)
    docs = (
        await run_threaded_with_retry(
            lambda: supabase.table("documents")
            .select("id")
            .eq("id", payload.document_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    ).data
    if not docs:
        raise _error(404, "NOT_FOUND", "Document not found")
    chunks = (
        await run_threaded_with_retry(
            lambda: supabase.table("chunks")
            .select("*")
            .eq("id", payload.chunk_id)
            .eq("document_id", payload.document_id)
            .limit(1)
            .execute()
        )
    ).data
    if not chunks:
        raise _error(404, "NOT_FOUND", "Chunk not found")
    row = (
        await run_threaded_with_retry(
            lambda: supabase.table("notes")
            .insert(
                {
                    "user_id": user_id,
                    "document_id": payload.document_id,
                    "chunk_id": payload.chunk_id,
                    "content": payload.content,
                    "playback_offset_ms": payload.playback_offset_ms,
                }
            )
            .execute()
        )
    ).data[0]
    data = {
        "id": row["id"],
        "user_id": row["user_id"],
        "document_id": row["document_id"],
        "chunk_id": row["chunk_id"],
        "content": row["content"],
        "playback_offset_ms": row.get("playback_offset_ms"),
        "created_at": row["created_at"],
        "chunk_context": _chunk_context(chunks[0]),
    }
    return {"data": data, "meta": None}


@router.get("/documents/{doc_id}/notes")
async def list_notes(
    doc_id: str,
    chunk_id: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    user_id = _user_id(user)
    docs = (
        await run_threaded_with_retry(
            lambda: supabase.table("documents")
            .select("id")
            .eq("id", doc_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    ).data
    if not docs:
        raise _error(404, "NOT_FOUND", "Document not found")

    def list_rows():
        query = supabase.table("notes").select("*", count="exact").eq("document_id", doc_id).eq("user_id", user_id)
        if chunk_id:
            query = query.eq("chunk_id", chunk_id)
        return query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()

    response = await run_threaded_with_retry(list_rows)
    chunk_ids = list({row["chunk_id"] for row in response.data})
    chunk_map = {}
    if chunk_ids:
        chunks = (
            await run_threaded_with_retry(
                lambda: supabase.table("chunks").select("id, sequence_order, raw_text").in_("id", chunk_ids).execute()
            )
        ).data
        chunk_map = {chunk["id"]: chunk for chunk in chunks}
    data = [
        {
            "id": row["id"],
            "document_id": row["document_id"],
            "chunk_id": row["chunk_id"],
            "content": row["content"],
            "playback_offset_ms": row.get("playback_offset_ms"),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "chunk_context": _chunk_context(chunk_map[row["chunk_id"]]),
        }
        for row in response.data
        if row["chunk_id"] in chunk_map
    ]
    return {"data": data, "meta": {"total": response.count or 0, "limit": limit, "offset": offset}}


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(note_id: str, user=Depends(get_current_user), supabase=Depends(get_supabase)):
    user_id = _user_id(user)
    rows = (
        await run_threaded_with_retry(
            lambda: supabase.table("notes")
            .select("id")
            .eq("id", note_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    ).data
    if not rows:
        raise _error(404, "NOT_FOUND", "Note not found")
    await run_threaded_with_retry(
        lambda: supabase.table("notes").delete().eq("id", note_id).eq("user_id", user_id).execute()
    )
    return Response(status_code=204)
