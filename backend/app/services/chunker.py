import re

from app.constants import AudioStatus, MAX_CHUNK_CHARS, MIN_CHUNK_CHARS


SENTENCE_BOUNDARY = re.compile(r"(?<=[.,?!])\s+")


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _paragraphs(raw_text: str) -> list[str]:
    normalized = _normalize(raw_text)
    return [part.strip() for part in normalized.split("\n\n") if part.strip()]


def _hard_split(text: str) -> list[str]:
    chunks: list[str] = []
    remaining = _normalize(text)

    while len(remaining) > MAX_CHUNK_CHARS:
        split_at = remaining.rfind(" ", 0, MAX_CHUNK_CHARS + 1)
        if split_at <= 0:
            split_at = MAX_CHUNK_CHARS
        chunks.append(_normalize(remaining[:split_at]))
        remaining = _normalize(remaining[split_at:])

    if remaining:
        chunks.append(remaining)

    return chunks


def _pack_sentence_parts(parts: list[str]) -> list[str]:
    chunks: list[str] = []
    current = ""

    for part in parts:
        part = _normalize(part)
        if not part:
            continue

        if len(part) > MAX_CHUNK_CHARS:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(_hard_split(part))
            continue

        candidate = f"{current} {part}".strip() if current else part
        if len(candidate) <= MAX_CHUNK_CHARS:
            current = candidate
            continue

        if current:
            chunks.append(current)
        current = part

    if current:
        chunks.append(current)

    return chunks


def _split_oversized_text(text: str) -> list[str]:
    text = _normalize(text)
    if len(text) <= MAX_CHUNK_CHARS:
        return [text]

    parts = SENTENCE_BOUNDARY.split(text)
    if len(parts) == 1:
        return _hard_split(text)

    return _pack_sentence_parts(parts)


def _merge_short_paragraphs(paragraphs: list[str]) -> list[str]:
    merged: list[str] = []
    index = 0

    while index < len(paragraphs):
        current = paragraphs[index]

        while len(current) < MIN_CHUNK_CHARS and index + 1 < len(paragraphs):
            index += 1
            current = f"{current}\n\n{paragraphs[index]}"

        merged.append(_normalize(current))
        index += 1

    return merged


def _chapter_index_for_position(position: int, chapter_offsets: list[int]) -> int:
    chapter_index = -1
    for index, offset in enumerate(chapter_offsets):
        if position < offset:
            break
        chapter_index = index
    return chapter_index


def chunk_text(raw_text: str, chapter_offsets: list[int] = []) -> list[dict]:
    candidates = _merge_short_paragraphs(_paragraphs(raw_text))

    raw_chunks: list[str] = []
    for candidate in candidates:
        if len(candidate) <= MAX_CHUNK_CHARS:
            raw_chunks.append(candidate)
        else:
            raw_chunks.extend(_split_oversized_text(candidate))

    chunks = [_normalize(chunk) for chunk in raw_chunks if _normalize(chunk)]
    rows: list[dict] = []
    position = 0
    for index, chunk in enumerate(chunks):
        rows.append(
            {
            "raw_text": chunk,
            "sequence_order": index,
            "character_count": len(chunk),
            "audio_status": AudioStatus.PENDING,
            "chapter_index": _chapter_index_for_position(position, chapter_offsets),
            }
        )
        position += len(chunk)
    return rows
