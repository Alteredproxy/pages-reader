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


MAX_CHUNK_CHARS = 800
MIN_CHUNK_CHARS = 50
TTS_PROVIDER = "gemini"
TTS_MODEL = "gemini-3.1-flash-tts-preview"
TTS_VOICE_DEFAULT = "Pulcherrima"
TTS_VOICES_AVAILABLE = [
    "Pulcherrima",
    "Kore",
    "Alloy",
    "Echo",
    "Ember",
    "Fenrir",
    "Leda",
    "Orus",
    "Puck",
    "Schedar",
    "Zephyr",
]
TTS_AUDIO_FORMAT = "wav"
TTS_CONCURRENCY_DEFAULT = 3
