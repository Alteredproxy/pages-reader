from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.api.documents import _error, _user_id
from app.db.supabase import get_supabase

router = APIRouter()


@router.get("/documents/{doc_id}/chapters")
async def list_chapters(doc_id: str, user=Depends(get_current_user), supabase=Depends(get_supabase)):
    user_id = _user_id(user)
    docs = supabase.table("documents").select("id").eq("id", doc_id).eq("user_id", user_id).limit(1).execute().data
    if not docs:
        raise _error(404, "NOT_FOUND", "Document not found")
    response = supabase.table("chapters").select("*", count="exact").eq("document_id", doc_id).order("sequence_order").execute()
    data = [
        {
            "id": r["id"],
            "document_id": r["document_id"],
            "sequence_order": r["sequence_order"],
            "title": r["title"],
            "created_at": r["created_at"],
        }
        for r in response.data
    ]
    return {"data": data, "meta": {"total": response.count or len(data)}}
