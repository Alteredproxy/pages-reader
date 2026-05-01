from io import BytesIO

import pdfplumber
import trafilatura


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


def extract_pdf_text(file_bytes: bytes) -> str:
    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    text = _clean_text("\n\n".join(pages))
    if not text:
        raise ValueError("No text could be extracted from PDF")
    return text


def extract_url_text(url: str) -> str:
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError("URL could not be fetched")
    extracted = trafilatura.extract(downloaded, include_comments=False, include_tables=False)
    text = _clean_text(extracted or "")
    if not text:
        raise ValueError("No article text could be extracted from URL")
    return text
