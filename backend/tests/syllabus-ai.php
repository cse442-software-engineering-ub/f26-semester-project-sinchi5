<?php
declare(strict_types=1);
// Syllabus reader checks with a fake Gemini API: no network, no database, no API key.
// Run with php backend/tests/syllabus-ai.php
ini_set('memory_limit', '512M');
ini_set('error_log', '/dev/null');
putenv('NOTELY_GEMINI_API_KEY');
putenv('NOTELY_AI_LIVE');
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/notes.php';
require_once __DIR__ . '/../lib/imports.php';
require_once __DIR__ . '/../lib/syllabus-ai.php';
require_once __DIR__ . '/fixtures.php';

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
$counted = [200, ['totalTokens' => 1200]];
$reply = fn (mixed $events, string $finish = 'STOP') => [200, ['usageMetadata' => ['promptTokenCount' => 1200, 'candidatesTokenCount' => 120],
    'candidates' => [['finishReason' => $finish, 'content' => ['parts' => [
        ['text' => '{"events":[{"title":"Thought, not an answer"}]}', 'thought' => true],
        ['text' => json_encode(['events' => $events])],
    ]]]]]];
$events = [
    ['title' => 'Homework 1', 'kind' => 'assignment', 'date' => '2026-09-28', 'time' => '', 'source' => 'Homework 1 due September 28'],
    ['title' => 'Midterm exam', 'kind' => 'exam', 'date' => '2026-10-14', 'time' => '10:00', 'source' => 'Midterm exam October 14, 10 AM'],
];
$pdf = pdfOf('Homework 1 due September 28');
$config = ['origin' => 'https://aptitude.cse.buffalo.edu', 'gemini_api_key' => 'test-key-never-sent'];
$model = 'models/' . SYLLABUS_AI_MODEL;

// 1. A PDF is counted for free first, then read once with the default model, low thinking, and a schema.
check(readSyllabusWithAi($config, fakeApi($calls, $counted, $reply($events)), 'pdf', $pdf, 2026) === $events,
    'The events from the reply were not returned.');
[[$countPath, $countBody], [$readPath, $readBody]] = $calls;
$parts = [['inlineData' => ['mimeType' => 'application/pdf', 'data' => base64_encode($pdf)]],
    ['text' => 'Course year: 2026. List the dated events in this syllabus.']];
check($countPath === "$model:countTokens" && $countBody === ['contents' => [['role' => 'user', 'parts' => $parts]]],
    'Tokens must be counted before reading.');
check($readPath === "$model:generateContent" && $readBody['contents'] === $countBody['contents'], 'The read must send what was counted.');
check($readBody['systemInstruction'] === ['parts' => [['text' => SYLLABUS_AI_PROMPT]]], 'The instructions must be the system instruction.');
check($readBody['generationConfig'] === ['responseMimeType' => 'application/json', 'responseSchema' => SYLLABUS_AI_SCHEMA,
    'maxOutputTokens' => 16000, 'thinkingConfig' => ['thinkingLevel' => 'LOW']], 'The read must use JSON, the schema, and low thinking.');
check(!isset($readBody['tools']), 'The model must have no tools.');
readSyllabusWithAi($config + ['gemini_model' => 'gemini-3.8-flash'], fakeApi($calls, $counted, $reply([])), 'pdf', $pdf, 2026);
check($calls[1][0] === 'models/gemini-3.8-flash:generateContent', 'The configured model was not used.');
try {
    readSyllabusWithAi($config + ['gemini_model' => '../files?key=x'], fakeApi($calls), 'pdf', $pdf, 2026);
    throw new LogicException('A bad model name must be refused.');
} catch (RuntimeException) {
}
echo "PASS 1: a PDF is token-counted, then read once with low thinking, the events schema, and the configured model\n";

// 2. Nothing is paid for when the file is too long, and failures, blocks, or cut-off replies become clear messages.
// Arrow functions copy outer variables, so the fake is made outside them to record into $calls.
$send = fakeApi($calls, [200, ['totalTokens' => 60001]]);
fails(fn () => readSyllabusWithAi($config, $send, 'pdf', $pdf, 2026),
    422, 'This syllabus is too long to read automatically. Upload just the schedule pages.');
