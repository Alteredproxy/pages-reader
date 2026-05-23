import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.parser import detect_chapters


def _titles(text: str) -> list[str]:
    return [chapter["title"] for chapter in detect_chapters(text)]


def test_chapter_title_ending_with_question_mark_is_detected():
    assert "Chapter 1: Why Do We Fail?" in _titles("Chapter 1: Why Do We Fail?\nBody text.")


def test_chapter_title_without_end_punctuation_is_still_detected():
    assert "Chapter 1: The Will To Fail" in _titles("Chapter 1: The Will To Fail\nBody text.")


def test_sentence_ending_with_period_is_rejected_as_chapter():
    assert _titles("He said, 'Why do we fail?'.\nBody text.") == []


def test_chapter_title_ending_with_exclamation_mark_is_detected():
    assert "Chapter 4: Boom!" in _titles("Chapter 4: Boom!\nBody text.")
