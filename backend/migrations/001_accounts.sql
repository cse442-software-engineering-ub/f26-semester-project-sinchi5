-- Apply independently to DEV, aptitude (TEST), and cattle (PROD).
-- MySQL 5.7+/8 and MariaDB 10.2+. All timestamps are UTC.
CREATE TABLE IF NOT EXISTS notely_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recovery_code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    onboarding_completed TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY notely_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notely_sessions (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL,
    last_seen_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    PRIMARY KEY (token_hash),
    KEY notely_sessions_user (user_id),
    KEY notely_sessions_expiry (expires_at),
    CONSTRAINT notely_sessions_user_fk FOREIGN KEY (user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notely_rate_limits (
    bucket_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    window_start BIGINT UNSIGNED NOT NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (bucket_hash),
    KEY notely_rate_limits_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
