<?php
declare(strict_types=1);
require_once __DIR__ . '/security.php';

function configuration(): array
{
    $path = getenv('NOTELY_CONFIG');
    $config = $path ? require $path : [];
    if (!is_array($config)) {
        throw new RuntimeException('Invalid configuration.');
    }
    $config += [
        'db_name' => getenv('NOTELY_DB_NAME') ?: 'cse442_2026_fall_team_c_db',
        'db_user' => getenv('NOTELY_DB_USER') ?: '',
        'db_password' => getenv('NOTELY_DB_PASSWORD') ?: '',
        'app_key' => getenv('NOTELY_APP_KEY') ?: '',
        'origin' => getenv('NOTELY_ORIGIN') ?: '',
        'cookie_path' => getenv('NOTELY_COOKIE_PATH') ?: '/',
        'secure_cookies' => getenv('NOTELY_ALLOW_LOCAL_HTTP') !== '1',
    ];
    $origin = parse_url($config['origin']);
    if (!$origin || !isset($origin['scheme'], $origin['host'])
        || isset($origin['user']) || isset($origin['pass']) || isset($origin['path'])
        || isset($origin['query']) || isset($origin['fragment'])
        || !preg_match('/^[a-f0-9]{64}$/i', $config['app_key'])
        || !preg_match('~^/[A-Za-z0-9/_-]*$~D', $config['cookie_path'])
        || !preg_match('/^[a-zA-Z0-9_]+$/D', $config['db_name'])
        || $config['db_user'] === '' || $config['db_password'] === '') {
        throw new RuntimeException('Incomplete configuration.');
    }
    if (!$config['secure_cookies']) {
        if ($origin['scheme'] !== 'http' || !in_array($origin['host'], ['localhost', '127.0.0.1', '[::1]'], true)) {
            throw new RuntimeException('HTTP is restricted to local development.');
        }
    } elseif ($origin['scheme'] !== 'https') {
        throw new RuntimeException('HTTPS is required.');
    }
    return $config;
}

function database(array $config): PDO
{
    // Department policy: never accept a remote database host from the client or config.
    $db = new PDO('mysql:host=localhost;dbname=' . $config['db_name'] . ';charset=utf8mb4',
        $config['db_user'], $config['db_password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    $db->exec("SET time_zone = '+00:00'");
    return $db;
}

function query(PDO $db, string $sql, array $parameters = []): PDOStatement
{
    $statement = $db->prepare($sql);
    $statement->execute($parameters);
    return $statement;
}

function rateLimit(PDO $db, array $config, string $scope, string $value, int $limit): void
{
    $window = intdiv(time(), 900) * 900;
    $key = hash_hmac('sha256', $scope . ':' . $value, $config['app_key']);
    // One atomic increment across requests/processes, with a bounded 15-minute window.
    query($db, 'INSERT INTO notely_rate_limits (bucket_hash, window_start, attempts) VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE attempts = IF(window_start = VALUES(window_start), attempts + 1, 1),
        window_start = VALUES(window_start)', [$key, $window]);
    $attempts = query($db, 'SELECT attempts FROM notely_rate_limits WHERE bucket_hash = ?', [$key])->fetchColumn();
    if ((int) $attempts > $limit) {
        header('Retry-After: ' . ($window + 900 - time()));
        throw new HttpError(429, 'Too many attempts. Please try again in 15 minutes.');
    }
}

function cookieName(array $config): string
{
    // Prevent accidental collisions with other student apps on the shared host.
    return 'notely_session_' . substr(hash('sha256', $config['cookie_path']), 0, 12);
}

function sessionCookie(array $config, string $token, bool $clear = false): void
{
    setcookie(cookieName($config), $token, [
        'expires' => $clear ? time() - 3600 : 0,
        'path' => $config['cookie_path'],
        'secure' => (bool) $config['secure_cookies'],
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function readSession(PDO $db, array $config): ?array
{
    $token = $_COOKIE[cookieName($config)] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) {
        return null;
    }
    $session = query($db, 'SELECT * FROM notely_sessions WHERE token_hash = ?
        AND expires_at > UTC_TIMESTAMP() AND last_seen_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)',
        [hash('sha256', $token)])->fetch();
    if (!$session) {
        sessionCookie($config, '', true);
        return null;
    }
    $session['token'] = $token;
    query($db, 'UPDATE notely_sessions SET last_seen_at = UTC_TIMESTAMP() WHERE token_hash = ?', [$session['token_hash']]);
    return $session;
}

function newSession(PDO $db, array $config, ?string $userId, ?array $old = null): array
{
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    query($db, 'INSERT INTO notely_sessions (token_hash, user_id, created_at, last_seen_at, expires_at)
        VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 12 HOUR))', [$hash, $userId]);
    if ($old) {
        query($db, 'DELETE FROM notely_sessions WHERE token_hash = ?', [$old['token_hash']]);
    }
    sessionCookie($config, $token);
    return ['token_hash' => $hash, 'token' => $token, 'user_id' => $userId];
}

function csrfToken(array $session, array $config): string
{
    return hash_hmac('sha256', 'csrf:' . $session['token'], $config['app_key']);
}

function requireCsrf(?array $session, array $config): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$session || !is_string($token) || !hash_equals(csrfToken($session, $config), $token)) {
        throw new HttpError(403, 'Your session changed. Reload the page and try again.');
    }
}

function sessionResponse(PDO $db, array $config, array $session): array
{
    $user = $session['user_id'] ? query($db, 'SELECT id, name, email, onboarding_completed FROM notely_users WHERE id = ?', [$session['user_id']])->fetch() : null;
    return [
        'user' => $user ? publicUser($user) : null,
        'onboarding' => ['completed' => $user ? (bool) $user['onboarding_completed'] : false, 'step' => $user && $user['onboarding_completed'] ? 3 : 0],
        'csrfToken' => csrfToken($session, $config),
    ];
}
