<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

const PROFILE_PHOTO_MAX_BODY = 3 * 1024 * 1024;
const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_PHOTO_SIZE_ERROR = 'Profile pictures can be at most 2 MB.';
const PROFILE_PHOTO_READ_ERROR = 'This image could not be read. Try another file.';

function validatedProfilePhoto(array $input): array
{
    $content = $input['content'] ?? null;
    if (!is_string($content) || $content === '') {
        throw new HttpError(422, PROFILE_PHOTO_READ_ERROR);
    }
    $data = base64_decode($content, true);
    if ($data === false || $data === '') {
        throw new HttpError(422, PROFILE_PHOTO_READ_ERROR);
    }
    // Check decoded size before inspecting its format, including padded image files.
    if (strlen($data) > PROFILE_PHOTO_MAX_BYTES) {
        throw new HttpError(413, PROFILE_PHOTO_SIZE_ERROR);
    }
    $mime = match (true) {
        str_starts_with($data, "\x89PNG\r\n\x1a\n") => 'image/png',
        str_starts_with($data, "\xff\xd8\xff") => 'image/jpeg',
        str_starts_with($data, 'RIFF') && substr($data, 8, 4) === 'WEBP' => 'image/webp',
        default => null,
    };
    if ($mime === null) {
        throw new HttpError(422, 'Choose a PNG, JPEG, or WebP image.');
    }
    // Malformed headers can emit warnings; never leak these into API responses.
    $image = @getimagesizefromstring($data);
    if (!$image || ($image['mime'] ?? '') !== $mime
        || $image[0] < 32 || $image[0] > 4096 || $image[1] < 32 || $image[1] > 4096) {
        throw new HttpError(422, PROFILE_PHOTO_READ_ERROR);
    }
    return ['mime' => $mime, 'data' => $data];
}

function profilePhotoAction(PDO $db, array $config, array $session, string $route, array $input): array
{
    $photo = $route === 'profile-photo' ? validatedProfilePhoto($input) : null;
    $db->beginTransaction();
    // Serialize with logout, account deletion, and other account mutations.
    $user = requireUser($db, $session, true);
    if ($photo) {
        query($db, 'INSERT INTO notely_profile_photos (user_id, mime, data) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data), updated_at = CURRENT_TIMESTAMP',
            [$user['id'], $photo['mime'], $photo['data']]);
    } else {
        query($db, 'DELETE FROM notely_profile_photos WHERE user_id = ?', [$user['id']]);
    }
    $db->commit();
    return sessionResponse($db, $config, $session);
}

function serveProfilePhoto(PDO $db, array $session): void
{
    $user = requireUser($db, $session);
    $photo = query($db, 'SELECT mime, data FROM notely_profile_photos WHERE user_id = ?', [$user['id']])->fetch();
    if (!$photo) {
        throw new HttpError(404, 'No profile photo yet.');
    }
    header('Content-Type: ' . $photo['mime']);
    header('Content-Disposition: inline');
    header('Cache-Control: private, no-cache');
    header('X-Content-Type-Options: nosniff');
    echo $photo['data'];
    // Stop the JSON response path from appending anything to the image bytes.
    exit;
}
