-- Apply once after 019_rich_notes.sql on DEV, TEST, and PROD, before the code that uses it.
-- ALTER can't be safely run twice. SHOW first: SHOW COLUMNS FROM notely_notes;
-- if event_id is already listed, skip this file.
-- Card 243: a note links to at most one event. event_date is the occurrence of a repeating event.
-- Deleting the event only clears the link (SET NULL); the note keeps its course and lecture date.
ALTER TABLE notely_notes
    ADD COLUMN event_id BIGINT UNSIGNED NULL,
    ADD COLUMN event_date DATE NULL,
    ADD KEY notely_notes_event (owner_user_id, event_id),
    ADD CONSTRAINT notely_notes_event_fk FOREIGN KEY (event_id) REFERENCES notely_events (id) ON DELETE SET NULL;
