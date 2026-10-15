<?php
declare(strict_types=1);
// Syllabus reader checks with a fake Claude API: no network, no database, no API credits.
// Run with php backend/tests/syllabus-ai.php
ini_set('memory_limit', '512M');
ini_set('error_log', '/dev/null');
putenv('NOTELY_ANTHROPIC_API_KEY');
putenv('NOTELY_AI_LIVE');
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/notes.php';
require_once __DIR__ . '/../lib/imports.php';
require_once __DIR__ . '/../lib/syllabus-ai.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}
function fails(callable $action, int $status, string $message): void
{
    try {
        $action();
    } catch (HttpError $error) {
        check($error->status === $status && $error->getMessage() === $message,
            "Expected $status \"$message\", got {$error->status} \"{$error->getMessage()}\".");
        return;
    }
    throw new RuntimeException("Expected \"$message\".");
}
// A minimal zip archive, built here so the test needs no zip extension or fixture files.
function zipOf(array $files, bool $deflate = true): string
{
    $body = '';
    $directory = '';
    foreach ($files as $name => $content) {
        $data = $deflate ? gzdeflate($content) : $content;
        $header = pack('vvvvvVVVvv', 20, 0, $deflate ? 8 : 0, 0, 0, crc32($content), strlen($data), strlen($content), strlen($name), 0);
        $directory .= "PK\x01\x02" . pack('v', 20) . $header . pack('vvvVV', 0, 0, 0, 0, strlen($body)) . $name;
        $body .= "PK\x03\x04" . $header . $name . $data;
    }
    return $body . $directory . "PK\x05\x06" . pack('vvvvVVv', 0, 0, count($files), count($files), strlen($directory), strlen($body), 0);
}
// Records each request and answers with the next canned [status, body] reply.
$calls = [];
function fakeApi(array &$calls, array ...$replies): callable
{
    $calls = [];
    return function (string $path, array $body) use (&$calls, &$replies): array {
        $calls[] = [$path, $body];
        return array_shift($replies) ?? throw new RuntimeException('Unexpected extra API request.');
    };
}
$reply = fn (array $events, string $stop = 'end_turn') => [200, ['stop_reason' => $stop, 'usage' => ['input_tokens' => 900, 'output_tokens' => 120],
    'content' => [['type' => 'thinking', 'thinking' => ''], ['type' => 'text', 'text' => json_encode(['events' => $events])]]]];
$events = [
    ['title' => 'Homework 1', 'kind' => 'assignment', 'date' => '2026-09-28', 'time' => '', 'source' => 'Homework 1 due September 28'],
    ['title' => 'Midterm exam', 'kind' => 'exam', 'date' => '2026-10-14', 'time' => '10:00', 'source' => 'Midterm exam October 14, 10 AM'],
];
$pdf = "%PDF-1.7\nsyllabus";
$config = ['origin' => 'https://aptitude.cse.buffalo.edu', 'anthropic_api_key' => 'test-key-never-sent'];

// 1. A PDF is counted for free first, then read once with the default model, low effort, and a schema.
check(readSyllabusWithAi($config, fakeApi($calls, [200, ['input_tokens' => 1200]], $reply($events)), 'pdf', $pdf, 2026) === $events,
    'The events from the reply were not returned.');
[[$countPath, $countBody], [$readPath, $readBody]] = $calls;
check($countPath === 'messages/count_tokens' && !isset($countBody['max_tokens']), 'Tokens must be counted before reading.');
check($readPath === 'messages' && $readBody['model'] === 'claude-opus-5-5' && $readBody['max_tokens'] === 16000, 'Wrong model or limit.');
check($readBody['output_config'] === ['effort' => 'low', 'format' => ['type' => 'json_schema', 'schema' => SYLLABUS_AI_SCHEMA]],
    'The read must use low effort and the events schema.');
check($readBody['fallbacks'] === 'default', 'Opus reads should fall back when a request is refused.');
check($readBody['system'] === SYLLABUS_AI_PROMPT && $readBody['messages'][0]['content'] === [
    ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => base64_encode($pdf)]],
    ['type' => 'text', 'text' => 'Course year: 2026. List the dated events in this syllabus.'],
], 'The PDF and course year were not sent as expected.');
readSyllabusWithAi($config + ['anthropic_model' => 'claude-haiku-5-5'], fakeApi($calls, [200, ['input_tokens' => 10]], $reply([])), 'pdf', $pdf, 2026);
check($calls[1][1]['model'] === 'claude-haiku-5-5' && !isset($calls[1][1]['fallbacks']), 'Haiku has no fallback model.');
echo "PASS 1: a PDF is token-counted, then read once with low effort, the events schema, and the configured model\n";

