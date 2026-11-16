-- Apply once after 014_profile_photos.sql on DEV, TEST, and PROD, before the code that uses it.
-- Safe to run more than once (CREATE TABLE IF NOT EXISTS); check SHOW TABLES LIKE 'notely_courses' first anyway.
-- Card 141: a student's courses live on the server. The id is the one the browser already made, so notes
-- and course shares that carry it keep working.
CREATE TABLE IF NOT EXISTS notely_courses (
    id VARCHAR(64) NOT NULL,
    owner_user_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    color CHAR(7) NOT NULL,
    term VARCHAR(64) NOT NULL,
    classes_start DATE NULL,
    classes_end DATE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY notely_courses_owner (owner_user_id, created_at),
    CONSTRAINT notely_courses_owner_fk FOREIGN KEY (owner_user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
