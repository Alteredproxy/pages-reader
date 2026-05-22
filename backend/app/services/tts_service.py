import asyncio
import os
import wave
from io import BytesIO

from google.cloud import texttospeech

from app.constants import TTS_VOICE_DEFAULT


def _wrap_pcm_as_wav(pcm_bytes: bytes, sample_rate: int = 24000) -> bytes:
    output = BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm_bytes)
    return output.getvalue()


def _strip_wav_header(data: bytes) -> bytes:
    if data[:4] == b"RIFF":
        offset = 12
        while offset < len(data) - 8:
            chunk_id = data[offset:offset + 4]
            chunk_size = int.from_bytes(data[offset + 4:offset + 8], "little")
            if chunk_id == b"data":
                return data[offset + 8: offset + 8 + chunk_size]
            offset += 8 + chunk_size
        return data[44:]
    return data


def _request_tts(text: str, voice_id: str) -> bytes:
    client = texttospeech.TextToSpeechClient()
    language_code = "-".join(voice_id.split("-")[:2])
    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice_params = texttospeech.VoiceSelectionParams(
        language_code=language_code,
        name=voice_id,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.LINEAR16,
        sample_rate_hertz=24000,
    )
    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice_params,
        audio_config=audio_config,
    )
    return _strip_wav_header(response.audio_content)


async def synthesize_chunk(raw_text: str, voice_id: str | None = None) -> dict:
    voice = voice_id or os.getenv("GOOGLE_TTS_VOICE", TTS_VOICE_DEFAULT)
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            pcm_bytes = await asyncio.to_thread(_request_tts, raw_text, voice)
            duration_ms = int((len(pcm_bytes) / 2 / 24000) * 1000)
            wav_bytes = _wrap_pcm_as_wav(pcm_bytes)
            return {"audio_bytes": wav_bytes, "duration_ms": duration_ms}
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                await asyncio.sleep(2)
    raise RuntimeError(f"Google Cloud TTS failed: {last_error}")
