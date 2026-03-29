-- Migration 015: Add proof_url to sub_project_tasks
ALTER TABLE sub_project_tasks ADD COLUMN proof_url TEXT;
