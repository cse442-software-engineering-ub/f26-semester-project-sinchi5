-- Card 77: one optional UTC reminder time per note.
-- Apply after 008_note_highlights.sql on DEV, TEST, and PROD.
ALTER TABLE notely_notes
    ADD COLUMN remind_at DATETIME(3) NULL DEFAULT NULL AFTER pinned;
