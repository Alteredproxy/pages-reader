import logging
import os

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile

from app.api.deps import get_current_user
from app.constants import AudioStatus, DocumentSource, DocumentStatus
from app.db.supabase import get_supabase, run_threaded_with_retry
from app.services.chunker import chunk_text, segment_by_chapters
from app.services.parser import _clean_text, detect_chapters, extract_pdf_raw, extract_url_raw

router = APIRouter()
logger = logging.getLogger(__name__)


def _error(status_code: int, code: str, message: str, details=None) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": {"code": code, "message": message, "details": details}})


def _user_id(user) -> str:
    return user["id"] if isinstance(user, dict) else user.id


def _document_create_shape(row: dict) -> dict:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "title": row["title"],
        "source_type": row["source_type"],
        "source_url": row.get("source_url"),
        "status": row["status"],
        "total_chunks": row["total_chunks"],
        "ready_chunks": row["ready_chunks"],
        "created_at": row["created_at"],
    }


def parse_and_chunk_document(doc_id: str, source_type: str, payload: str | bytes) -> None:
    supabase = get_supabase()
    try:
        if source_type == DocumentSource.PDF:
            raw_text = extract_pdf_raw(payload if isinstance(payload, bytes) else b"")
        else:
            raw_text = extract_url_raw(str(payload))
        if not _clean_text(raw_text):
            raise ValueError("No text could be extracted")
        chapters = detect_chapters(raw_text)
        chapter_ids = {}
        if chapters:
            chapter_rows = [
                {"document_id": doc_id, "sequence_order": index, "title": chapter["title"]}
                for index, chapter in enumerate(chapters)
            ]
            result = supabase.table("chapters").insert(chapter_rows).execute()
            chapter_ids = {row["sequence_order"]: row["id"] for row in result.data}

        rows = []
        for segment in segment_by_chapters(raw_text, chapters):
            chapter_index = segment["chapter_index"]
            chapter_id = chapter_ids.get(chapter_index)
            if segment["title"]:
                title = _clean_text(segment["title"])
                if title:
                    rows.append(
                        {
                            "document_id": doc_id,
                            "chapter_id": chapter_id,
                            "raw_text": title,
                            "character_count": len(title),
                            "audio_status": AudioStatus.PENDING,
                        }
                    )

            cleaned_body = _clean_text(segment["body"])
            if not cleaned_body:
                continue
            for chunk in chunk_text(cleaned_body):
                rows.append(
                    {
                        "document_id": doc_id,
                        "chapter_id": chapter_id,
                        "audio_status": AudioStatus.PENDING,
                        **chunk,
                    }
                )

        if not rows:
            raise ValueError("No chunks were produced from extracted text")
        for sequence_order, row in enumerate(rows):
            row["sequence_order"] = sequence_order
        supabase.table("chunks").insert(rows).execute()
        supabase.table("documents").update(
            {"total_chunks": len(rows), "status": DocumentStatus.READY, "error_message": None}
        ).eq("id", doc_id).execute()
    except Exception as exc:
        supabase.table("documents").update(
            {"status": DocumentStatus.ERROR, "error_message": str(exc)}
        ).eq("id", doc_id).execute()


@router.post("/documents", status_code=201)
async def create_document(
    request: Request,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase),
    file: UploadFile | None = File(None),
    title: str | None = Form(None),
):
    user_id = _user_id(user)
    content_type = request.headers.get("content-type", "")
    max_bytes = int(float(os.getenv("MAX_FILE_SIZE_MB", "20")) * 1024 * 1024)

    if content_type.startswith("multipart/form-data"):
        if file is None:
            raise _error(400, "INVALID_INPUT", "Missing PDF file")
        if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
            raise _error(415, "UNSUPPORTED_MEDIA_TYPE", "Only PDF uploads are supported")
        file_bytes = await file.read()
        if len(file_bytes) > max_bytes:
            raise _error(413, "PAYLOAD_TOO_LARGE", "File exceeds upload limit")
        doc_title = title or file.filename
        source_type = DocumentSource.PDF
        source_url = None
        payload = file_bytes
    else:
        body = await request.json()
        url = (body.get("url") or "").strip()
        if not url:
            raise _error(400, "INVALID_INPUT", "Missing URL")
        doc_title = body.get("title") or url
        source_type = DocumentSource.URL
        source_url = url
        payload = url

    inserted = (
        await run_threaded_with_retry(
            lambda: supabase.table("documents")
            .insert(
                {
                    "user_id": user_id,
                    "title": doc_title,
                    "source_type": source_type,
                    "source_url": source_url,
                    "status": DocumentStatus.PROCESSING,
                }
            )
            .execute()
        )
    ).data[0]

    background_tasks.add_task(parse_and_chunk_document, inserted["id"], source_type, payload)
    return {"data": _document_create_shape(inserted), "meta": None}


@router.get("/documents")
async def list_documents(
    status: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    user_id = _user_id(user)

    def list_rows():
        query = supabase.table("documents").select("*", count="exact").eq("user_id", user_id)
        if status:
            query = query.eq("status", status)
        return query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()

    response = await run_threaded_with_retry(list_rows)
    data = [
        {
            "id": row["id"],
            "title": row["title"],
            "source_type": row["source_type"],
            "source_url": row.get("source_url"),
            "status": row["status"],
            "total_chunks": row["total_chunks"],
            "ready_chunks": row["ready_chunks"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in response.data
    ]
    return {"data": data, "meta": {"total": response.count or 0, "limit": limit, "offset": offset}}


@router.get("/documents/{doc_id}")
async def get_document(doc_id: str, user=Depends(get_current_user), supabase=Depends(get_supabase)):
    user_id = _user_id(user)
    rows = (
        await run_threaded_with_retry(
            lambda: supabase.table("documents")
            .select("*")
            .eq("id", doc_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    ).data
    if not rows:
        raise _error(404, "NOT_FOUND", "Document not found")
    return {"data": rows[0], "meta": None}


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(doc_id: str, user=Depends(get_current_user), supabase=Depends(get_supabase)):
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
    chunks = (
        await run_threaded_with_retry(
            lambda: supabase.table("chunks").select("id").eq("document_id", doc_id).execute()
        )
    ).data
    paths = [f"{user_id}/{doc_id}/{chunk['id']}.wav" for chunk in chunks]
    await run_threaded_with_retry(lambda: supabase.table("documents").delete().eq("id", doc_id).execute())
    if paths:
        try:
            await run_threaded_with_retry(lambda: supabase.storage.from_("audio").remove(paths))
        except Exception:
            logger.warning(
                "Storage cleanup failed for doc %s (%d files); leaving orphan audio",
                doc_id,
                len(paths),
                exc_info=True,
            )
    return None
