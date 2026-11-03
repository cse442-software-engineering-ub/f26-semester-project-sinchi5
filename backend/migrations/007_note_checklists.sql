-- Task #79 / Story #19: persistent ordered checklist JSON for each note.
-- Apply once after 006_events.sql with note writes paused. No destructive changes.
-- Nullable TEXT works on MySQL 5.7 without TEXT defaults; old notes read as [].
-- App validation writes JSON arrays; existing title/body-only history stays unchanged.
ALTER TABLE notely_notes ADD COLUMN checklist TEXT NULL;
