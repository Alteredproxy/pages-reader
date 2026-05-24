import asyncio

from app.api import tts
from app.constants import AudioStatus, GenerationStatus


class FakeResponse:
    def __init__(self, data=None, count=None):
        self.data = data or []
        self.count = count


class FakeSupabase:
    def __init__(self):
        self.rows = {
            "documents": [],
            "chunks": [],
        }
        self.updates = []

    def table(self, name):
        return FakeQuery(self, name)


class FakeQuery:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.operation = None
        self.payload = None
        self.filters = []
        self.in_filters = []
        self.count = None

    def select(self, _columns, count=None):
        self.operation = "select"
        self.count = count
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def in_(self, column, values):
        self.in_filters.append((column, values))
        return self

    def order(self, _column, desc=False):
        return self

    def limit(self, _limit):
        return self

    def execute(self):
        rows = self._matching_rows()
        if self.operation == "update":
            for row in rows:
                row.update(self.payload)
            self.db.updates.append(
                {
                    "table": self.table,
                    "payload": self.payload,
                    "filters": list(self.filters),
                    "in_filters": list(self.in_filters),
                    "matched": [row.copy() for row in rows],
                }
            )
        return FakeResponse(data=[row.copy() for row in rows], count=len(rows) if self.count == "exact" else None)

    def _matching_rows(self):
        rows = self.db.rows[self.table]
        for column, value in self.filters:
            rows = [row for row in rows if row.get(column) == value]
        for column, values in self.in_filters:
            rows = [row for row in rows if row.get(column) in values]
        return rows


def test_tts_error_populates_last_error(monkeypatch):
    supabase = FakeSupabase()
    supabase.rows["chunks"] = [
        {
            "id": "chunk-error",
            "document_id": "doc-1",
            "audio_status": AudioStatus.PENDING,
            "last_error": None,
        }
    ]

    async def fail_tts(_raw_text, _voice_id):
        raise ValueError("content rejected by provider")

    monkeypatch.setattr(tts, "synthesize_chunk", fail_tts)

    asyncio.run(
        tts._process_one_chunk(
            supabase,
            "user-1",
            "doc-1",
            {"id": "chunk-error", "raw_text": "bad text"},
            None,
        )
    )

    chunk = supabase.rows["chunks"][0]
    assert chunk["audio_status"] == AudioStatus.ERROR
    assert chunk["last_error"] == "content rejected by provider"
    assert chunk["error_message"] == "content rejected by provider"


def test_tts_success_clears_previous_last_error(monkeypatch):
    supabase = FakeSupabase()
    supabase.rows["documents"] = [{"id": "doc-1", "ready_chunks": 0}]
    supabase.rows["chunks"] = [
        {
            "id": "chunk-ready",
            "document_id": "doc-1",
            "audio_status": AudioStatus.ERROR,
            "last_error": "old socket failure",
            "error_message": "old socket failure",
        }
    ]

    async def synthesize(_raw_text, _voice_id):
        return {"audio_bytes": b"wav-bytes", "duration_ms": 321}

    monkeypatch.setattr(tts, "synthesize_chunk", synthesize)
    monkeypatch.setattr(tts, "upload_audio", lambda *_args: "https://example.test/audio.wav")

    asyncio.run(
        tts._process_one_chunk(
            supabase,
            "user-1",
            "doc-1",
            {"id": "chunk-ready", "raw_text": "good text"},
            None,
        )
    )

    chunk = supabase.rows["chunks"][0]
    assert chunk["audio_status"] == AudioStatus.READY
    assert chunk["last_error"] is None
    assert chunk["error_message"] is None
    assert chunk["audio_url"] == "https://example.test/audio.wav"


def test_resume_resets_only_errored_chunks_before_queueing(monkeypatch):
    supabase = FakeSupabase()
    supabase.rows["documents"] = [
        {"id": "doc-1", "user_id": "user-1", "generation_status": GenerationStatus.PAUSED}
    ]
    supabase.rows["chunks"] = [
        {
            "id": "chunk-ready",
            "document_id": "doc-1",
            "audio_status": AudioStatus.READY,
            "last_error": None,
            "sequence_order": 0,
        },
        {
            "id": "chunk-pending",
            "document_id": "doc-1",
            "audio_status": AudioStatus.PENDING,
            "last_error": None,
            "sequence_order": 1,
        },
        {
            "id": "chunk-error",
            "document_id": "doc-1",
            "audio_status": AudioStatus.ERROR,
            "last_error": "WinError 10035",
            "error_message": "WinError 10035",
            "sequence_order": 2,
        },
    ]
    tasks = []

    class FakeBackgroundTasks:
        def add_task(self, func, *args):
            tasks.append((func, args))

    response = asyncio.run(
        tts.resume_tts(
            "doc-1",
            payload=None,
            background_tasks=FakeBackgroundTasks(),
            user={"id": "user-1"},
            supabase=supabase,
        )
    )

    chunks = {chunk["id"]: chunk for chunk in supabase.rows["chunks"]}
    assert chunks["chunk-ready"]["audio_status"] == AudioStatus.READY
    assert chunks["chunk-pending"]["audio_status"] == AudioStatus.PENDING
    assert chunks["chunk-error"]["audio_status"] == AudioStatus.PENDING
    assert chunks["chunk-error"]["last_error"] is None

    reset_updates = [
        update
        for update in supabase.updates
        if update["table"] == "chunks" and ("audio_status", AudioStatus.ERROR) in update["filters"]
    ]
    assert len(reset_updates) == 1
    assert reset_updates[0]["payload"]["audio_status"] == AudioStatus.PENDING
    assert reset_updates[0]["payload"]["last_error"] is None
    assert response["data"]["queued_chunks"] == 2
    assert tasks and tasks[0][0] is tts.process_document_tts
