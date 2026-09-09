-- =====================================================================
-- Migration: Add source_reference to tasks for auditable schedule imports
-- Phase 5A: AI PDF Schedule Import & Structured Extraction
-- Non-destructive addition of nullable audit traceability field
-- =====================================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_reference TEXT;

COMMENT ON COLUMN tasks.source_reference IS 'Document name, page number, and source snippet citation for AI-imported tasks';
