-- Task 261. Check SELECT VERSION() first. Tested with MariaDB 10.4;
-- the Unicode whitespace expression uses MariaDB's PCRE support.
-- Run this SELECT separately before rollout. Pause course writes and repeat it
-- before applying the ALTER once, after 022 and before deploying courses.php.
SELECT owner_user_id,
       LOWER(REGEXP_REPLACE(code, '(*UCP)^[[:space:]]+|[[:space:]]+$', '')) COLLATE utf8mb4_bin AS code_key,
       LOWER(REGEXP_REPLACE(term, '(*UCP)^[[:space:]]+|[[:space:]]+$', '')) COLLATE utf8mb4_bin AS term_key,
       COUNT(*) AS course_count
FROM notely_courses
GROUP BY owner_user_id, code_key, term_key
HAVING COUNT(*) > 1;

-- Any result blocks rollout. Review the affected IDs and their linked records
-- with the team and owners, agree on corrections, then repeat the audit.
-- A collision makes the ALTER fail. No course IDs or display fields are rewritten.
ALTER TABLE notely_courses
    ADD COLUMN code_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
        GENERATED ALWAYS AS (LOWER(REGEXP_REPLACE(code, '(*UCP)^[[:space:]]+|[[:space:]]+$', ''))) STORED,
    ADD COLUMN term_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
        GENERATED ALWAYS AS (LOWER(REGEXP_REPLACE(term, '(*UCP)^[[:space:]]+|[[:space:]]+$', ''))) STORED,
    ADD UNIQUE KEY notely_courses_identity (owner_user_id, code_key, term_key);
