-- Apply once after 020_note_event_link.sql on DEV, TEST, and PROD, before the code that uses it.
-- Safe to run more than once (CREATE TABLE IF NOT EXISTS).
-- Card 143: one row per course schedule a student shares with one classmate, view only. Deleting the course
-- or either account removes the row.
CREATE TABLE IF NOT EXISTS notely_schedule_shares (
    owner_user_id BIGINT UNSIGNED NOT NULL,
    course_id VARCHAR(64) NOT NULL,
    viewer_user_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (owner_user_id, course_id, viewer_user_id),
    KEY notely_schedule_shares_viewer (viewer_user_id),
    KEY notely_schedule_shares_course (course_id),
    CONSTRAINT notely_schedule_shares_owner_fk FOREIGN KEY (owner_user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE,
    CONSTRAINT notely_schedule_shares_viewer_fk FOREIGN KEY (viewer_user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE,
    CONSTRAINT notely_schedule_shares_course_fk FOREIGN KEY (course_id)
        REFERENCES notely_courses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
