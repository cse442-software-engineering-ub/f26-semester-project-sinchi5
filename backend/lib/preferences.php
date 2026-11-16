<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

// WP-14: a student's theme choices. The session response carries them (bootstrap.php), so no GET route.
const PREFERENCE_ROUTES = ['preferences'];
const PREFERENCE_MODES = ['system', 'light', 'dark'];
const PREFERENCE_SCHEMES = ['sage', 'fjord', 'rose', 'mocha'];

function preferenceAction(PDO $db, array $config, array $session, array $input): array
{
    $mode = $input['mode'] ?? null;
    $scheme = $input['scheme'] ?? null;
    if (!in_array($mode, PREFERENCE_MODES, true)) {
        throw new HttpError(422, 'Choose system, light, or dark.');
    }
    if (!in_array($scheme, PREFERENCE_SCHEMES, true)) {
        throw new HttpError(422, 'Choose sage, fjord, rose, or mocha.');
    }
    rateLimit($db, $config, 'data-write', (string) $session['user_id'], 1000);
    $user = requireUser($db, $session);
    query($db, 'INSERT INTO notely_preferences (user_id, mode, scheme) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE mode = VALUES(mode), scheme = VALUES(scheme)', [$user['id'], $mode, $scheme]);
    return ['preferences' => ['mode' => $mode, 'scheme' => $scheme]];
}
