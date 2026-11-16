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
const THEME_COLOR_ERROR = 'Use a color like #1a2b3c for the accent, background, and text.';

// The saved choices as the client sees them; no row means the defaults.
function preferencesFor(PDO $db, int $userId): array
{
    $row = query($db, 'SELECT mode, scheme, custom_themes FROM notely_preferences WHERE user_id = ?', [$userId])->fetch();
    $themes = $row && $row['custom_themes'] ? json_decode($row['custom_themes'], true) : [];
    return ['mode' => $row['mode'] ?? 'system', 'scheme' => $row['scheme'] ?? 'sage', 'customThemes' => is_array($themes) ? array_values($themes) : []];
}

function preferenceAction(PDO $db, array $config, array $session, string $route, array $input): array
{
    rateLimit($db, $config, 'data-write', (string) $session['user_id'], 1000);
    $user = requireUser($db, $session);
    if ($route === 'theme-save' || $route === 'theme-delete') {
        return themeAction($db, (int) $user['id'], $route, $input);
    }
    $mode = $input['mode'] ?? null;
    $scheme = $input['scheme'] ?? null;
    if (!in_array($mode, PREFERENCE_MODES, true)) {
        throw new HttpError(422, 'Choose system, light, or dark.');
    }
    $owned = array_column(preferencesFor($db, (int) $user['id'])['customThemes'], 'id');
    $isOwnCustom = is_string($scheme) && str_starts_with($scheme, 'custom:') && in_array(substr($scheme, 7), $owned, true);
    if (!in_array($scheme, PREFERENCE_SCHEMES, true) && !$isOwnCustom) {
        throw new HttpError(422, 'Choose sage, fjord, rose, or mocha.');
    }
    query($db, 'INSERT INTO notely_preferences (user_id, mode, scheme) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE mode = VALUES(mode), scheme = VALUES(scheme)', [$user['id'], $mode, $scheme]);
    return ['preferences' => preferencesFor($db, (int) $user['id'])];
}

function themeAction(PDO $db, int $userId, string $route, array $input): array
{
    $id = $input['id'] ?? null;
    $idOk = is_string($id) && preg_match('/^[0-9a-f]{16}$/D', $id) === 1;
    if ($route === 'theme-delete' && !$idOk) {
        throw new HttpError(422, 'Choose a theme to delete.');
    }
    if ($route === 'theme-save' && $id !== null && !$idOk) {
        throw new HttpError(422, 'Choose one of your own themes to change.');
    }
    $theme = null;
    if ($route === 'theme-save') {
        $theme = ['id' => $id, 'name' => visibleText($input['name'] ?? null, 30, 'Enter a theme name of 1 to 30 visible characters.')];
        foreach (['accent', 'background', 'text'] as $key) {
            $color = is_string($input[$key] ?? null) ? strtolower($input[$key]) : '';
            if (!preg_match('/^#[0-9a-f]{6}$/D', $color)) {
                throw new HttpError(422, THEME_COLOR_ERROR);
            }
            $theme[$key] = $color;
        }
    }
    // The row is locked so two saves at once cannot both pass the cap of four.
    $db->beginTransaction();
    try {
        query($db, 'INSERT IGNORE INTO notely_preferences (user_id) VALUES (?)', [$userId]);
        $row = query($db, 'SELECT scheme, custom_themes FROM notely_preferences WHERE user_id = ? FOR UPDATE', [$userId])->fetch();
        $themes = $row['custom_themes'] ? json_decode($row['custom_themes'], true) : [];
        $themes = is_array($themes) ? array_values($themes) : [];
        $at = $id === null ? false : array_search($id, array_column($themes, 'id'), true);
        $scheme = $row['scheme'];
        if ($route === 'theme-delete') {
            if ($at === false) {
                throw new HttpError(404, 'That theme was not found.');
            }
            array_splice($themes, $at, 1);
            if ($scheme === 'custom:' . $id) {
                $scheme = 'sage';
            }
        } elseif ($id !== null) {
            if ($at === false) {
                throw new HttpError(404, 'That theme was not found.');
            }
            $themes[$at] = $theme;
        } else {
            if (count($themes) >= MAX_CUSTOM_THEMES) {
                throw new HttpError(422, 'You can save up to 4 themes. Delete one to add another.');
            }
            $theme['id'] = bin2hex(random_bytes(8));
            $themes[] = $theme;
        }
        query($db, 'UPDATE notely_preferences SET scheme = ?, custom_themes = ? WHERE user_id = ?', [$scheme, json_encode($themes), $userId]);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    return ['preferences' => preferencesFor($db, $userId)];
}
