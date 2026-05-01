import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.constants import MAX_CHUNK_CHARS
from app.services.chunker import chunk_text


def test_paragraph_under_800_chars_is_never_split():
    paragraph = "This paragraph fits comfortably. " * 10

    chunks = chunk_text(paragraph)

    assert len(chunks) == 1
    assert chunks[0]["raw_text"] == paragraph.strip()
    assert chunks[0]["character_count"] == len(paragraph.strip())
    assert chunks[0]["audio_status"] == "pending"


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


def test_sequence_order_is_contiguous_starting_from_zero():
    long_paragraph = " ".join(["A complete sentence ends here."] * 80)

    chunks = chunk_text(long_paragraph)

    assert [chunk["sequence_order"] for chunk in chunks] == list(range(len(chunks)))