// 2. Nothing is paid for when the file is too long, and failures or refusals become clear messages.
// Arrow functions copy outer variables, so the fake is made outside them to record into $calls.
$send = fakeApi($calls, [200, ['input_tokens' => 60001]]);
fails(fn () => readSyllabusWithAi($config, $send, 'pdf', $pdf, 2026),
    422, 'This syllabus is too long to read automatically. Upload just the schedule pages.');
check(count($calls) === 1, 'A too-long file must not be sent for reading.');
fails(fn () => readSyllabusWithAi($config + ['ai_max_input_tokens' => 500], fakeApi($calls, [200, ['input_tokens' => 501]]), 'pdf', $pdf, 2026),
    422, 'This syllabus is too long to read automatically. Upload just the schedule pages.');
fails(fn () => readSyllabusWithAi($config, fakeApi($calls, [401, ['error' => []]]), 'pdf', $pdf, 2026), 503, SYLLABUS_AI_UNAVAILABLE);
fails(fn () => readSyllabusWithAi($config, fakeApi($calls, [200, ['input_tokens' => 9]], [529, []]), 'pdf', $pdf, 2026), 503, SYLLABUS_AI_UNAVAILABLE);
foreach (['refusal', 'max_tokens'] as $stop) {
    fails(fn () => readSyllabusWithAi($config, fakeApi($calls, [200, ['input_tokens' => 9]], $reply($events, $stop)), 'pdf', $pdf, 2026),
        422, "We couldn't find events in this file. Try a clearer copy, or a TXT version.");
}
$many = array_merge(['not an event'], array_fill(0, 250, $events[0]));
check(count(readSyllabusWithAi($config, fakeApi($calls, [200, ['input_tokens' => 9]], $reply($many)), 'pdf', $pdf, 2026)) === 200,
    'At most 200 events should be kept.');
echo "PASS 2: too-long files cost nothing, and errors, refusals, and cut-off replies are reported\n";

// 3. Without a key, or from a local origin without NOTELY_AI_LIVE=1, no request can be made.
fails(fn () => liveAnthropic(['origin' => 'https://aptitude.cse.buffalo.edu']),
    503, "Automatic reading isn't set up yet. Upload a TXT or Markdown version of your syllabus.");
foreach (['http://127.0.0.1:5173', 'http://localhost:5173', 'http://[::1]:5173'] as $origin) {
    fails(fn () => liveAnthropic(['origin' => $origin, 'anthropic_api_key' => 'test-key-never-sent']),
        503, 'Automatic reading is off in local development. Set NOTELY_AI_LIVE=1 to allow real API calls.');
}
check(is_callable(liveAnthropic($config)), 'A configured server should get a live client (not called here).');
echo "PASS 3: no key, or a local origin without opting in, blocks every real API call\n";

// 4. DOCX text is read without the zip extension; images keep their type; other files are refused.
$xml = '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Homework 1 due September 28, 2026</w:t></w:r></w:p>'
    . '<w:p><w:r><w:t>Midterm exam</w:t><w:tab/><w:t>October 14 &amp; review</w:t></w:r></w:p></w:body></w:document>';
$text = "Homework 1 due September 28, 2026\nMidterm exam October 14 & review";
foreach ([true, false] as $deflate) {
    check(docxText(zipOf(['[Content_Types].xml' => '<Types/>', 'word/document.xml' => $xml], $deflate)) === $text, 'DOCX text was not read.');
}
check(syllabusBlock('docx', zipOf(['word/document.xml' => $xml])) === ['type' => 'text', 'text' => $text], 'DOCX should be sent as text.');
$unreadable = 'This DOCX file could not be read. Try saving it as a PDF.';
fails(fn () => docxText(zipOf(['word/other.xml' => $xml])), 422, $unreadable);
fails(fn () => docxText("PK\x03\x04 not really a zip"), 422, $unreadable);
fails(fn () => docxText(zipOf(['word/document.xml' => str_repeat('a', 21 * 1024 * 1024)])), 422, $unreadable);
fails(fn () => docxText(zipOf(['word/document.xml' => '<w:document><w:body/></w:document>'])), 422, 'This file has no text to read.');
foreach (['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'] as $type => $media) {
    check(syllabusBlock($type, 'img')['source']['media_type'] === $media, "Wrong media type for $type.");
}
fails(fn () => syllabusBlock('png', str_repeat('a', 5 * 1024 * 1024 + 1)), 422, 'Choose an image smaller than 5 MB, or a PDF.');
fails(fn () => syllabusBlock('txt', 'Quiz 1'), 422, 'TXT and Markdown syllabi are read in your browser.');
echo "PASS 4: DOCX text, image types, size limits, and text files are handled before any request\n";
