-- Apply once after 016_event_fields.sql on DEV, TEST, and PROD, before the code that uses it.
-- Safe to run more than once (CREATE TABLE IF NOT EXISTS); check SHOW TABLES LIKE 'notely_preferences' first anyway.
-- WP-14: a student's theme choices follow them to every browser. No row means the defaults (system, sage).
CREATE TABLE IF NOT EXISTS notely_preferences (
    user_id BIGINT UNSIGNED NOT NULL,
    mode ENUM('system', 'light', 'dark') NOT NULL DEFAULT 'system',
    scheme ENUM('sage', 'fjord', 'rose', 'mocha') NOT NULL DEFAULT 'sage',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    CONSTRAINT notely_preferences_user_fk FOREIGN KEY (user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
