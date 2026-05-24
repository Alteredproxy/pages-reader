from pydantic import BaseModel


class ChunkResponse(BaseModel):
    id: str
    document_id: str
    sequence_order: int
    chapter_id: str | None = None
    raw_text: str
    audio_url: str | None = None
    audio_status: str
    character_count: int
    duration_ms: int | None = None
    created_at: str
    last_error: str | None = None
