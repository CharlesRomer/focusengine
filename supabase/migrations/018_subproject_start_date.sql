-- Migration 018: Add start_date to sub_projects (for timeline span rendering)
ALTER TABLE sub_projects ADD COLUMN IF NOT EXISTS start_date DATE;
