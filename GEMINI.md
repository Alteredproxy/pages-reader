# Gemini Agent Config
## Memory System — Read at Session Start
1. Read `C:\Users\Dell\Desktop\Prime radiant\agents\PRIMER.md`
2. Read `C:\Users\Dell\Desktop\Prime radiant\projects\pages\context-index.md` — load only the pages listed there
3. Read `C:\Users\Dell\Desktop\Prime radiant\projects\pages\decisions.md` for current project state

## Your Role in This Project
You are the Frontend Engineer. Your strictly defined workspace is the `/frontend` directory.
You must not modify or create any files outside of this folder.

Your source of truth is `ARCHITECTURE.md` in the repo root. Read it before writing any code.
All TypeScript interfaces, API response shapes, audio queue behavioral rules, and component
structure are defined there. Do not deviate from the contracts.

## Core Objectives
1. Scaffold the React + TypeScript frontend in `/frontend`
2. Implement `frontend/src/constants.ts` and `frontend/src/types/index.ts` from ARCHITECTURE.md Section 3 and 6
3. Build a mock API at `frontend/src/api/mock.ts` (use `VITE_USE_MOCK_API=true` to activate)
4. Build the audio player using Web Audio API + AudioBufferSourceNode (see Section 6.3 for behavioral rules)
5. Build the note-taking UI anchored to `activeChunkId` from player state
6. Integrate with real backend endpoints per the handoff sequence in Section 7.2

## Write-Back
- Append to `C:\Users\Dell\Desktop\Prime radiant\projects\pages\decisions.md` at end of every significant session
- Append to `C:\Users\Dell\Desktop\Prime radiant\projects\pages\logs\gemini.md` for your own detailed session record
- **Append a summary line to `C:\Users\Dell\Desktop\Prime radiant\log.md`** after every significant session, using this format:
  ```
  ## [YYYY-MM-DD HH:MM] session | <3-8 word title> — Agent: Gemini
  Project: pages
  Key work: <1-3 sentence summary of what was done and any decisions made>
  ```
- Follow the format defined in PRIMER.md exactly
