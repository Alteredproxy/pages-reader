# Pages

Audio reading app with chapter-anchored notes. Drop in a PDF or paste a URL, and Pages chunks it, generates TTS audio (Google Cloud Chirp 3 HD), and plays it back gaplessly while letting you take notes anchored to the exact paragraph being spoken.

## Features

- **PDF + URL ingest** — `pdfplumber` for PDFs, `trafilatura` for web articles
- **Chapter-aware chunking** — chapters are auto-detected, the title is its own chunk, and no chunk spans a chapter boundary
- **Google Cloud TTS** — Chirp 3 HD (Pulcherrima default; voice configurable), LINEAR16/WAV at 24 kHz
- **Backend pause/resume** for generation, so you can cap TTS spend mid-run
- **Gapless audio playback** via Web Audio API, with chunk and chapter navigation
- **Notes anchored to chunks + chapters** — saves the exact ms-offset into a chunk, displayed with chapter context
- **Light/dark themes** — academic minimal in light, warm amber accent in dark

## Stack

- **Backend:** FastAPI (Python 3.11+), Supabase (Postgres + Auth + Storage), Google Cloud Text-to-Speech
- **Frontend:** React + TypeScript + Vite, Web Audio API
- **Auth:** Supabase Auth (JWT)

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) — the source-of-truth contract for the DB schema, REST API endpoints, TypeScript interfaces, audio queue behavioral rules, and the chunking algorithm.

## Running locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Supabase project (free tier works)
- A Google Cloud project with the Text-to-Speech API enabled and a service account JSON key

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Fill in:
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
#   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json
#   FRONTEND_URL=http://localhost:5173
```

Apply the SQL migrations in order in the Supabase SQL editor:

1. `backend/app/db/migrations/001_initial_schema.sql`
2. `backend/app/db/migrations/002_chapters.sql`
3. `backend/app/db/migrations/003_generation_status.sql`

Then start the server:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Fill in:
#   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
#   VITE_API_BASE_URL=http://localhost:8000
#   VITE_USE_MOCK_API=false
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

## Tests

```bash
cd backend && python -m pytest tests/
cd frontend && npm run build   # tsc + vite build, no separate test suite yet
```

## License

[MIT](LICENSE) — do what you want with it.
