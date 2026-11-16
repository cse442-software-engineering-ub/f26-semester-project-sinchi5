-- Apply once after 017_preferences.sql on DEV, TEST, and PROD, before the code that uses it.
-- ALTER can't be safely run twice. SHOW first: SHOW COLUMNS FROM notely_preferences; if custom_themes is already
-- listed, skip this file. Also look at the type of scheme (it is enum('sage','fjord','rose','mocha') until this runs).
-- WP-14 custom themes: up to four per student, stored as JSON; scheme becomes text so it can hold custom:<id>.
ALTER TABLE notely_preferences
    MODIFY COLUMN scheme VARCHAR(40) NOT NULL DEFAULT 'sage',
    ADD COLUMN custom_themes JSON NULL AFTER scheme;
