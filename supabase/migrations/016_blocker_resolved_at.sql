-- Migration 016: Add resolved_at to board_blockers
ALTER TABLE board_blockers ADD COLUMN resolved_at TIMESTAMPTZ;
