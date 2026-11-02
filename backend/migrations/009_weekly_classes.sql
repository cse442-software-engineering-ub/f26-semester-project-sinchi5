-- Apply once after 008_note_highlights.sql on DEV, TEST, and PROD, before the code that uses it.
-- ADD COLUMN can't run twice, so check SHOW COLUMNS FROM notely_events first.
-- Card 47: weekly classes from a syllabus are saved as one row per meeting. series_id ties a class's
-- rows together so they can be deleted at once; location holds the room.
ALTER TABLE notely_events
    MODIFY kind ENUM('lecture', 'assignment', 'quiz', 'exam', 'deadline', 'other', 'recitation', 'lab') NOT NULL,
    ADD COLUMN location VARCHAR(120) NOT NULL DEFAULT '' AFTER event_time,
    ADD COLUMN series_id VARCHAR(40) NULL AFTER location,
    ADD KEY notely_events_series (owner_user_id, series_id);
-- Card 127: a saved read is only reused by the same reader version and course year.
ALTER TABLE notely_import_jobs
    ADD COLUMN reader_key VARCHAR(32) NULL AFTER events;
