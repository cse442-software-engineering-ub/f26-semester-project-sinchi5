<?php
declare(strict_types=1);
// Card 127: syllabus reader checks with a fake Gemini API: no network, no database, no API key.
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
// A reply with the given events, and any other parts of a read.
$reply = fn (mixed $events, string $finish = 'STOP', array $read = []) => [200, ['usageMetadata' => ['promptTokenCount' => 1200, 'candidatesTokenCount' => 120],
    'candidates' => [['finishReason' => $finish, 'content' => ['parts' => [
        ['text' => '{"events":[{"title":"Thought, not an answer"}]}', 'thought' => true],
        ['text' => json_encode(['events' => $events] + $read)],
    ]]]]]];
$events = [
    ['title' => 'Homework 1', 'kind' => 'assignment', 'date' => '2026-09-28', 'time' => '', 'location' => '', 'source' => 'Homework 1 due September 28'],
    ['title' => 'Midterm exam', 'kind' => 'exam', 'date' => '2026-10-14', 'time' => '10:00', 'location' => 'Knox 110', 'source' => 'Midterm exam October 14, 10 AM, Knox 110'],
];
$pdf = pdfOf('Homework 1 due September 28');
$config = ['origin' => 'https://aptitude.cse.buffalo.edu', 'gemini_api_key' => 'test-key-never-sent'];
$model = 'models/' . SYLLABUS_AI_MODEL;

// 1. A PDF is counted for free first, then read once with the default model, medium thinking, and a schema.
check(readSyllabusWithAi($config, fakeApi($calls, $counted, $reply($events)), 'pdf', $pdf, 2026)
    === ['isSyllabus' => true, 'meetings' => [], 'noClassDates' => [], 'events' => $events], 'The events from the reply were not returned.');
[[$countPath, $countBody], [$readPath, $readBody]] = $calls;
$parts = [['inlineData' => ['mimeType' => 'application/pdf', 'data' => base64_encode($pdf)]],
    ['text' => "Course year: 2026. Read the whole file and report what belongs on the student's calendar."]];
check($countPath === "$model:countTokens" && $countBody === ['contents' => [['role' => 'user', 'parts' => $parts]]],
    'Tokens must be counted before reading.');
check($readPath === "$model:generateContent" && $readBody['contents'] === $countBody['contents'], 'The read must send what was counted.');
check($readBody['systemInstruction'] === ['parts' => [['text' => SYLLABUS_AI_PROMPT]]], 'The instructions must be the system instruction.');
check($readBody['generationConfig'] === ['responseMimeType' => 'application/json', 'responseSchema' => SYLLABUS_AI_SCHEMA,
    'maxOutputTokens' => 65536, 'thinkingConfig' => ['thinkingLevel' => 'MEDIUM']], 'The read must use JSON, the schema, and medium thinking.');
