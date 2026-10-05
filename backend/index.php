<?php
declare(strict_types=1);
// This is the only public PHP entry point. Never return stack traces or SQL errors.
ini_set('display_errors', '0');
ini_set('zend.exception_ignore_args', '1');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
define('NOTELY_INTERNAL', true);
require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/accounts.php';
require_once __DIR__ . '/lib/notes.php';

try {
    $config = configuration();
    if ($config['secure_cookies'] && ($_SERVER['HTTPS'] ?? '') !== 'on' && ($_SERVER['SERVER_PORT'] ?? '') !== '443') {
        throw new HttpError(400, 'Use HTTPS to access your account.');
    }
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $route = $_GET['route'] ?? 'session';
    $routes = ['session', 'register', 'login', 'logout', 'onboarding', 'profile', 'password', 'delete', 'reset-password', 'recovery-code', ...NOTE_ROUTES];
    if (!is_string($route) || !in_array($route, $routes, true)) {
        throw new HttpError(404, 'This action was not found.');
    }
    $expected = in_array($route, ['session', ...NOTE_READ_ROUTES], true) ? 'GET' : 'POST';
    if ($method !== $expected) {
        header('Allow: ' . $expected);
        throw new HttpError(405, 'This request method is not supported.');
    }
    $input = [];
    if ($method === 'POST') {
        if (($_SERVER['HTTP_ORIGIN'] ?? '') !== $config['origin']) {
            throw new HttpError(403, 'This request did not come from your workspace.');
        }
        if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
            throw new HttpError(415, 'Send requests as JSON.');
        }
        // Cap reads even when the client omits or lies about Content-Length.
        $body = file_get_contents('php://input', false, null, 0, 8193);
        if ($body === false || strlen($body) > 8192) {
            throw new HttpError(413, 'This request is too large.');
        }
        try {
            $decoded = json_decode($body, false, 16, JSON_THROW_ON_ERROR);
            if (!$decoded instanceof stdClass) {
                throw new JsonException();
            }
            $input = (array) $decoded;
        } catch (JsonException $e) {
            throw new HttpError(400, 'Send a valid JSON object.');
        }
    }
    $db = database($config);
    // Never trust client-supplied forwarding headers for throttling.
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $session = readSession($db, $config);
    if (in_array($route, ['onboarding', 'profile', 'password', 'delete', 'recovery-code', ...NOTE_ROUTES], true)
        && (!$session || !$session['user_id'])) {
        throw new HttpError(401, 'Sign in to continue.');
    }
    if ($route === 'session') {
        if (!$session) {
            rateLimit($db, $config, 'new-session', $ip, 120);
            $session = newSession($db, $config, null);
        }
        $result = sessionResponse($db, $config, $session);
    } elseif (in_array($route, NOTE_ROUTES, true)) {
        if ($method === 'POST') requireCsrf($session, $config);
        $result = noteAction($db, $session, $route, $input, $config);
    } else {
        requireCsrf($session, $config);
        $result = accountAction($db, $config, $session, $route, $input, $ip);
    }
    echo json_encode($result, JSON_THROW_ON_ERROR);
} catch (HttpError $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    http_response_code($e->status);
    echo json_encode(['error' => $e->getMessage()]);
} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    // No exception message, request body, password, token, address, or credentials in logs.
    error_log('Notely account service failure (' . get_class($e) . ').');
    http_response_code(503);
    echo json_encode(['error' => 'The account service is unavailable. Please try again later.']);
}