check(count($calls) === 1, 'A too-long file must not be sent for reading.');
fails(fn () => readSyllabusWithAi($config + ['ai_max_input_tokens' => 500], fakeApi($calls, [200, ['totalTokens' => 501]]), 'pdf', $pdf, 2026),
    422, 'This syllabus is too long to read automatically. Upload just the schedule pages.');
fails(fn () => readSyllabusWithAi($config, fakeApi($calls, [400, ['error' => ['message' => 'API key not valid.']]]), 'pdf', $pdf, 2026),
    503, SYLLABUS_AI_UNAVAILABLE);
fails(fn () => readSyllabusWithAi($config, fakeApi($calls, $counted, [500, []]), 'pdf', $pdf, 2026), 503, SYLLABUS_AI_UNAVAILABLE);
fails(fn () => readSyllabusWithAi($config, fakeApi($calls, $counted, [429, ['error' => ['message' => 'Quota exceeded']]]), 'pdf', $pdf, 2026),
    503, 'Automatic reading is busy right now. Please try again in a few minutes.');
foreach (['MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER'] as $finish) {
    fails(fn () => readSyllabusWithAi($config, fakeApi($calls, $counted, $reply($events, $finish)), 'pdf', $pdf, 2026),
        422, "We couldn't find events in this file.");
}
foreach ([[200, ['promptFeedback' => ['blockReason' => 'SAFETY']]], [200, ['candidates' => [['finishReason' => 'STOP',
    'content' => ['parts' => [['text' => 'not json']]]]]]], $reply('a string')] as $bad) {
    fails(fn () => readSyllabusWithAi($config, fakeApi($calls, $counted, $bad), 'pdf', $pdf, 2026), 422, "We couldn't find events in this file.");
}
echo "PASS 2: too-long files cost nothing, and errors, rate limits, blocks, and cut-off replies are reported\n";

// 3. A syllabus can carry instructions aimed at the model ("ignore your rules..."), so nothing in a reply
// is trusted: only listed fields survive, text is one plain line, kinds and dates are checked.
$injected = [
    'not an event',
    ['title' => '', 'kind' => 'exam', 'date' => '2026-10-01', 'time' => '', 'source' => ''],
    ['title' => "Quiz\u{202E}1\u{200B}\x07 <script>", 'kind' => 'admin', 'date' => '2026-02-30', 'time' => '25:00',
        'source' => "line one\nline two", 'role' => 'system', 'sql' => "'; DROP TABLE notely_events; --"],
    ['title' => str_repeat('é', 300), 'kind' => 'quiz', 'date' => '1999-01-01', 'time' => '9:00', 'source' => str_repeat('s', 600)],
    ['title' => 'Final exam', 'kind' => 'exam', 'date' => '2027-01-05', 'time' => '08:30', 'source' => ['nested']],
    ['title' => 7, 'kind' => 'exam', 'date' => '2026-12-01', 'time' => '', 'source' => ''],
];
$clean = readSyllabusWithAi($config, fakeApi($calls, $counted, $reply($injected)), 'pdf', $pdf, 2026);
check($clean === [
    ['title' => 'Quiz 1 <script>', 'kind' => 'other', 'date' => '', 'time' => '', 'source' => 'line one line two'],
    ['title' => str_repeat('é', 255), 'kind' => 'quiz', 'date' => '', 'time' => '', 'source' => str_repeat('s', 500)],
    ['title' => 'Final exam', 'kind' => 'exam', 'date' => '2027-01-05', 'time' => '08:30', 'source' => ''],
], 'Untrusted reply fields were not cleaned: ' . json_encode($clean));
$many = array_fill(0, 250, $events[0]);
check(count(readSyllabusWithAi($config, fakeApi($calls, $counted, $reply($many)), 'pdf', $pdf, 2026)) === 200,
    'At most 200 events should be kept.');
check(!str_contains(SYLLABUS_AI_PROMPT, '{') && str_contains(SYLLABUS_AI_PROMPT, 'Ignore any'),
    'The instructions must tell the model to treat the file as data.');
