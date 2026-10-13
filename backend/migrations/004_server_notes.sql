-- Apply after 003_note_content.sql on DEV, TEST, and PROD.
-- Card 120 moves the rest of a note to the server: its metadata, history, and comments.
-- Run once. ADD COLUMN fails on a second run; the CREATE TABLE statements are safe to repeat.
ALTER TABLE notely_notes
    ADD COLUMN course_id VARCHAR(64) NOT NULL DEFAULT '' AFTER body,
    ADD COLUMN lecture_date DATE NULL AFTER course_id,
    ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'School' AFTER lecture_date,
    ADD COLUMN visibility ENUM('private', 'shared') NOT NULL DEFAULT 'private' AFTER category,
    ADD COLUMN tags VARCHAR(4000) NOT NULL DEFAULT '[]' AFTER visibility,
    ADD COLUMN pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER tags;

CREATE TABLE IF NOT EXISTS notely_note_versions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    note_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    author_name VARCHAR(100) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY notely_note_versions_note (note_id, created_at),
    CONSTRAINT notely_note_versions_note_fk FOREIGN KEY (note_id)
        REFERENCES notely_notes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notely_note_comments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    note_id BIGINT UNSIGNED NOT NULL,
    author_user_id BIGINT UNSIGNED NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY notely_note_comments_note (note_id, created_at),
    KEY notely_note_comments_author (author_user_id),
    CONSTRAINT notely_note_comments_note_fk FOREIGN KEY (note_id)
        REFERENCES notely_notes (id) ON DELETE CASCADE,
    CONSTRAINT notely_note_comments_author_fk FOREIGN KEY (author_user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
