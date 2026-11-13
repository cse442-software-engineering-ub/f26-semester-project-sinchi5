-- Apply once before deploying card 156 (after 012_friends.sql). One row per course a student shares with
-- one friend. Courses live in the browser, so the course code is stored here for the friend's "From" line.
CREATE TABLE IF NOT EXISTS notely_course_note_shares (
    owner_user_id BIGINT UNSIGNED NOT NULL,
    course_id VARCHAR(64) NOT NULL,
    course_code VARCHAR(64) NOT NULL,
    friend_user_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (owner_user_id, course_id, friend_user_id),
    KEY notely_course_note_shares_friend (friend_user_id),
    CONSTRAINT notely_course_note_shares_owner_fk FOREIGN KEY (owner_user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE,
    CONSTRAINT notely_course_note_shares_friend_fk FOREIGN KEY (friend_user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
