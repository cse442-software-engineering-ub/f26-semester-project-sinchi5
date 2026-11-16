<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

// WP-14: a student's theme choices. The session response carries them (bootstrap.php), so no GET route.
const PREFERENCE_ROUTES = ['preferences', 'theme-save', 'theme-delete'];
const PREFERENCE_MODES = ['system', 'light', 'dark'];
const PREFERENCE_SCHEMES = ['sage', 'fjord', 'rose', 'mocha'];
const MAX_CUSTOM_THEMES = 4;

// No saved row means the defaults. $lock keeps two saves by one student from overwriting each other.
function preferencesFor(PDO $db, mixed $userId, bool $lock = false): array
{
    $row = query($db, 'SELECT mode, scheme, custom_themes FROM notely_preferences WHERE user_id = ?' . ($lock ? ' FOR UPDATE' : ''), [$userId])->fetch();
    return ['mode' => $row['mode'] ?? 'system', 'scheme' => $row['scheme'] ?? 'sage',
        'customThemes' => json_decode($row['custom_themes'] ?? '[]', true) ?: []];
}

// Card 229: these values end up in CSS, so only "#" and six hex digits may ever be stored.
function themeColor(array $input, string $key): string
{
    $value = $input[$key] ?? null;
    if (!is_string($value) || !preg_match('/^#[0-9a-f]{6}$/D', strtolower($value))) {
        throw new HttpError(422, 'Colors must look like #1a2b3c.');
    }
    return strtolower($value);
}

function preferenceAction(PDO $db, array $config, array $session, string $route, array $input): array
{
    $id = $input['id'] ?? null;
    if ($route === 'preferences') {
        if (!in_array($input['mode'] ?? null, PREFERENCE_MODES, true)) {
            throw new HttpError(422, 'Choose system, light, or dark.');
        }
    } elseif ($route === 'theme-save') {
        $theme = ['name' => visibleText($input['name'] ?? null, 30, 'Give the theme a name of 1 to 30 characters.'),
            'accent' => themeColor($input, 'accent'), 'background' => themeColor($input, 'background'), 'text' => themeColor($input, 'text')];
    } elseif ($id === null) {
        throw new HttpError(404, 'This theme was not found.');
    }
    rateLimit($db, $config, 'data-write', (string) $session['user_id'], 1000);
    $user = requireUser($db, $session);
    query($db, 'INSERT IGNORE INTO notely_preferences (user_id) VALUES (?)', [$user['id']]);
    $db->beginTransaction();
    $now = preferencesFor($db, $user['id'], true);
    $ids = array_column($now['customThemes'], 'id');
    if ($route === 'preferences') {
        $scheme = $input['scheme'] ?? null;
        $own = is_string($scheme) && str_starts_with($scheme, 'custom:') && in_array(substr($scheme, 7), $ids, true);
        if (!$own && !in_array($scheme, PREFERENCE_SCHEMES, true)) {
            throw new HttpError(422, 'Choose sage, fjord, rose, or mocha.');
        }
        [$now['mode'], $now['scheme']] = [$input['mode'], $scheme];
    } else {
        // Only this student's own themes are searched, so another student's id is simply not found.
        $at = $id === null ? false : array_search($id, $ids, true);
        if ($id !== null && $at === false) {
            throw new HttpError(404, 'This theme was not found.');
        }
        if ($route === 'theme-delete') {
            array_splice($now['customThemes'], $at, 1);
            if ($now['scheme'] === 'custom:' . $id) $now['scheme'] = 'sage';
        } elseif ($at !== false) {
            $now['customThemes'][$at] = ['id' => $id] + $theme;
        } elseif (count($ids) >= MAX_CUSTOM_THEMES) {
            throw new HttpError(422, 'You can save up to four themes. Delete one to add another.');
        } else {
            $now['customThemes'][] = ['id' => bin2hex(random_bytes(4))] + $theme;
        }
    }
    query($db, 'UPDATE notely_preferences SET mode = ?, scheme = ?, custom_themes = ? WHERE user_id = ?',
        [$now['mode'], $now['scheme'], json_encode($now['customThemes'], JSON_THROW_ON_ERROR), $user['id']]);
    $db->commit();
    return ['preferences' => $now];
}
