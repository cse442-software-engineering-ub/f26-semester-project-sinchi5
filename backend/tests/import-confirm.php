<?php
declare(strict_types=1);
// Card 47 checks on reviewed events. No database or network needed: php backend/tests/import-confirm.php
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/notes.php';
require_once __DIR__ . '/../lib/imports.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}
function rejects(mixed $events, string $message): void
{
    try {
        reviewedEvents($events);
    } catch (HttpError $error) {
        check($error->status === 422 && $error->getMessage() === $message,
            "Expected 422 \"$message\", got {$error->status} \"{$error->getMessage()}\".");
        return;
    }
    throw new RuntimeException("Expected the events to be rejected with \"$message\".");
}
// The API decodes nested JSON objects as stdClass, so the checks must accept both shapes.
$event = fn (array $fields) => (object) ($fields + ['title' => 'Homework 1', 'kind' => 'assignment', 'date' => '2026-09-28']);

// Task test 1: reviewed events become rows with a 24-hour time or none.
check(reviewedEvents([$event([]), $event(['title' => '  Midterm exam ', 'kind' => 'exam', 'date' => '2026-10-14', 'time' => '10:00'])])
    === [['Homework 1', 'assignment', '2026-09-28', null], ['Midterm exam', 'exam', '2026-10-14', '10:00:00']],
    'Valid events were not accepted as given.');
check(reviewedEvents([['title' => 'Exposé – final draft', 'date' => '2026-12-01']]) === [['Exposé – final draft', 'other', '2026-12-01', null]],
    'An event without a kind should default to other and keep its accented title.');
echo "PASS 1: reviewed events keep their title, kind, date, and time\n";

// Task test 3: an event needs a title and a date, and every other field must be valid.
rejects([$event(['title' => ''])], 'Give every event a title and a date.');
rejects([$event(['title' => "  \u{00A0} "])], 'Give every event a title and a date.');
rejects([$event(['date' => ''])], 'Give every event a title and a date.');
rejects([(object) ['kind' => 'exam']], 'Give every event a title and a date.');
rejects(['Homework 1'], 'Give every event a title and a date.');
rejects([$event(['title' => str_repeat('a', 256)])], 'Keep each event title to 255 visible characters.');
rejects([$event(['title' => "Quiz\u{200B}"])], 'Keep each event title to 255 visible characters.');
foreach (['2026-02-30', '09/28/2026', '1999-12-31', '2026-9-28'] as $date) rejects([$event(['date' => $date])], 'Choose a real date for every event.');
rejects([$event(['kind' => 'party'])], 'Choose a valid event type.');
foreach (['24:00', '10:00 AM', '7:5', 10] as $time) rejects([$event(['time' => $time])], 'Use a 24-hour time like 10:00.');
foreach ([null, [], 'events', ['a' => $event([])], array_fill(0, 201, $event([]))] as $events) rejects($events, 'Choose 1 to 200 events to add.');
check(count(reviewedEvents(array_fill(0, 200, $event([])))) === 200, '200 events should be accepted.');
echo "PASS 3: events without a title or date, and invalid fields or counts, are rejected\n";
