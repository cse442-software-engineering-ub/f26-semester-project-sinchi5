<?php
declare(strict_types=1);
// Pure validation checks: no database, GD, or intl.
require_once __DIR__ . '/../lib/security.php';
require_once __DIR__ . '/../lib/profile-photos.php';

function photoChunk(string $type, string $data): string
{
    return pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
}

function photoPng(int $width, int $height): string
{
    return "\x89PNG\r\n\x1a\n" . photoChunk('IHDR', pack('NNCCCCC', $width, $height, 8, 0, 0, 0, 0))
        . photoChunk('IDAT', gzcompress(str_repeat("\0" . str_repeat("\x80", $width), $height)))
        . photoChunk('IEND', '');
}

foreach ([[32, 32], [4096, 32], [32, 4096], [4096, 4096]] as [$width, $height]) {
    $bytes = photoPng($width, $height);
    $photo = validatedProfilePhoto(['content' => base64_encode($bytes)]);
    if ($photo !== ['mime' => 'image/png', 'data' => $bytes]) throw new RuntimeException('Valid boundary rejected.');
}
foreach ([[31, 64], [64, 31], [4097, 64], [64, 4097]] as [$width, $height]) {
    try {
        validatedProfilePhoto(['content' => base64_encode(photoPng($width, $height))]);
        throw new RuntimeException('Invalid dimensions accepted.');
    } catch (HttpError $e) {
        if ($e->status !== 422 || $e->getMessage() !== PROFILE_PHOTO_READ_ERROR) throw $e;
    }
}
// A real ancillary PNG chunk pads a valid image to the exact byte limit.
$png = photoPng(64, 64);
$padding = photoChunk('npAD', str_repeat('x', PROFILE_PHOTO_MAX_BYTES - strlen($png) - 12));
$exact = substr($png, 0, -12) . $padding . substr($png, -12);
if (strlen(validatedProfilePhoto(['content' => base64_encode($exact)])['data']) !== PROFILE_PHOTO_MAX_BYTES) {
    throw new RuntimeException('Exact size limit rejected.');
}
echo "PASS: inclusive photo dimensions and 2 MiB boundary without GD or intl\n";
