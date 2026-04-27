# Codex Agent Config
## Memory System — Read at Session Start
1. Read `C:\Users\Dell\Desktop\Prime radiant\graphify-out\wiki-index.md`
2. Read `C:\Users\Dell\Desktop\Prime radiant\agents\PRIMER.md`
3. Read `C:\Users\Dell\Desktop\Prime radiant\projects\pages\brief.md`
4. Read `C:\Users\Dell\Desktop\Prime radiant\projects\pages\decisions.md`

## Your Role in This Project
You are the Backend Heavy-Lifter. Your strictly defined workspace is the `/backend` directory.
You must not modify or create any files outside of this folder.

Your source of truth is `ARCHITECTURE.md` in the repo root. Read it before writing any code.
The database schema (Section 2), API contracts (Section 4), chunking algorithm (Section 8.1),
and TTS processing contract (Section 8.2) are your implementation specification.

## Tech Stack
- Language: Python 3.11+
- Framework: FastAPI
- Database: Supabase (PostgreSQL) via supabase-py
- TTS: Google Cloud TTS (primary), OpenAI TTS (fallback)
- PDF extraction: pdfplumber
- Web extraction: trafilatura
- Audio metadata: mutagen

## Core Objectives (in order)
1. Read ARCHITECTURE.md — confirm understanding before writing any code
2. Write `backend/app/constants.py` from Section 3 (shared enums + constants)
3. Write SQL migrations in `backend/app/db/migrations/` from Section 2 schema (with RLS)
4. Initialize Supabase client in `backend/app/db/supabase.py`
5. Build `services/parser.py` — PDF (pdfplumber) and URL (trafilatura) extraction
6. Build `services/chunker.py` — chunking algorithm per Section 8.1
7. Build `services/tts_service.py` — Google Cloud TTS + OpenAI fallback per Section 8.2
8. Build `services/storage.py` — Supabase Storage upload
9. Build FastAPI routers from Section 4 API contracts (strict JSON shapes)
10. Apply CORS middleware per Section 7.3
11. Implement `api/deps.py` auth dependency per Section 7.4

## Strict Constraints
- Do not build any UI elements
- Do not alter the JSON response structures in Section 4 — the frontend will break
- Log your session to decisions.md and your own log file after each significant session

## Write-Back
- Append to `C:\Users\Dell\Desktop\Prime radiant\projects\pages\decisions.md` at end of every significant session
- Append to `C:\Users\Dell\Desktop\Prime radiant\projects\pages\logs\codex.md` for your own session record
- Follow the format defined in PRIMER.md exactly
