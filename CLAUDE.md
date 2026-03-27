# Compass — Claude Instructions

## Read first, always
Before doing anything, check:
1. `plan.md` — current milestone, objective, constraints, risks
2. `tasks.md` — what's in progress, what's blocked, what's done

## Working rules
- **Do not start coding before confirming the current task from `tasks.md`**
- One task at a time. Mark it `in progress` before starting, `done` when complete.
- Update `notes.md` when you discover something non-obvious (bugs, gotchas, decisions)
- Update `plan.md` when the milestone, constraints, or affected files change
- Keep all three files concise. No filler. Delete stale entries.

## Project: Compass
Focus + productivity tool for small agency teams.
Stack: React + TypeScript + Tailwind + Vite + TanStack Query + Zustand + Supabase.

**Build phases (do not skip ahead):**
1. ✅ Foundation — schema, auth, app shell
2. ✅ Today screen — commitments, quick capture
3. ⬜ Calendar view — day/week/month, activity + focus blocks
4. ⬜ Focus sessions — top bar, timer, pause/resume, restore
5. ⬜ Activity tracking — macOS agent → raw_events → categorized
6. ⬜ Team Pulse — live status, team commitments, execution rate
7. ⬜ Reports — charts, admin table, AI anomaly, Friday digest
8. ⬜ Polish — settings, keyboard shortcuts, error boundaries

## Key constraints (from spec, non-negotiable)
- Desktop only — min width 1024px, no mobile
- Design tokens: use CSS vars from `src/index.css` only — no arbitrary values
- Font sizes: only `--text-xs` through `--text-2xl` — never weight 700+
- No optimistic UI for: focus sessions, activity events, proof uploads, user settings
- Proof upload is a hard gate — cannot mark done without proof URL or image
- All timestamps stored as UTC; convert to local only at display layer
- Never delete raw_events — immutable by design
- All writes go through error handling; on failure: log, toast, retain user input

## Supabase notes
See `notes.md` for manual steps required (migrations, storage bucket, policy fixes).

## Commands
```bash
npm run dev     # dev server → http://localhost:5173
npm run build   # verify TypeScript + build
./cc-yolo       # Claude with bypassed permissions (this repo only)
```