check(!isset($readBody['tools']), 'The model must have no tools.');
check(SYLLABUS_AI_MODEL === 'gemini-3.8-flash', 'The stronger model is the default.');
readSyllabusWithAi($config + ['gemini_model' => 'gemini-3.5-flash-lite'], fakeApi($calls, $counted, $reply([])), 'pdf', $pdf, 2026);
check($calls[1][0] === 'models/gemini-3.5-flash-lite:generateContent', 'The configured model was not used.');
try {
    readSyllabusWithAi($config + ['gemini_model' => '../files?key=x'], fakeApi($calls), 'pdf', $pdf, 2026);
    throw new LogicException('A bad model name must be refused.');
} catch (RuntimeException) {
}
echo "PASS 1: a PDF is token-counted, then read once with medium thinking, the read schema, and the configured model\n";

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
    fails(fn () => readSyllabusWithAi($config, fakeApi($calls, $counted, $reply($events, $finish)), 'pdf', $pdf, 2026), 422, SYLLABUS_AI_UNFINISHED);
}
foreach ([[200, ['promptFeedback' => ['blockReason' => 'SAFETY']]], [200, ['candidates' => [['finishReason' => 'STOP',
    'content' => ['parts' => [['text' => 'not json']]]]]]], $reply('a string')] as $bad) {
    fails(fn () => readSyllabusWithAi($config, fakeApi($calls, $counted, $bad), 'pdf', $pdf, 2026), 422, SYLLABUS_AI_UNFINISHED);
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
$clean = readSyllabusWithAi($config, fakeApi($calls, $counted, $reply($injected)), 'pdf', $pdf, 2026)['events'];
check($clean === [
    ['title' => 'Quiz 1 <script>', 'kind' => 'other', 'date' => '', 'time' => '', 'location' => '', 'source' => 'line one line two'],
    ['title' => str_repeat('é', 255), 'kind' => 'quiz', 'date' => '', 'time' => '', 'location' => '', 'source' => str_repeat('s', 500)],
    ['title' => 'Final exam', 'kind' => 'exam', 'date' => '2027-01-05', 'time' => '08:30', 'location' => '', 'source' => ''],
], 'Untrusted reply fields were not cleaned: ' . json_encode($clean));
$many = array_fill(0, 250, $events[0]);
check(count(readSyllabusWithAi($config, fakeApi($calls, $counted, $reply($many)), 'pdf', $pdf, 2026)['events']) === 200,
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
// A schedule's date and item belong together only through their table row, so a row stays one line, and
// nothing but the words reaches the model: not a drawing's position numbers, tab settings, or Word's
// second copy of a text box. A class time can also sit in a header.
$schedule = '<w:document><w:body><w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><wp:anchor><wp:posOffset>952500</wp:posOffset></wp:anchor>'
    . '<mc:AlternateContent><mc:Choice><w:txbxContent><w:p><w:r><w:t>Boxed</w:t></w:r></w:p></w:txbxContent></mc:Choice>'
    . '<mc:Fallback><w:txbxContent><w:p><w:r><w:t>Boxed</w:t></w:r></w:p></w:txbxContent></mc:Fallback></mc:AlternateContent></w:p>'
    . '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Week 5</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t xml:space="preserve">Sept. 21-25 </w:t></w:r></w:p>'
    . '<w:p><w:r><w:t>Topic</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc><w:tc><w:p><w:r><w:t>Test </w:t></w:r><w:r><w:t>#1</w:t></w:r></w:p></w:tc></w:tr>'
    . '<w:tr><w:tc><w:p><w:r><w:t>Week 6</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p></w:body></w:document>';
$words = docxText(zipOf(['word/document.xml' => $schedule, 'word/header1.xml' => '<w:hdr><w:p><w:r><w:t>MoWeFr 1:00-1:50pm</w:t></w:r></w:p></w:hdr>',
    'word/styles.xml' => '<w:styles><w:p><w:r><w:t>Not the words of the file</w:t></w:r></w:p></w:styles>']));
check($words === "Boxed\nWeek 5 | Sept. 21-25 Topic | | Test #1\nWeek 6\nLine one\nLine two\nMoWeFr 1:00-1:50pm", "A Word file's words were not read in order: $words");
$unreadable = DOCX_UNREADABLE;
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
    ['title' => 'Homework 2', 'kind' => 'assignment', 'date' => '2026-09-14', 'time' => '', 'location' => '', 'source' => 'Homework 2 due'],
    ['title' => 'Quiz 1', 'kind' => 'quiz', 'date' => '2026-09-14', 'time' => '', 'location' => '', 'source' => 'Quiz 1'],
];
check(readSyllabusWithAi($config, fakeApi($calls, $counted, $reply($sameDay)), 'pdf', $table, 2026)['events'] === $sameDay,
    'Separate items on the same date must remain separate events.');
$instructions = preg_replace('/\s+/', ' ', $calls[1][1]['systemInstruction']['parts'][0]['text'] ?? '');
foreach (['each separately named graded item', 'share a date, line, table row, or Due cell',
    'use the Date column', 'topic, and unit columns', "item's own name and number",
    'Remove', '"due"', 'never combine multiple item names', '"Homework 2" (assignment)', '"Quiz 1" (quiz)'] as $rule) {
    check(str_contains($instructions, $rule), "The Gemini request is missing the schedule rule: $rule");
}
echo "PASS 6: the request asks for one item per graded item, even on a shared day, line, or table row, titled by its own name, not the column beside it\n";

// 7. Weekly classes: the reply's days, sections, rooms, and class dates survive, and everything is checked
// like the rest of the reply.
$meetings = [
    ['title' => 'Lecture', 'kind' => 'lecture', 'section' => '', 'days' => ['MON', 'WED', 'FRI'], 'time' => '13:00', 'location' => 'Knox 109',
        'firstDate' => '2026-08-24', 'lastDate' => '2026-12-07', 'source' => 'MoWeFr 1:00-1:50pm Knox 109'],
    ['title' => 'Lab', 'kind' => 'lab', 'section' => 'A1', 'days' => ['TUE'], 'time' => '', 'location' => '', 'firstDate' => '', 'lastDate' => '', 'source' => 'Lab A1 Tuesdays'],
    // Days out of order, repeated, or unknown; a bad kind, time, and dates; no title; and a line break in the room.
    ['title' => '', 'kind' => 'party', 'section' => "A\u{202E}2", 'days' => ['THU', 'TUE', 'TUE', 'SOON', 7], 'time' => '9:30', 'location' => "NSC\n201",
        'firstDate' => '2026-02-30', 'lastDate' => '1999-01-01', 'source' => ['nested']],
    // Not a weekly class: no days at all.
    ['title' => 'Lab', 'kind' => 'lab', 'section' => '', 'days' => [], 'time' => '10:00', 'location' => '', 'firstDate' => '', 'lastDate' => '', 'source' => 'Labs are scheduled on HUB'],
    'not a meeting',
];
$breaks = [['from' => '2026-09-07', 'to' => '2026-09-07'], ['from' => '2026-11-23', 'to' => '2026-11-27'], ['from' => '2026-10-12', 'to' => '2026-10-01'],
    ['from' => '2026-13-01', 'to' => '2026-13-02'], 'not a break', ['from' => '2026-12-24']];
$read = readSyllabusWithAi($config, fakeApi($calls, $counted, $reply([], 'STOP', ['isSyllabus' => true, 'meetings' => $meetings, 'noClassDates' => $breaks])), 'pdf', $pdf, 2026);
check($read['meetings'] === [
    ['title' => 'Lecture', 'kind' => 'lecture', 'section' => '', 'days' => [1, 3, 5], 'time' => '13:00', 'location' => 'Knox 109',
        'firstDate' => '2026-08-24', 'lastDate' => '2026-12-07', 'source' => 'MoWeFr 1:00-1:50pm Knox 109'],
    ['title' => 'Lab', 'kind' => 'lab', 'section' => 'A1', 'days' => [2], 'time' => '', 'location' => '', 'firstDate' => '', 'lastDate' => '', 'source' => 'Lab A1 Tuesdays'],
    ['title' => 'Lecture', 'kind' => 'lecture', 'section' => 'A 2', 'days' => [2, 4], 'time' => '', 'location' => 'NSC 201', 'firstDate' => '', 'lastDate' => '', 'source' => ''],
], 'Weekly classes were not cleaned: ' . json_encode($read['meetings']));
check($read['noClassDates'] === [['from' => '2026-09-07', 'to' => '2026-09-07'], ['from' => '2026-11-23', 'to' => '2026-11-27'],
    ['from' => '2026-10-12', 'to' => '2026-10-12'], ['from' => '2026-12-24', 'to' => '2026-12-24']], 'No-class dates were not cleaned: ' . json_encode($read['noClassDates']));
$many = array_fill(0, 70, $meetings[0]);
check(count(readSyllabusWithAi($config, fakeApi($calls, $counted, $reply([], 'STOP', ['meetings' => $many])), 'pdf', $pdf, 2026)['meetings']) === 60,
    'At most 60 weekly classes should be kept.');
foreach (['MoWeFr', 'R is Thursday', 'NO CLASSES THIS WEEK', 'Lab Exam 1', 'two midterm exams and a final', 'resign deadlines', 'Office hours'] as $rule) {
    check(str_contains(preg_replace('/\s+/', ' ', SYLLABUS_AI_PROMPT), $rule), "The prompt is missing the rule about: $rule");
}
echo "PASS 7: weekly classes keep their days, section, time, room, and class dates, and no-class ranges are checked\n";

// 8. No events and not a syllabus are real answers, not failures. Anything claimed for a file that isn't a
// syllabus is dropped, and a syllabus with nothing to add stays a syllabus.
$empty = ['isSyllabus' => true, 'meetings' => [], 'noClassDates' => [], 'events' => []];
check(readSyllabusWithAi($config, fakeApi($calls, $counted, $reply([], 'STOP', ['isSyllabus' => true, 'meetings' => [], 'noClassDates' => []])), 'pdf', $pdf, 2026) === $empty,
    'A syllabus with no events should read as empty lists.');
check(readSyllabusWithAi($config, fakeApi($calls, $counted, $reply($events, 'STOP', ['isSyllabus' => false, 'meetings' => $meetings, 'noClassDates' => $breaks])), 'pdf', $pdf, 2026)
    === ['isSyllabus' => false] + $empty, 'A file that is not a syllabus should report nothing else.');
echo "PASS 8: a syllabus with no events and a file that isn't a syllabus come back as answers, with nothing else claimed\n";

// 9. A busy reply is tried twice more, waiting a little between tries, and other replies aren't retried.
$waits = [];
$wait = function (int $seconds) use (&$waits): void { $waits[] = $seconds; };
check(retryWhenBusy(fakeApi($calls, [503, []], [429, []], [200, ['ok' => true]]), $wait)('models/x', []) === [200, ['ok' => true]], 'A busy reply should be retried.');
check(count($calls) === 3 && $waits === [2, 5], 'A busy reply should wait and retry twice.');
check(retryWhenBusy(fakeApi($calls, [503, []], [503, []], [503, ['still' => 'busy']]), $wait)('models/x', []) === [503, ['still' => 'busy']] && count($calls) === 3, 'Retries must stop after the third try.');
foreach ([200, 400, 404] as $status) {
    $waits = [];
    check(retryWhenBusy(fakeApi($calls, [$status, []]), $wait)('models/x', [])[0] === $status && count($calls) === 1 && !$waits, "HTTP $status must not be retried.");
}
echo "PASS 9: a busy reply is retried twice with short waits, and any other reply is used as it is\n";
