from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.api.documents import _error, _user_id
from app.db.supabase import get_supabase

router = APIRouter()


@router.get("/documents/{doc_id}/chunks")
async def list_chunks(
    doc_id: str,
    status: str | None = None,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    user_id = _user_id(user)
    docs = supabase.table("documents").select("id").eq("id", doc_id).eq("user_id", user_id).limit(1).execute().data
    if not docs:
        raise _error(404, "NOT_FOUND", "Document not found")
    query = supabase.table("chunks").select("*", count="exact").eq("document_id", doc_id)
    if status:
        query = query.eq("audio_status", status)
    response = query.order("sequence_order").execute()
    data = [
        {
            "id": row["id"],
            "document_id": row["document_id"],
            "sequence_order": row["sequence_order"],
            "chapter_id": row.get("chapter_id"),
            "raw_text": row["raw_text"],
            "audio_url": row.get("audio_url"),
            "audio_status": row["audio_status"],
            "character_count": row["character_count"],
            "duration_ms": row.get("duration_ms"),
            "created_at": row["created_at"],
        }
        for row in response.data
    ]
    return {"data": data, "meta": {"total": response.count or len(data)}}
