-- Apply once after 018_custom_themes.sql on DEV, TEST, and PROD, before the code that uses it.
-- ALTER can't be safely run twice. SHOW first: SHOW COLUMNS FROM notely_notes; and SHOW COLUMNS FROM notely_note_versions;
-- if body_format is already listed in both, skip this file.
-- Card 240: notes hold cleaned HTML. Old rows keep body_format 'text' and are converted when read; nothing is dropped.
ALTER TABLE notely_notes
    MODIFY COLUMN body MEDIUMTEXT NOT NULL,
    ADD COLUMN body_format ENUM('text','html') NOT NULL DEFAULT 'text' AFTER body,
    ADD COLUMN body_text MEDIUMTEXT NULL AFTER body_format;
ALTER TABLE notely_note_versions
    MODIFY COLUMN body MEDIUMTEXT NOT NULL,
    ADD COLUMN body_format ENUM('text','html') NOT NULL DEFAULT 'text' AFTER body,
    ADD COLUMN body_text MEDIUMTEXT NULL AFTER body_format;
