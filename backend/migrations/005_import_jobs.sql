-- Apply after 004_server_notes.sql on DEV, TEST, and PROD. Safe to run more than once.
-- Card 43: each syllabus upload becomes an import job that only its owner can read.
-- The uploaded bytes are kept only until the file has been read or its events confirmed.
CREATE TABLE IF NOT EXISTS notely_import_jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    owner_user_id BIGINT UNSIGNED NOT NULL,
    kind ENUM('syllabus') NOT NULL DEFAULT 'syllabus',
    course_id VARCHAR(64) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    file_size INT UNSIGNED NOT NULL,
    file_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    content LONGBLOB NULL,
    state ENUM('queued', 'processing', 'review', 'failed', 'completed') NOT NULL DEFAULT 'queued',
    events MEDIUMTEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY notely_import_jobs_owner (owner_user_id, created_at),
    KEY notely_import_jobs_file (file_sha256),
    CONSTRAINT notely_import_jobs_owner_fk FOREIGN KEY (owner_user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
