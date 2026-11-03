-- Apply after 005_import_jobs.sql on DEV, TEST, and PROD. Safe to run more than once.
-- Card 47: reviewed syllabus events saved to the student's course schedule.
CREATE TABLE IF NOT EXISTS notely_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    owner_user_id BIGINT UNSIGNED NOT NULL,
    course_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    kind ENUM('lecture', 'assignment', 'quiz', 'exam', 'deadline', 'other') NOT NULL,
    event_date DATE NOT NULL,
    event_time TIME NULL,
    source ENUM('manual', 'imported') NOT NULL,
    import_job_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY notely_events_owner (owner_user_id, course_id, event_date),
    KEY notely_events_job (import_job_id),
    CONSTRAINT notely_events_owner_fk FOREIGN KEY (owner_user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE,
    CONSTRAINT notely_events_job_fk FOREIGN KEY (import_job_id)
        REFERENCES notely_import_jobs (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
