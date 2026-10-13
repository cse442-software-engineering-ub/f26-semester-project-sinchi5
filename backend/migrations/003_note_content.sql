-- Apply after 002_note_titles.sql on DEV, TEST, and PROD.
-- TEXT defaults are unsupported by MySQL 5.7; creation supplies an empty body.
ALTER TABLE notely_notes ADD COLUMN body TEXT NULL AFTER title;
UPDATE notely_notes SET body = '' WHERE body IS NULL;
ALTER TABLE notely_notes MODIFY COLUMN body TEXT NOT NULL;
