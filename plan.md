# Compass — Current Plan

## Milestone
Phase 2 complete → Phase 3 (Calendar View)

## Objective
Build a focus + productivity tool for small agency teams.
Personal layer: daily commitments, focus sessions, time tracking.
Team layer: live pulse, execution rate, weekly digest.

## Constraints
- Desktop only (min 1024px), no mobile
- Supabase as sole backend (no separate API server)
- macOS agent for activity tracking (Python, pyobjc)
- Stack: React + TypeScript + Tailwind + Vite + TanStack Query + Zustand

## Success criteria (Phase 2 — current)
- [x] Commitments: add, mark done with proof, mark incomplete with reason
- [x] Quick capture: type + Enter, timestamped list
- [x] Auth persists across page refresh
- [x] Users without a team are routed back to team setup
- [ ] Proof image upload to Supabase Storage confirmed working
- [ ] All empty/loading/error states present

## Affected files / systems
- `src/hooks/useCommitments.ts` — CRUD + optimistic updates
- `src/hooks/useQuickCaptures.ts` — quick capture write
- `src/components/commitments/` — CommitmentList, CommitmentItem, ProofUpload
- `src/store/auth.ts` — persist middleware
- `supabase/migrations/001_initial_schema.sql` — teams, RLS
- `supabase/storage` — proof-uploads bucket (must be created manually)

## Risks / gotchas
- `team_org_id` is null for users who hit the RLS error during onboarding → guarded now
- Supabase SELECT after INSERT fails when SELECT policy uses `get_my_team_org_id()` and team_org_id is null → fixed by generating UUID client-side
- React StrictMode runs effects twice — auth subscription must tolerate double-mount
- `onAuthStateChange` fires INITIAL_SESSION once per client instance — second mount in StrictMode may miss it; Zustand persist solves this

## Decisions made
- Zustand persist for auth: user stored in localStorage so refresh doesn't sign out
- Client-side UUID for team creation: avoids SELECT-after-INSERT RLS issue
- No spinner on refresh if user is persisted: immediate render
