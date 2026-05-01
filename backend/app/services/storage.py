from app.db.supabase import get_supabase


def upload_audio(user_id: str, doc_id: str, chunk_id: str, audio_bytes: bytes) -> str:
    path = f"{user_id}/{doc_id}/{chunk_id}.wav"
    supabase = get_supabase()
    supabase.storage.from_("audio").upload(
        path,
        audio_bytes,
        file_options={"content-type": "audio/wav", "upsert": "true"},
    )
    return supabase.storage.from_("audio").get_public_url(path)
