import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.constants import MAX_CHUNK_CHARS
from app.services.chunker import chunk_text, segment_by_chapters


def _clean_text(text: str) -> str:
    lines = [line.strip() for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    blocks: list[str] = []
    current: list[str] = []
    for line in lines:
        if line:
            current.append(line)
        elif current:
            blocks.append(" ".join(current))
            current = []
    if current:
        blocks.append(" ".join(current))
    return "\n\n".join(blocks).strip()


def _rows_for_chapters(raw_text: str, chapters: list[dict], chapter_ids: dict[int, str]) -> list[dict]:
    rows: list[dict] = []
    for segment in segment_by_chapters(raw_text, chapters):
        chapter_id = chapter_ids.get(segment["chapter_index"])
        if segment["title"]:
            title = _clean_text(segment["title"])
            rows.append({"raw_text": title, "chapter_id": chapter_id, "character_count": len(title)})
        body = _clean_text(segment["body"])
        if not body:
            continue
        for chunk in chunk_text(body):
            rows.append({"chapter_id": chapter_id, **chunk})
    for sequence_order, row in enumerate(rows):
        row["sequence_order"] = sequence_order
    return rows


def test_paragraph_under_800_chars_is_never_split():
    paragraph = "This paragraph fits comfortably. " * 10

    chunks = chunk_text(paragraph)

    assert len(chunks) == 1
    assert chunks[0]["raw_text"] == paragraph.strip()
    assert chunks[0]["character_count"] == len(paragraph.strip())
    assert set(chunks[0]) == {"raw_text", "character_count"}


def test_paragraph_over_800_chars_splits_at_sentence_boundary():
    sentence = "This sentence stays whole and ends cleanly."
    paragraph = " ".join([sentence] * 30)

    chunks = chunk_text(paragraph)

    assert len(chunks) > 1
    assert all(chunk["character_count"] <= MAX_CHUNK_CHARS for chunk in chunks)
    assert all(chunk["raw_text"].endswith(".") for chunk in chunks)
    assert "cleanly. This" not in chunks[0]["raw_text"][-20:]


def test_paragraph_under_50_chars_merges_with_next_and_preserves_separator():
    text = "Tiny note.\n\nThis next paragraph gives the tiny note enough context."

    chunks = chunk_text(text)

    assert len(chunks) == 1
    assert chunks[0]["raw_text"] == text
    assert "\n\n" in chunks[0]["raw_text"]


def test_chunk_text_does_not_assign_orchestration_fields():
    long_paragraph = " ".join(["A complete sentence ends here."] * 80)

    chunks = chunk_text(long_paragraph)

    assert len(chunks) > 1
    assert all("sequence_order" not in chunk for chunk in chunks)
    assert all("chapter_index" not in chunk for chunk in chunks)
    assert all("audio_status" not in chunk for chunk in chunks)


def test_no_chunk_contains_chapter_heading_in_its_interior():
    raw_text = (
        "Preface text that should remain before chapters.\n\n"
        "Chapter One\n"
        + ("This opening chapter sentence stays in chapter one. " * 20)
        + "\n\nChapter Two\n"
        + ("This second chapter sentence stays in chapter two. " * 20)
    )
    chapters = [
        {"title": "Chapter One", "char_offset": raw_text.index("Chapter One")},
        {"title": "Chapter Two", "char_offset": raw_text.index("Chapter Two")},
    ]

    rows = _rows_for_chapters(raw_text, chapters, {0: "chapter-1", 1: "chapter-2"})

    assert all(
        row["raw_text"] == "Chapter One" or "\nChapter One" not in row["raw_text"]
        for row in rows
    )
    assert all(
        row["raw_text"] == "Chapter Two" or "\nChapter Two" not in row["raw_text"]
        for row in rows
    )


def test_each_chapters_first_chunk_equals_its_title():
    raw_text = (
        "Chapter One\n"
        "The first body paragraph has enough words to become its own chunk.\n\n"
        "Chapter Two\n"
        "The second body paragraph has enough words to become its own chunk."
    )
    chapters = [
        {"title": "Chapter One", "char_offset": raw_text.index("Chapter One")},
        {"title": "Chapter Two", "char_offset": raw_text.index("Chapter Two")},
    ]

    rows = _rows_for_chapters(raw_text, chapters, {0: "chapter-1", 1: "chapter-2"})

    assert rows[0]["raw_text"] == "Chapter One"
    assert rows[0]["chapter_id"] == "chapter-1"
    chapter_two_first = next(row for row in rows if row["chapter_id"] == "chapter-2")
    assert chapter_two_first["raw_text"] == "Chapter Two"


def test_chapter_id_is_correct_and_front_matter_is_none():
    raw_text = (
        "Introductory front matter before the first heading.\n\n"
        "Chapter One\n"
        "Body text for chapter one that should carry the first chapter id.\n\n"
        "Chapter Two\n"
        "Body text for chapter two that should carry the second chapter id."
    )
    chapters = [
        {"title": "Chapter One", "char_offset": raw_text.index("Chapter One")},
        {"title": "Chapter Two", "char_offset": raw_text.index("Chapter Two")},
    ]

    rows = _rows_for_chapters(raw_text, chapters, {0: "chapter-1", 1: "chapter-2"})

    assert rows[0]["chapter_id"] is None
    assert rows[0]["raw_text"].startswith("Introductory front matter")
    assert all(row["chapter_id"] == "chapter-1" for row in rows if "chapter one" in row["raw_text"].lower())
    assert all(row["chapter_id"] == "chapter-2" for row in rows if "chapter two" in row["raw_text"].lower())
    assert [row["sequence_order"] for row in rows] == list(range(len(rows)))


def test_headingless_input_chunks_flat_without_title_chunks():
    raw_text = "This document has no chapter headings.\n\nIt should stay flat and unassigned."

    rows = _rows_for_chapters(raw_text, [], {})

    assert len(rows) == 1
    assert rows[0]["chapter_id"] is None
    assert rows[0]["raw_text"] == _clean_text(raw_text)
