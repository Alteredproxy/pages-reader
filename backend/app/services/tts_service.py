import asyncio
import base64
import json
import os
import urllib.error
import urllib.request
import wave
from io import BytesIO

from app.constants import TTS_MODEL, TTS_VOICE_DEFAULT


GEMINI_TTS_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{TTS_MODEL}:generateContent"
)


def _wrap_pcm_as_wav(pcm_bytes: bytes) -> bytes:
    output = BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(pcm_bytes)
    return output.getvalue()


def _extract_pcm(response_body: bytes) -> bytes:
    payload = json.loads(response_body.decode("utf-8"))
    data = payload["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
    return base64.b64decode(data)


def _request_tts(text: str, voice_id: str) -> bytes:
    api_key = os.environ["GEMINI_API_KEY"]
    body = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": voice_id},
                }
            },
        },
    }
    request = urllib.request.Request(
        GEMINI_TTS_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return _extract_pcm(response.read())


async def synthesize_chunk(raw_text: str, voice_id: str | None = None) -> dict:
    voice = voice_id or os.getenv("GEMINI_TTS_VOICE", TTS_VOICE_DEFAULT)
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            pcm_bytes = await asyncio.to_thread(_request_tts, raw_text, voice)
            duration_ms = int((len(pcm_bytes) / 2 / 24000) * 1000)
            wav_bytes = _wrap_pcm_as_wav(pcm_bytes)
            return {"audio_bytes": wav_bytes, "duration_ms": duration_ms}
        except (KeyError, IndexError, json.JSONDecodeError, urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            last_error = exc
            if attempt < 2:
                await asyncio.sleep(2)
    raise RuntimeError(f"Gemini TTS failed: {last_error}")
