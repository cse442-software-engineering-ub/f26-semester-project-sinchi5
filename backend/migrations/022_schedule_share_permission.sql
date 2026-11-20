-- Apply once after 021_schedule_shares.sql on DEV, TEST, and PROD.
-- Card 146: shared course schedules can grant view or edit access.
-- Editors can create and update events, while the course owner keeps ownership.

ALTER TABLE notely_schedule_shares
    ADD COLUMN permission ENUM('view', 'edit') NOT NULL DEFAULT 'view'
    AFTER viewer_user_id;

ALTER TABLE notely_events
    ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL
    AFTER owner_user_id;