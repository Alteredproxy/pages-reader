import re
from io import BytesIO

import pdfplumber
import trafilatura


HEADING_PREFIX = re.compile(
    r"^(chapter|part|section|prologue|epilogue|introduction|conclusion|preface|appendix)\b",
    re.IGNORECASE,
)
NUMBERED_HEADING = re.compile(
    r"^(chapter|part|section)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|[IVXLC]+)\b",
    re.IGNORECASE,
)
MARKDOWN_HEADING = re.compile(r"^#+\s+\w")


def _clean_title(title: str) -> str:
    title = re.sub(r"[\s\.]+\d+\s*$", "", title)
    title = re.sub(r"\s+\d+$", "", title)
    title = re.sub(r"\s{2,}", " ", title)
    return title.strip()


def _remove_toc_clusters(chapters: list[dict]) -> list[dict]:
    if len(chapters) < 5:
        return chapters
    keep = []
    for ch in chapters:
        neighbours = sum(
            1
            for other in chapters
            if other is not ch and abs(other["char_offset"] - ch["char_offset"]) < 2000
        )
        if neighbours < 4:
            keep.append(ch)
    return keep


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


def _clean_artifacts(text: str) -> str:
    clean_lines = []
    for line in text.split("\n"):
        line = re.sub(r"\s*\d*\s*https?://\S+", "", line)
        line = re.sub(r"\s*\d*\s*www\.\S+", "", line)
        line = re.sub(r"(?<=\S)\s+\d{1,3}(?=\s|$)", "", line)
        stripped = line.strip()
        if not stripped:
            continue

        if re.search(r"\bISBN[:\s]", stripped, re.IGNORECASE):
            continue

        if re.search(r"©|\(c\)\s*\d{4}|copyright\s+\d{4}", stripped, re.IGNORECASE):
            continue

        if re.search(r"\d{2}::\d{2}|\d{4}::\d{4}", stripped):
            continue

        if re.search(r"([a-z])\1([a-z])\2([a-z])\3", stripped, re.IGNORECASE):
            continue

        if re.match(r"^[_\-=\/\\\.]{4,}$", stripped):
            continue

        clean_lines.append(line)

    return "\n".join(clean_lines)


def detect_chapters(text: str) -> list[dict]:
    chapters: list[dict] = []
    offset = 0

    for raw_line in text.splitlines(keepends=True):
        line = raw_line.strip()
        space_ratio = line.count(" ") / max(len(line), 1)
        if (
            2 <= len(line) <= 120
            and line[-1:] not in ".,;:"
            and not re.search(r"\.{3,}", line)
            and not re.search(r"\s{2,}\d+\s*$", line)
            and space_ratio <= 0.4
            and not re.search(r"\b\w\s[/\'~]\s\w\b", line)
            and not re.search(r"\bISBN[:\s]", line, re.IGNORECASE)
            and not re.match(r"^[\d\s\-:\/\.]+$", line)
            and not re.search(r"https?://|www\.", line, re.IGNORECASE)
            and (
                HEADING_PREFIX.match(line)
                or NUMBERED_HEADING.match(line)
                or (line.isupper() and len(line.split()) <= 8)
                or MARKDOWN_HEADING.match(line)
            )
        ):
            chapters.append({"title": _clean_title(line), "char_offset": offset + raw_line.find(line)})
        offset += len(raw_line)

    chapters = _remove_toc_clusters(chapters)
    return chapters


def extract_pdf_raw(file_bytes: bytes) -> str:
    """Return raw joined page text before cleaning."""
    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    raw = "\n\n".join(pages)
    return _clean_artifacts(raw)


def extract_pdf_text(file_bytes: bytes) -> str:
    text = _clean_text(extract_pdf_raw(file_bytes))
    if not text:
        raise ValueError("No text could be extracted from PDF")
    return text


def extract_url_raw(url: str) -> str:
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError("URL could not be fetched")
    raw = trafilatura.extract(downloaded, include_comments=False, include_tables=False) or ""
    return _clean_artifacts(raw)


def extract_url_text(url: str) -> str:
    text = _clean_text(extract_url_raw(url))
    if not text:
        raise ValueError("No article text could be extracted from URL")
    return text
