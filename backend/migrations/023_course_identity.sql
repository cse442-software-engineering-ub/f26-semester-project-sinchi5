-- Task 261. Works on MySQL 8 (aptitude, checked 2026-11-20) and MariaDB;
-- the ICU \s class trims Unicode whitespace at both ends.
-- Run this SELECT separately before rollout. Pause course writes and repeat it
-- before applying the ALTER once, after 022 and before deploying courses.php.
SELECT owner_user_id,
       LOWER(REGEXP_REPLACE(code, '^\\s+|\\s+$', '')) COLLATE utf8mb4_bin AS code_key,
       LOWER(REGEXP_REPLACE(term, '^\\s+|\\s+$', '')) COLLATE utf8mb4_bin AS term_key,
       COUNT(*) AS course_count
FROM notely_courses
GROUP BY owner_user_id, code_key, term_key
HAVING COUNT(*) > 1;

-- Any result blocks rollout. Review the affected IDs and their linked records
-- with the team and owners, agree on corrections, then repeat the audit.
-- A collision makes the ALTER fail. No course IDs or display fields are rewritten.
ALTER TABLE notely_courses
    ADD COLUMN code_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
        GENERATED ALWAYS AS (LOWER(REGEXP_REPLACE(code, '^\\s+|\\s+$', ''))) STORED,
    ADD COLUMN term_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
        GENERATED ALWAYS AS (LOWER(REGEXP_REPLACE(term, '^\\s+|\\s+$', ''))) STORED,
    ADD UNIQUE KEY notely_courses_identity (owner_user_id, code_key, term_key);
