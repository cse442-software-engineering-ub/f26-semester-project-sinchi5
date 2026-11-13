-- Apply once before deploying card 153. One row per pair of students, in either direction.
CREATE TABLE IF NOT EXISTS notely_friendships (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    requester_id BIGINT UNSIGNED NOT NULL,
    addressee_id BIGINT UNSIGNED NOT NULL,
    user_low BIGINT UNSIGNED NOT NULL,
    user_high BIGINT UNSIGNED NOT NULL,
    status ENUM('pending', 'accepted') NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY notely_friendships_pair (user_low, user_high),
    KEY notely_friendships_requester (requester_id),
    KEY notely_friendships_addressee (addressee_id),
    CONSTRAINT notely_friendships_requester_fk FOREIGN KEY (requester_id)
        REFERENCES notely_users (id) ON DELETE CASCADE,
    CONSTRAINT notely_friendships_addressee_fk FOREIGN KEY (addressee_id)
        REFERENCES notely_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
