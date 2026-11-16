-- Apply once after 017_preferences.sql on DEV, TEST, and PROD, before the code that uses it.
-- ADD COLUMN can't run twice, so check SHOW COLUMNS FROM notely_preferences first: if custom_themes is
-- already there, skip this file.
-- Card 229: a student's own themes (at most four, checked in PHP) live beside their choice, and scheme
-- becomes text so it can also hold "custom:<id>". The four values already stored are kept as they are.
ALTER TABLE notely_preferences
    MODIFY COLUMN scheme VARCHAR(24) NOT NULL DEFAULT 'sage',
    ADD COLUMN custom_themes JSON NULL AFTER scheme;
