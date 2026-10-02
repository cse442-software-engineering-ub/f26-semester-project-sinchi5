<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

function requireUser(PDO $db, array $session, bool $lock = false): array
{
    if (!$session['user_id']) {
        throw new HttpError(401, 'Sign in to continue.');
    }
    $user = query($db, 'SELECT * FROM notely_users WHERE id = ?' . ($lock ? ' FOR UPDATE' : ''), [$session['user_id']])->fetch();
    if (!$user) {
        throw new HttpError(401, 'Sign in to continue.');
    }
    // A password change or logout in another request must revoke already-started mutations too.
    $active = query($db, 'SELECT token_hash FROM notely_sessions WHERE token_hash = ? AND user_id = ?
        AND expires_at > UTC_TIMESTAMP() AND last_seen_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)',
        [$session['token_hash'], $user['id']])->fetch();
    if (!$active) {
        throw new HttpError(401, 'Sign in to continue.');
    }
    return $user;
}

function checkCurrentPassword(array $input, array $user): void
{
    $password = field($input, 'currentPassword');
    if (strlen($password) > 72 || str_contains($password, "\0") || !password_verify($password, $user['password_hash'])) {
        throw new HttpError(422, 'Your current password is incorrect.');
    }
}

function accountAction(PDO $db, array $config, array $session, string $route, array $input, string $ip): array
{
    if (in_array($route, ['register', 'login'], true)) {
        rateLimit($db, $config, $route . '-ip', $ip, $route === 'register' ? 10 : 60);
        $email = validEmail(field($input, 'email'));
        $password = field($input, 'password');
        rateLimit($db, $config, $route . '-email', $email, 20);
        if ($session['user_id']) {
            throw new HttpError(409, 'Sign out before using another account.');
        }
        if ($route === 'register') {
            $name = validName(field($input, 'name'));
            validPassword($password);
            $hash = hashPassword($password);
            $recoveryCode = newRecoveryCode();
            $db->beginTransaction();
            try {
                query($db, 'INSERT INTO notely_users (name, email, password_hash, recovery_code_hash) VALUES (?, ?, ?, ?)', [$name, $email, $hash, recoveryHash($recoveryCode)]);
            } catch (PDOException $e) {
                if (($e->errorInfo[1] ?? 0) === 1062) {
                    throw new HttpError(409, 'Unable to create an account with these details. Try signing in or resetting your password.');
                }
                throw $e;
            }
            $userId = $db->lastInsertId();
        } else {
            // Validate the existing hash even if the creation policy changes in the future.
            if ($password === '' || strlen($password) > 72 || str_contains($password, "\0")) {
                throw new HttpError(401, 'Email or password is incorrect.');
            }
            $user = query($db, 'SELECT * FROM notely_users WHERE email = ?', [$email])->fetch();
            // A non-account runs the same expensive hash operation. This value is never a login credential.
            if (!$user) {
                hashPassword($password);
                throw new HttpError(401, 'Email or password is incorrect.');
            }
            if (!password_verify($password, $user['password_hash'])) {
                throw new HttpError(401, 'Email or password is incorrect.');
            }
            $db->beginTransaction();
            $current = query($db, 'SELECT * FROM notely_users WHERE id = ? FOR UPDATE', [$user['id']])->fetch();
            if (!$current || $current['email'] !== $email || !hash_equals($current['password_hash'], $user['password_hash'])) {
                throw new HttpError(401, 'Email or password is incorrect.');
            }
            [$algorithm, $options] = passwordAlgorithm();
            if (password_needs_rehash($current['password_hash'], $algorithm, $options)) {
                query($db, 'UPDATE notely_users SET password_hash = ? WHERE id = ?', [hashPassword($password), $user['id']]);
            }
            $userId = (string) $user['id'];
        }
        $session = newSession($db, $config, $userId, $session);
        $db->commit();
        http_response_code($route === 'register' ? 201 : 200);
        $result = sessionResponse($db, $config, $session);
        if (isset($recoveryCode)) {
            $result['recoveryCode'] = $recoveryCode;
        }
        return $result;
    }

    if ($route === 'reset-password') {
        rateLimit($db, $config, 'reset-ip', $ip, 20);
        $email = validEmail(field($input, 'email'));
        rateLimit($db, $config, 'reset-email', $email, 10);
        $codeHash = recoveryHash(field($input, 'recoveryCode'));
        $password = validPassword(field($input, 'password'));
        $db->beginTransaction();
        $user = query($db, 'SELECT * FROM notely_users WHERE email = ? FOR UPDATE', [$email])->fetch();
        if (!$user || !hash_equals($user['recovery_code_hash'], $codeHash)) {
            throw new HttpError(422, 'Email or recovery code is incorrect.');
        }
        $recoveryCode = newRecoveryCode();
        query($db, 'UPDATE notely_users SET password_hash = ?, recovery_code_hash = ? WHERE id = ?',
            [hashPassword($password), recoveryHash($recoveryCode), $user['id']]);
        query($db, 'DELETE FROM notely_sessions WHERE user_id = ?', [$user['id']]);
        // Recovery ends signed out, including when opened in another account's tab.
        $session = newSession($db, $config, null, $session);
        $db->commit();
        return sessionResponse($db, $config, $session) + ['recoveryCode' => $recoveryCode];
    }

    rateLimit($db, $config, 'account-ip', $ip, 90);
    if ($route === 'logout') {
        if ($session['user_id']) {
            $db->beginTransaction();
            requireUser($db, $session, true);
        }
        $session = newSession($db, $config, null, $session);
        if ($db->inTransaction()) {
            $db->commit();
        }
        return sessionResponse($db, $config, $session);
    }
    if ($session['user_id']) {
        rateLimit($db, $config, 'account-user', (string) $session['user_id'], 20);
    }
    $db->beginTransaction();
    $user = requireUser($db, $session, true);
    if ($route === 'onboarding') {
        query($db, 'UPDATE notely_users SET onboarding_completed = 1 WHERE id = ?', [$user['id']]);
    } elseif ($route === 'profile') {
        $name = validName(field($input, 'name'));
        $email = validEmail(field($input, 'email'));
        if ($email !== $user['email']) {
            checkCurrentPassword($input, $user);
        }
        try {
            query($db, 'UPDATE notely_users SET name = ?, email = ? WHERE id = ?', [$name, $email, $user['id']]);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) === 1062) {
                throw new HttpError(409, 'Unable to save these account details. Try a different email address.');
            }
            throw $e;
        }
        if ($email !== $user['email']) {
            query($db, 'DELETE FROM notely_sessions WHERE user_id = ?', [$user['id']]);
            $session = newSession($db, $config, (string) $user['id']);
        }
    } elseif ($route === 'password') {
        checkCurrentPassword($input, $user);
        $password = validPassword(field($input, 'password'));
        if (password_verify($password, $user['password_hash'])) {
            throw new HttpError(422, 'Choose a different password.');
        }
        query($db, 'UPDATE notely_users SET password_hash = ? WHERE id = ?', [hashPassword($password), $user['id']]);
        query($db, 'DELETE FROM notely_sessions WHERE user_id = ?', [$user['id']]);
        $session = newSession($db, $config, (string) $user['id']);
    } elseif ($route === 'recovery-code') {
        checkCurrentPassword($input, $user);
        $recoveryCode = newRecoveryCode();
        query($db, 'UPDATE notely_users SET recovery_code_hash = ? WHERE id = ?', [recoveryHash($recoveryCode), $user['id']]);
    } elseif ($route === 'delete') {
        checkCurrentPassword($input, $user);
        query($db, 'DELETE FROM notely_users WHERE id = ?', [$user['id']]);
        $session = newSession($db, $config, null);
    }
    $db->commit();
    $result = sessionResponse($db, $config, $session);
    if (isset($recoveryCode)) {
        $result['recoveryCode'] = $recoveryCode;
    }
    return $result;
}
