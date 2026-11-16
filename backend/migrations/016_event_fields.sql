-- Apply once after 015_courses.sql on DEV, TEST, and PROD, before the code that uses it.
-- ADD COLUMN can't run twice, so check SHOW COLUMNS FROM notely_events first: if description is already
-- there, skip this file.
-- Card 141: hand-made events keep a description and a repeat rule (one row, expanded in the browser).
ALTER TABLE notely_events
    ADD COLUMN description VARCHAR(2000) NOT NULL DEFAULT '' AFTER location,
    ADD COLUMN repeat_rule JSON NULL AFTER description,
    ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;
