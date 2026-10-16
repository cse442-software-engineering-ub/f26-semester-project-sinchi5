-- Apply after 001_accounts.sql on DEV, TEST, and PROD.
CREATE TABLE IF NOT EXISTS notely_notes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    owner_user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY notely_notes_owner (owner_user_id),
    CONSTRAINT notely_notes_owner_fk FOREIGN KEY (owner_user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notely_note_editors (
    note_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    permission ENUM('view', 'edit') NOT NULL DEFAULT 'view',
    PRIMARY KEY (note_id, user_id),
    KEY notely_note_editors_user (user_id),
    CONSTRAINT notely_note_editors_note_fk FOREIGN KEY (note_id)
        REFERENCES notely_notes (id) ON DELETE CASCADE,
    CONSTRAINT notely_note_editors_user_fk FOREIGN KEY (user_id)
        REFERENCES notely_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
