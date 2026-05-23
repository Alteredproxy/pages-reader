class AudioStatus:
    PENDING = "pending"
    GENERATING = "generating"
    READY = "ready"
    ERROR = "error"


class DocumentStatus:
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


class DocumentSource:
    PDF = "pdf"
    URL = "url"


class GenerationStatus:
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"


MAX_CHUNK_CHARS = 800
MIN_CHUNK_CHARS = 50
TTS_PROVIDER = "google_cloud"
TTS_MODEL = "en-US-Chirp3-HD-Pulcherrima"
TTS_VOICE_DEFAULT = "en-US-Chirp3-HD-Pulcherrima"
TTS_VOICES_AVAILABLE = [
    "en-US-Chirp3-HD-Aoede",
    "en-US-Chirp3-HD-Charon",
    "en-US-Chirp3-HD-Kore",
    "en-US-Chirp3-HD-Pulcherrima",
    "en-US-Chirp3-HD-Zephyr",
    "en-US-Chirp3-HD-Fenrir",
    "en-US-Chirp3-HD-Leda",
    "en-US-Chirp3-HD-Puck",
]
TTS_AUDIO_FORMAT = "wav"
TTS_CONCURRENCY_DEFAULT = 3