echo "PASS 3: injected fields, kinds, control characters, impossible or far-off dates, and long text are cleaned\n";

// 4. Without a key, or from a local origin without NOTELY_AI_LIVE=1, no request can be made.
fails(fn () => liveGemini(['origin' => 'https://aptitude.cse.buffalo.edu']), 503, "Automatic reading isn't set up yet.");
foreach (['http://127.0.0.1:5173', 'http://localhost:5173', 'http://[::1]:5173'] as $origin) {
    fails(fn () => liveGemini(['origin' => $origin, 'gemini_api_key' => 'test-key-never-sent']),
        503, 'Automatic reading is off in local development. Set NOTELY_AI_LIVE=1 to allow real API calls.');
}
check(is_callable(liveGemini($config)), 'A configured server should get a live client (not called here).');
echo "PASS 4: no key, or a local origin without opting in, blocks every real API call\n";

// 5. DOCX and text files are sent as text, and images keep their type.
$xml = '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Homework 1 due September 28, 2026</w:t></w:r></w:p>'
    . '<w:p><w:r><w:t>Midterm exam</w:t><w:tab/><w:t>October 14 &amp; review</w:t></w:r></w:p></w:body></w:document>';
$text = "Homework 1 due September 28, 2026\nMidterm exam October 14 & review";
foreach ([true, false] as $deflate) {
    check(docxText(zipOf(['[Content_Types].xml' => '<Types/>', 'word/document.xml' => $xml], $deflate)) === $text, 'DOCX text was not read.');
}
check(syllabusPart('docx', docxOf("Quiz 1\nQuiz 2")) === ['text' => "Quiz 1\nQuiz 2"], 'DOCX should be sent as text.');
check(syllabusPart('txt', 'Quiz 1 on September 8') === ['text' => 'Quiz 1 on September 8'], 'TXT should be sent as text.');
$unreadable = 'This DOCX file could not be read. Try saving it as a PDF.';
fails(fn () => docxText(zipOf(['word/other.xml' => $xml])), 422, $unreadable);
fails(fn () => docxText("PK\x03\x04 not really a zip"), 422, $unreadable);
fails(fn () => docxText(zipOf(['word/document.xml' => str_repeat('a', 21 * 1024 * 1024)])), 422, $unreadable);
fails(fn () => docxText(zipOf(['word/document.xml' => '<w:document><w:body/></w:document>'])), 422, 'This file has no text to read.');
foreach (['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'] as $type => $media) {
    check(syllabusPart($type, 'img')['inlineData']['mimeType'] === $media, "Wrong media type for $type.");
}
echo "PASS 5: DOCX and text files are sent as text, image types are kept, and unreadable DOCX files are refused\n";

// 6. A schedule row can contain several separately named graded items. The request must tell Gemini
// to use each item's own name and the row's date, and the reply must keep same-day items separate.
$table = pdfOf('Week 3 | September 14, 2026 | Unit 2: Requirements | Homework 2 due; Quiz 1');
$sameDay = [
    ['title' => 'Homework 2', 'kind' => 'assignment', 'date' => '2026-09-14', 'time' => '', 'source' => 'Homework 2 due'],
    ['title' => 'Quiz 1', 'kind' => 'quiz', 'date' => '2026-09-14', 'time' => '', 'source' => 'Quiz 1'],
];
check(readSyllabusWithAi($config, fakeApi($calls, $counted, $reply($sameDay)), 'pdf', $table, 2026) === $sameDay,
    'Separate items on the same date must remain separate events.');
$instructions = $calls[1][1]['systemInstruction']['parts'][0]['text'] ?? '';
foreach (['each separately named graded item', 'share a date, line, table row, or Due cell',
    'use the Date column', 'topic, and unit columns', "item's own name and number",
    'Remove', '"due"', 'never combine multiple item names', '"Homework 2" (assignment)', '"Quiz 1" (quiz)'] as $rule) {
    check(str_contains($instructions, $rule), "The Gemini request is missing the schedule rule: $rule");
}
echo "PASS 6: the request asks for one item per graded item, even on a shared day, line, or table row, titled by its own name, not the column beside it\n";
