-- Apply once before deploying card 160. Each account owns at most one photo.
CREATE TABLE IF NOT EXISTS notely_profile_photos (
    user_id BIGINT UNSIGNED NOT NULL,
    mime ENUM('image/png', 'image/jpeg', 'image/webp') NOT NULL,
    data MEDIUMBLOB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    CONSTRAINT notely_profile_photos_user_fk FOREIGN KEY (user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
