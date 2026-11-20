<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

// GET routes only read; every other note route writes inside one transaction.
const NOTE_READ_ROUTES = ['note', 'notes', 'note-versions', 'note-comments', 'note-collaborators'];
const NOTE_ROUTES = [...NOTE_READ_ROUTES, 'note-create', 'note-title', 'note-content', 'note-save', 'note-pin',
    'note-reminder', 'note-restore', 'note-delete', 'note-comment', 'note-invite', 'note-permission', 'note-link',
    'note-collaborator-remove', 'note-comment-delete'];
// Card 246: one answer for a stranger, a pending request, an unknown email, and the owner's own email,
// so an invitation never reveals whether an account exists.
const NOTE_FRIENDS_ONLY = 'You can invite only your friends to a note.';
const NOTE_CATEGORIES = ['School', 'Work', 'Meetings', 'Personal'];
const NOTE_COLUMNS = 'n.id, n.owner_user_id, n.title, n.body, n.body_format, n.body_text, n.highlights, n.course_id,
    n.lecture_date, n.category, n.visibility, n.tags, n.pinned, n.remind_at, n.created_at, n.updated_at, n.checklist,
    n.event_id, n.event_date';

// Card 240: a note body is cleaned HTML. The incoming string is measured; backend/index.php lets these routes read twice
// this much so JSON escaping of quotes still fits.
const NOTE_MAX_BYTES = 524288;
const NOTE_TOO_LONG = 'Notes can be at most 512 KB. Split this note into two.';
// Card 240: each note keeps its newest versions only, so repeated large saves can't fill the database.
const NOTE_MAX_VERSIONS = 50;
const NOTE_BODY_ROUTES = ['note-content', 'note-save'];
const NOTE_EXCERPT_LENGTH = 300;
// The XSS wall: only these tags survive cleanNoteHtml. Other tags are unwrapped to their text,
// and NOTE_HTML_DROP tags are removed together with their content.
const NOTE_HTML_TAGS = ['p', 'br', 'h1', 'h2', 'h3', 'strong', 'em', 'u', 's', 'mark', 'span', 'ul', 'ol', 'li',
    'blockquote', 'code', 'pre', 'a', 'hr'];
const NOTE_HTML_DROP = ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'svg', 'math', 'template', 'noscript',
    'noembed', 'noframes', 'frameset', 'frame', 'textarea', 'title', 'head', 'select', 'xmp', 'plaintext', 'canvas',
    'audio', 'video', 'picture', 'map'];
// The editor's font list and size steps (card 241 offers exactly these). A style value outside them is dropped.
const NOTE_FONTS = ['Arial, Helvetica, sans-serif', 'Georgia, serif', '"Times New Roman", Times, serif',
    'Verdana, Geneva, sans-serif', '"Trebuchet MS", Helvetica, sans-serif', '"Courier New", Courier, monospace'];
const NOTE_FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px'];
const NOTE_COLOR = '/^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d{1,3})\s*)?\))$/iD';
// Old highlight names stay names so card 241 can show them in the theme's own highlight colors.
const NOTE_MARK_NAMES = ['yellow', 'green', 'pink'];

// Task #79 / Story #19: retain ordered tasks and exact boolean completion states.
// HTTP JSON objects arrive as stdClass; PHP callers may supply associative items.
// Card 240 raised note-save's request cap, so the stored JSON is bounded by its TEXT column (64 KB) instead.
function noteChecklist(mixed $value): string
{
    if (!is_array($value) || array_values($value) !== $value) {
        throw new HttpError(422, 'Send the checklist as an array of text and done items.');
    }
    $items = [];
    foreach ($value as $item) {
        if ($item instanceof stdClass) $item = (array) $item;
        if (!is_array($item) || !is_string($item['text'] ?? null)
            || !preg_match('//u', $item['text']) || !is_bool($item['done'] ?? null)) {
            throw new HttpError(422, 'Each checklist item needs UTF-8 text and a boolean done value.');
        }
        // Task Test 2: discard blank tasks, preserving meaningful text and relative order.
        if (trimEdges($item['text']) !== '') $items[] = ['text' => $item['text'], 'done' => $item['done']];
    }
    $json = json_encode($items, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    if (strlen($json) > 65535) throw new HttpError(422, 'Keep the checklist under 64 KB.');
    return $json;
}

function recordId(mixed $value, string $message): string
{
    if (!is_string($value) || !preg_match('/^[1-9][0-9]{0,19}$/D', $value)
        || (strlen($value) === 20 && strcmp($value, '18446744073709551615') > 0)) {
        throw new HttpError(422, $message);
    }
    return $value;
}

function noteId(mixed $value): string
{
    return recordId($value, 'Choose a valid note.');
}

function noteTitle(array $input): string
{
    $title = field($input, 'title');
    if (!preg_match('//u', $title)) {
        throw new HttpError(422, 'The note title contains characters we could not read.');
    }
    $title = trimEdges($title);
    $length = characterCount($title);
    if ($length < 1 || $length > 255 || preg_match(INVISIBLE_PATTERN, $title)) {
        throw new HttpError(422, 'Enter a note title of 1 to 255 visible characters.');
    }
    return $title;
}

function noteBody(array $input): string
{
    $body = field($input, 'body');
    if (strlen($body) > NOTE_MAX_BYTES) {
        throw new HttpError(413, NOTE_TOO_LONG);
    }
    if (!preg_match('//u', $body)) {
        throw new HttpError(422, 'The note body contains characters we could not read.');
    }
    return $body;
}

// Card 240: 'html' from the formatting editor (card 241); 'text' (the default) is today's plain-text editor,
// whose body is escaped into paragraphs, never parsed as HTML.
function noteFormat(array $input): string
{
    $format = $input['format'] ?? 'text';
    if (!in_array($format, ['text', 'html'], true)) {
        throw new HttpError(422, 'Choose text or html for the note format.');
    }
    return $format;
}

function noteEscape(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

// Card 240: parse untrusted HTML and rebuild it from the allow-list. The output is written here, never by
// libxml, so every text and attribute value is escaped and only allowed tags and attributes can appear.
function cleanNoteHtml(string $html): string
{
    if ($html === '') return '';
    $unreadable = "This note has formatting we can't read. Paste it as plain text and try again.";
    // libxml is quadratic in attributes per tag, so a huge tag is refused before parsing (CPU DoS).
    if (preg_match('/<[^>]{4096}/', $html)) throw new HttpError(422, $unreadable);
    // A literal </body> or </html> would make libxml drop everything after it while the save succeeds.
    $html = preg_replace('~</(?:body|html)\b[^>]*>~i', '', str_replace("\0", '', $html));
    $doc = new DOMDocument();
    $errors = libxml_use_internal_errors(true);
    $doc->loadHTML('<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>'
        . $html . '</body></html>', LIBXML_NONET);
    // A fatal error (nesting past libxml's depth limit) stops the parse and loses the rest, so refuse instead.
    // It is always the last error; libxml_get_errors() would copy every warning and can exhaust memory.
    $fatal = libxml_get_last_error();
    $fatal = $fatal && $fatal->level === LIBXML_ERR_FATAL;
    libxml_clear_errors();
    libxml_use_internal_errors($errors);
    if ($fatal) throw new HttpError(422, $unreadable);
    $body = $doc->getElementsByTagName('body')->item(0);
    $clean = $body ? cleanNoteNodes($body, 0) : '';
    // Escaping can grow the text (512 KB of & becomes 2.5 MB), so the cap applies to the stored HTML too.
    if (strlen($clean) > NOTE_MAX_BYTES) throw new HttpError(413, NOTE_TOO_LONG);
    return $clean;
}

function cleanNoteNodes(DOMNode $parent, int $depth): string
{
    $html = '';
    foreach ($parent->childNodes as $node) {
        if ($node instanceof DOMText) {
            $html .= htmlspecialchars($node->data, ENT_NOQUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
            continue;
        }
        // Comments, processing instructions, and dangerous elements go with everything inside them.
        $tag = strtolower($node->nodeName);
        if (!$node instanceof DOMElement || in_array($tag, NOTE_HTML_DROP, true)) continue;
        // Past 64 levels keep only the escaped text, so hostile nesting can't exhaust the stack.
        $inner = $depth < 64 ? cleanNoteNodes($node, $depth + 1)
            : htmlspecialchars($node->textContent, ENT_NOQUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
        $attributes = in_array($tag, NOTE_HTML_TAGS, true) ? cleanNoteAttributes($tag, $node) : null;
        if ($attributes === null || ($tag === 'span' && $attributes === '')) {
            $html .= $inner;
        } else {
            $html .= in_array($tag, ['br', 'hr'], true) ? "<$tag$attributes>" : "<$tag$attributes>$inner</$tag>";
        }
    }
    return $html;
}

// Returns the kept attributes as ' name="value"' text, in their original order.
function cleanNoteAttributes(string $tag, DOMElement $node): string
{
    $kept = '';
    foreach ($node->attributes as $attribute) {
        $name = strtolower($attribute->name);
        $value = $attribute->value;
        $ok = match ($name) {
            // A fixed scheme prefix and no whitespace or control characters anywhere: case, entity, and
            // whitespace tricks (java&#x09;script:, " javascript:", JaVaScRiPt:) can never pass.
            'href' => $tag === 'a' && strlen($value = trim($value)) <= 2048
                && preg_match('~^(?:https?://|mailto:)[^\s\x00-\x1f\x7f"<>\\\\`]*$~iuD', $value),
            'data-type' => ($tag === 'ul' && $value === 'taskList') || ($tag === 'li' && $value === 'taskItem'),
            'data-checked' => $tag === 'li' && in_array($value, ['true', 'false'], true),
            'data-color' => $tag === 'mark' && (in_array($value, NOTE_MARK_NAMES, true) || preg_match(NOTE_COLOR, $value)),
            'style' => ($value = cleanNoteStyle($value)) !== '',
            default => false,
        };
        if ($ok) $kept .= ' ' . $name . '="' . noteEscape($value) . '"';
    }
    return $kept;
}

function cleanNoteStyle(string $style): string
{
    $kept = [];
    foreach (explode(';', $style) as $declaration) {
        [$property, $value] = array_map('trim', explode(':', $declaration, 2)) + ['', ''];
        $property = strtolower($property);
        if ($property === 'font-family') {
            $value = preg_replace('/\s*,\s*/', ', ', str_replace("'", '"', $value));
        }
        $ok = match ($property) {
            'color', 'background-color' => (bool) preg_match(NOTE_COLOR, $value),
            'font-family' => in_array($value, NOTE_FONTS, true),
            'font-size' => in_array($value, NOTE_FONT_SIZES, true),
            'text-align' => in_array($value, ['left', 'center', 'right', 'justify'], true),
            default => false,
        };
        if ($ok) $kept[] = "$property: $value";
    }
    return implode('; ', $kept);
}

// Card 240: plain text of clean HTML for search, excerpts, and counts. Blocks and line breaks become spaces.
function notePlain(string $html): string
{
    $text = strip_tags(preg_replace('/<(?=\/?(?:p|h[1-3]|li|ul|ol|blockquote|pre|br|hr)\b)/', ' <', $html));
    return trim(preg_replace('/\s+/u', ' ', html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
}

// Card 240: an old plain-text note as HTML. Each line is a paragraph, saved highlights (UTF-16 ranges, where an
// emoji counts 2) become <mark data-color>, and checklist items become the editor's task list.
function legacyNoteHtml(string $text, array $highlights, array $checklist): string
{
    $units = mb_convert_encoding($text, 'UTF-16LE', 'UTF-8');
    $length = intdiv(strlen($units), 2);
    $cuts = [0, $length];
    foreach ($highlights as $h) array_push($cuts, max(0, min($length, $h['start'])), max(0, min($length, $h['end'])));
    $cuts = array_values(array_unique($cuts));
    sort($cuts);
    $paragraphs = [''];
    for ($i = 1; $i < count($cuts); $i++) {
        [$from, $to] = [$cuts[$i - 1], $cuts[$i]];
        $color = null;
        foreach ($highlights as $h) if ($h['start'] <= $from && $h['end'] >= $to) $color = $h['color'];
        $piece = mb_convert_encoding(substr($units, 2 * $from, 2 * ($to - $from)), 'UTF-8', 'UTF-16LE');
        foreach (explode("\n", str_replace("\r", '', $piece)) as $n => $line) {
            if ($n > 0) $paragraphs[] = '';
            if ($line === '') continue;
            $line = htmlspecialchars($line, ENT_NOQUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
            $paragraphs[count($paragraphs) - 1] .= $color === null ? $line : '<mark data-color="' . noteEscape($color) . "\">$line</mark>";
        }
    }
    $html = $text === '' ? '' : '<p>' . implode('</p><p>', $paragraphs) . '</p>';
    if ($checklist) {
        $html .= '<ul data-type="taskList">';
        foreach ($checklist as $item) {
            $html .= '<li data-type="taskItem" data-checked="' . ($item['done'] ? 'true' : 'false') . '"><p>'
                . htmlspecialchars($item['text'], ENT_NOQUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8') . '</p></li>';
        }
        $html .= '</ul>';
    }
    return $html;
}

// Card 240: what a save stores as [body, body_text]. HTML is cleaned on every save; text stays text (its
// highlights and checklist stay in their own columns) and is converted when read.
function noteStorage(string $format, string $body, string $checklist): array
{
    if ($format === 'html') {
        $body = cleanNoteHtml($body);
        return [$body, notePlain($body)];
    }
    return [$body, notePlain(legacyNoteHtml($body, [], json_decode($checklist, true) ?? []))];
}

// The browser measures highlight positions in UTF-16 units (selectionStart/selectionEnd), where an emoji counts 2.
function utf16Length(string $text): int
{
    return characterCount($text) + (int) preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $text);
}

// Task #86 / Story #31: save highlight ranges and allow only supported colors.
function noteHighlights(mixed $value, string $body): string
{
    if (!is_array($value) || array_values($value) !== $value) {
        throw new HttpError(422, 'Send highlights as a list.');
    }

    $bodyLength = utf16Length($body);
    $highlights = [];

    foreach ($value as $highlight) {
        if ($highlight instanceof stdClass) {
            $highlight = (array) $highlight;
        }

        if (!is_array($highlight)) {
            throw new HttpError(422, 'Send highlights as a list.');
        }

        $start = $highlight['start'] ?? null;
        $end = $highlight['end'] ?? null;
        $color = $highlight['color'] ?? null;

        if (
            !is_int($start) ||
            !is_int($end) ||
            $start < 0 ||
            $end <= $start ||
            $end > $bodyLength
        ) {
            throw new HttpError(
                422,
                'Highlights must be inside the note.'
            );
        }

        if (
            !is_string($color) ||
            !in_array($color, ['yellow', 'green', 'pink'], true)
        ) {
            throw new HttpError(
                422,
                'Choose yellow, green, or pink.'
            );
        }

        $highlights[] = [
            'start' => $start,
            'end' => $end,
            'color' => $color,
        ];
    }

    $json = json_encode($highlights, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    // Card 240: the larger note-save request could otherwise overflow the TEXT column.
    if (strlen($json) > 65535) throw new HttpError(422, 'Use fewer highlights.');
    return $json;
}

// Returns [course_id, lecture_date, category, visibility, tags JSON] in column order.
function noteFields(array $input): array
{
    $course = $input['courseId'] ?? '';
    if (!is_string($course) || !preg_match('/^[A-Za-z0-9_-]{0,64}$/D', $course)) {
        throw new HttpError(422, 'Choose a valid course.');
    }
    $date = $input['lectureDate'] ?? '';
    if (!is_string($date) || ($date !== '' && (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $parts)
        || !checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])))) {
        throw new HttpError(422, 'Choose a valid lecture date.');
    }
    $category = $input['category'] ?? 'School';
    if (!in_array($category, NOTE_CATEGORIES, true)) {
        throw new HttpError(422, 'Choose a valid category.');
    }
    $visibility = $input['visibility'] ?? 'private';
    if (!in_array($visibility, ['private', 'shared'], true)) {
        throw new HttpError(422, 'Choose who can see this note.');
    }
    $tags = $input['tags'] ?? [];
    if (!is_array($tags) || array_values($tags) !== $tags || count($tags) > 30) {
        throw new HttpError(422, 'Use at most 30 tags.');
    }
    foreach ($tags as $tag) {
        if (!is_string($tag) || !preg_match('//u', $tag) || characterCount($tag) > 100) {
            throw new HttpError(422, 'Keep each tag to 100 characters of plain text.');
        }
    }
    $tags = json_encode($tags, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    if (characterCount($tags) > 4000) {
        throw new HttpError(422, 'Use at most 30 tags.');
    }
    return [$course, $date === '' ? null : $date, $category, $visibility, $tags];
}

// Optional narrowing for the notes list (cards 41, 55, and 175). Every filter is optional, an empty value
// counts as absent, and filters combine with AND on top of "notes this user may view".
// Returns [extra SQL starting with " AND ...", bound values].
function noteListFilter(array $query, string $userId): array
{
    $sql = '';
    $values = [];
    $text = static function (string $name) use ($query): ?string {
        $value = $query[$name] ?? '';
        if (is_array($value)) {
            throw new HttpError(422, 'Use one value for each filter.');
        }
        return $value === '' ? null : (string) $value;
    };
    $category = $text('category');
    if ($category !== null) {
        if (!in_array($category, NOTE_CATEGORIES, true)) {
            throw new HttpError(422, 'Choose a valid category.');
        }
        $sql .= ' AND n.category = ?';
        $values[] = $category;
    }
    $tag = $text('tag');
    if ($tag !== null) {
        if (!preg_match('//u', $tag) || characterCount($tag) > 100) {
            throw new HttpError(422, 'Keep the tag to 100 characters of plain text.');
        }
        // Tags are a JSON array. JSON_CONTAINS compares one complete string element,
        // so spaces, SQL wildcards, and tag substrings are all literal.
        $sql .= ' AND JSON_CONTAINS(n.tags, JSON_QUOTE(?)) = 1';
        $values[] = $tag;
    }
    $keyword = $text('q');
    if ($keyword !== null) {
        if (!preg_match('//u', $keyword) || characterCount($keyword) > 100) {
            throw new HttpError(422, 'Keep the search to 100 characters of plain text.');
        }
        // Use an explicit escape character so wildcard searches work with any SQL mode.
        $like = '%' . strtr($keyword, ['!' => '!!', '%' => '!%', '_' => '!_']) . '%';
        // Card 240: search the plain text, so tag names and attributes never match; old rows may have none yet.
        $sql .= " AND (n.title LIKE ? ESCAPE '!' OR COALESCE(n.body_text, n.body) LIKE ? ESCAPE '!'
            OR n.tags LIKE ? ESCAPE '!')";
        array_push($values, $like, $like, $like);
    }
    $course = $text('course');
    if ($course !== null) {
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $course)) {
            throw new HttpError(422, 'Choose a valid course.');
        }
        $sql .= ' AND n.course_id = ?';
        $values[] = $course;
    }
    $visibility = $text('visibility');
    if ($visibility !== null) {
        if (!in_array($visibility, ['private', 'shared'], true)) {
            throw new HttpError(422, 'Choose who can see this note.');
        }
        $sql .= ' AND n.visibility = ?';
        $values[] = $visibility;
    }
    foreach (['from' => '>=', 'to' => '<='] as $name => $operator) {
        $date = $text($name);
        if ($date === null) {
            continue;
        }
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $parts)
            || !checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])) {
            throw new HttpError(422, 'Choose a valid lecture date.');
        }
        $sql .= " AND n.lecture_date $operator ?";
        $values[] = $date;
    }
    // Card 243: notes linked to an event (and one occurrence of it). Only the owner's notes: the event is theirs.
    $event = $text('event');
    $eventDate = $text('date');
    if ($event !== null || $eventDate !== null) {
        if ($event === null) throw new HttpError(422, 'Choose an event to go with the date.');
        $sql .= ' AND n.owner_user_id = ? AND n.event_id = ?';
        array_push($values, $userId, recordId($event, 'Choose a valid event.'));
        if ($eventDate !== null) {
            if (!realDate($eventDate)) throw new HttpError(422, 'Choose a valid date for the event.');
            $sql .= ' AND n.event_date = ?';
            $values[] = $eventDate;
        }
    }
    return [$sql, $values];
}

// Card 243: is $date one of the days this event happens? Repeats follow the schedule screen's rule: weeks start on
// Sunday, every 1 or 2 weeks counted from the week of the first date, on the chosen days (0 is Sunday), until a date.
function eventHasDate(array $event, string $date): bool
{
    if ($event['repeat_rule'] === null) return $date === $event['event_date'];
    $rule = json_decode($event['repeat_rule'], true, 8, JSON_THROW_ON_ERROR);
    if ($date < $event['event_date'] || $date > $rule['until']) return false;
    $utc = new DateTimeZone('UTC');
    $day = new DateTimeImmutable($date, $utc);
    if (!in_array((int) $day->format('w'), $rule['days'], true)) return false;
    $weekOf = static fn (DateTimeImmutable $d): DateTimeImmutable => $d->modify('-' . $d->format('w') . ' days');
    $weeks = intdiv($weekOf(new DateTimeImmutable($event['event_date'], $utc))->diff($weekOf($day))->days, 7);
    return $weeks % $rule['every'] === 0;
}

// Card 60: the notes list order. modified (default) and created are newest first, title is A to Z
// ignoring capital letters, and the note ID breaks ties so the same request always returns the
// same order. Only these fixed clauses are ever placed in the SQL.
function noteListOrder(array $query): string
{
    $sort = $query['sort'] ?? '';
    if (is_array($sort)) {
        throw new HttpError(422, 'Choose a valid sort.');
    }
    $orders = [
        'modified' => 'n.updated_at DESC, n.id DESC',
        'created' => 'n.created_at DESC, n.id DESC',
        'title' => 'LOWER(n.title) ASC, n.id ASC',
    ];
    $sort = (string) $sort === '' ? 'modified' : (string) $sort;
    if (!array_key_exists($sort, $orders)) {
        throw new HttpError(422, 'Choose a valid sort.');
    }
    return $orders[$sort];
}

function isoTime(string $value): string
{
    // The connection uses UTC, so stored DATETIME values are UTC.
    return str_replace(' ', 'T', $value) . 'Z';
}

function reminderTime(mixed $value): ?string
{
    if ($value === null) return null;
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/D', $value)) {
        throw new HttpError(422, 'Choose a valid reminder time.');
    }
    try {
        $time = new DateTimeImmutable($value);
    } catch (Exception $e) {
        throw new HttpError(422, 'Choose a valid reminder time.');
    }
    if ($time->format('Y-m-d\TH:i:s') !== substr($value, 0, 19)) {
        throw new HttpError(422, 'Choose a valid reminder time.');
    }
    if ($time <= new DateTimeImmutable('now', new DateTimeZone('UTC'))) {
        throw new HttpError(422, 'Choose a time in the future.');
    }
    return $time->format('Y-m-d H:i:s.v');
}

// Card 240: a note or version body is always returned as clean HTML. Old text rows (and old versions, which have
// no highlight or checklist columns) are converted here and rewritten as HTML only on their next save.
function noteRowHtml(array $row): string
{
    if ($row['body_format'] === 'html') return $row['body'];
    return legacyNoteHtml($row['body'], json_decode($row['highlights'] ?? '[]', true, 16, JSON_THROW_ON_ERROR),
        json_decode($row['checklist'] ?? '[]', true, 16, JSON_THROW_ON_ERROR));
}

function noteJson(array $row): array
{
    // Task #86 / Story #31: expose saved highlight ranges as an array.
    $highlights = json_decode($row['highlights'] ?? '[]', true, 16, JSON_THROW_ON_ERROR);
    // Task #79: NULL on pre-existing notes means no tasks; expose an array, never JSON text.
    $checklist = json_decode($row['checklist'] ?? '[]', true, 16, JSON_THROW_ON_ERROR);
    $body = noteRowHtml($row);
    return [
        'id' => (string) $row['id'],
        'ownerId' => (string) $row['owner_user_id'],
        'title' => $row['title'],
        'body' => $body,
        'excerpt' => mb_substr($row['body_text'] ?? notePlain($body), 0, NOTE_EXCERPT_LENGTH),
        'highlights' => $highlights,
        'checklist' => $checklist,
        'courseId' => $row['course_id'],
        'lectureDate' => $row['lecture_date'] ?? '',
        'eventId' => $row['event_id'] === null ? null : (string) $row['event_id'],
        'eventDate' => $row['event_id'] === null ? null : $row['event_date'], // the FK clears only event_id
        'category' => $row['category'],
        'visibility' => $row['visibility'],
        'tags' => json_decode($row['tags'], true) ?: [],
        'pinned' => (bool) $row['pinned'],
        'remindAt' => $row['remind_at'] === null ? null : isoTime($row['remind_at']),
        'createdAt' => isoTime($row['created_at']),
        'updatedAt' => isoTime($row['updated_at']),
    ];
}

function loadNote(PDO $db, string $id): array
{
    return noteJson(query($db, 'SELECT ' . NOTE_COLUMNS . ' FROM notely_notes n WHERE n.id = ?', [$id])->fetch());
}

function loadCollaborator(PDO $db, string $noteId, string $userId): ?array
{
    $row = query($db, 'SELECT u.id, u.name, u.email, e.permission FROM notely_note_editors e
        JOIN notely_users u ON u.id = e.user_id WHERE e.note_id = ? AND e.user_id = ?', [$noteId, $userId])->fetch();
    return $row ? ['id' => (string) $row['id'], 'name' => $row['name'], 'email' => $row['email'], 'permission' => $row['permission']] : null;
}

function commentJson(array $row): array
{
    return ['id' => (string) $row['id'], 'noteId' => (string) $row['note_id'], 'body' => $row['body'],
        'author' => $row['name'], 'authorId' => (string) $row['author_user_id'], 'createdAt' => isoTime($row['created_at'])];
}

// Card 156: joining the friendship table means a removed friend loses access even if a share row were left behind.
const SHARE_FRIEND_JOIN = "JOIN notely_friendships f ON f.status = 'accepted'
    AND f.user_low = LEAST(s.owner_user_id, s.friend_user_id) AND f.user_high = GREATEST(s.owner_user_id, s.friend_user_id)";

// Card 156: who shared this note's course with the student, or null when it isn't shared with them.
function courseShareFor(PDO $db, string $noteId, string $userId): ?array
{
    $row = query($db, 'SELECT u.id, u.name, s.course_code FROM notely_notes n
        JOIN notely_course_note_shares s ON s.owner_user_id = n.owner_user_id AND s.course_id = n.course_id
        ' . SHARE_FRIEND_JOIN . '
        JOIN notely_users u ON u.id = n.owner_user_id
        WHERE n.id = ? AND n.course_id <> \'\' AND s.friend_user_id = ?', [$noteId, $userId])->fetch();
    return $row ? ['id' => (string) $row['id'], 'name' => $row['name'], 'courseCode' => $row['course_code']] : null;
}

// The caller's role on an existing note: 'owner', 'edit', 'view', 'friend' (a course shared with them,
// read only), or 'none'.
function noteRole(PDO $db, string $id, array $user, bool $lock): string
{
    $row = query($db, 'SELECT n.owner_user_id, e.permission FROM notely_notes n
        LEFT JOIN notely_note_editors e ON e.note_id = n.id AND e.user_id = ?
        WHERE n.id = ?' . ($lock ? ' FOR UPDATE' : ''), [$user['id'], $id])->fetch();
    if (!$row) throw new HttpError(404, 'This note could not be found.');
    if ((string) $row['owner_user_id'] === (string) $user['id']) return 'owner';
    if ($row['permission']) return $row['permission'];
    return courseShareFor($db, $id, (string) $user['id']) ? 'friend' : 'none';
}

function requireEditor(PDO $db, string $id, array $user): string
{
    $role = noteRole($db, $id, $user, true);
    if (!in_array($role, ['owner', 'edit'], true)) {
        throw new HttpError(403, 'You do not have permission to edit this note.');
    }
    return $role;
}

function requireOwner(PDO $db, string $id, array $user, string $message): void
{
    // The caller always comes from the session; owner IDs sent with a request are ignored.
    if (noteRole($db, $id, $user, true) !== 'owner') throw new HttpError(403, $message);
}

// $next holds the new title, body, and/or body_format. Like the browser repository, changing the title or body keeps
// the previous text as a version. Card 240 (bug 2): the version is the note as clean HTML with its marks and tasks,
// so a restore brings back its own formatting.
function keepVersion(PDO $db, string $id, array $user, array $next): void
{
    $previous = query($db, 'SELECT title, body, body_format, highlights, checklist, updated_at FROM notely_notes WHERE id = ?',
        [$id])->fetch();
    if (array_diff_assoc($next, $previous)) {
        $html = noteRowHtml($previous);
        query($db, "INSERT INTO notely_note_versions (note_id, title, body, body_format, body_text, author_name, created_at)
            VALUES (?, ?, ?, 'html', ?, ?, ?)", [$id, $previous['title'], $html, notePlain($html), $user['name'], $previous['updated_at']]);
        // The derived table lets MySQL read the kept ids from the table it deletes from.
        query($db, 'DELETE FROM notely_note_versions WHERE note_id = ? AND id NOT IN (SELECT id FROM (SELECT id
            FROM notely_note_versions WHERE note_id = ? ORDER BY created_at DESC, id DESC LIMIT ' . NOTE_MAX_VERSIONS . ') AS kept)',
            [$id, $id]);
    }
}

function noteAction(PDO $db, array $session, string $route, array $input, array $config = []): array
{
    $write = !in_array($route, NOTE_READ_ROUTES, true);
    // Invitations are throttled per user, so a note can't be pushed to friends in bulk.
    if ($route === 'note-invite' && $config) rateLimit($db, $config, 'note-invite', (string) $session['user_id'], 30);
    if ($write) $db->beginTransaction();
    $user = requireUser($db, $session, $write);
    $result = noteRoute($db, $user, $route, $input);
    if ($write) $db->commit();
    return $result;
}

function noteRoute(PDO $db, array $user, string $route, array $input): array
{
    if ($route === 'notes') {
        [$filterSql, $filterValues] = noteListFilter($_GET, (string) $user['id']);
        // Card 246: a list sends each note's excerpt, never its body, so many large shared notes can't exhaust memory.
        // Only rows from before migration 019 have no body_text; their bodies fit in the old 64 KB TEXT column.
        $columns = str_replace('n.body, n.body_format, n.body_text', "IF(n.body_text IS NULL, n.body, '') AS body, n.body_format,
            LEFT(n.body_text, " . NOTE_EXCERPT_LENGTH . ') AS body_text', NOTE_COLUMNS);
        $rows = query($db, 'SELECT ' . $columns . ' FROM notely_notes n
            LEFT JOIN notely_note_editors e ON e.note_id = n.id AND e.user_id = ?
            WHERE (n.owner_user_id = ? OR e.user_id IS NOT NULL)' . $filterSql . '
            ORDER BY ' . noteListOrder($_GET), [$user['id'], $user['id'], ...$filterValues])->fetchAll();
        return ['notes' => array_map(fn ($row) => array_diff_key(noteJson($row), ['body' => true]), $rows)];
    }
    if ($route === 'note-create') {
        $title = noteTitle($input);
        $format = noteFormat($input);
        $body = array_key_exists('body', $input) ? noteBody($input) : '';
        // HTML carries its own task list, so the old checklist input only applies to text notes.
        $checklist = $format === 'html' ? '[]' : noteChecklist(array_key_exists('checklist', $input) ? $input['checklist'] : []);
        [$body, $text] = noteStorage($format, $body, $checklist);
        query($db, 'INSERT INTO notely_notes (owner_user_id, title, body, body_format, body_text, course_id, lecture_date, category,
            visibility, tags, checklist) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$user['id'], $title, $body, $format, $text, ...noteFields($input), $checklist]);
        $id = (string) $db->lastInsertId();
        http_response_code(201);
        return ['note' => loadNote($db, $id)];
    }

    if ($route === 'note-link') {
        $noteId = noteId($input['noteId'] ?? null);
        $eventId = $input['eventId'] ?? null;
        $date = $input['date'] ?? null;
        if ($eventId !== null) {
            $eventId = recordId($eventId, 'Choose a valid event.');
            if (!realDate($date)) throw new HttpError(422, 'Choose the date of the event.');
        }
        $role = noteRole($db, $noteId, $user, true);
        if ($role === 'none') throw new HttpError(404, 'This note could not be found.');
        if ($role !== 'owner') throw new HttpError(403, "Only the note's owner can link it to an event.");
        if ($eventId === null) {
            // Unlinking keeps the course and lecture date the link set.
            query($db, 'UPDATE notely_notes SET event_id = NULL, event_date = NULL, updated_at = updated_at WHERE id = ?', [$noteId]);
            return ['note' => loadNote($db, $noteId)];
        }
        // Another student's event gets the same answer as a missing one, so IDs can't be probed.
        $event = query($db, 'SELECT course_id, event_date, repeat_rule FROM notely_events WHERE id = ? AND owner_user_id = ? FOR UPDATE',
            [$eventId, $user['id']])->fetch();
        if (!$event) throw new HttpError(404, 'This event could not be found.');
        if (!eventHasDate($event, $date)) throw new HttpError(422, 'Choose a date when this event happens.');
        // A personal event (no course) keeps the note's own course.
        query($db, 'UPDATE notely_notes SET event_id = ?, event_date = ?, course_id = COALESCE(?, course_id), lecture_date = ?, updated_at = updated_at WHERE id = ?',
            [$eventId, $date, $event['course_id'], $date, $noteId]);
        return ['note' => loadNote($db, $noteId)];
    }

    $read = in_array($route, NOTE_READ_ROUTES, true);
    $id = noteId($read ? ($_GET['id'] ?? null) : ($input['id'] ?? null));
    if ($read) {
        // Notes the caller can't open look missing, so their existence isn't revealed.
        $role = noteRole($db, $id, $user, false);
        // A friend with a shared course reads the note itself, not its history, comments, or collaborators.
        if ($role === 'none' || ($role === 'friend' && $route !== 'note')) throw new HttpError(404, 'This note could not be found.');
        if ($role === 'friend') {
            return ['note' => loadNote($db, $id) + ['permission' => 'view',
                'sharedBy' => courseShareFor($db, $id, (string) $user['id'])]];
        }
        if ($route === 'note') return ['note' => loadNote($db, $id)];
        if ($route === 'note-versions') {
            $rows = query($db, 'SELECT id, note_id, title, body, body_format, author_name, created_at FROM notely_note_versions
                WHERE note_id = ? ORDER BY created_at DESC, id DESC', [$id])->fetchAll();
            return ['versions' => array_map(fn ($row) => ['id' => (string) $row['id'], 'noteId' => (string) $row['note_id'],
                'title' => $row['title'], 'author' => $row['author_name'],
                'body' => noteRowHtml($row),
                'createdAt' => isoTime($row['created_at'])], $rows)];
        }
        if ($route === 'note-comments') {
            $rows = query($db, 'SELECT c.id, c.note_id, c.body, c.author_user_id, u.name, c.created_at FROM notely_note_comments c
                JOIN notely_users u ON u.id = c.author_user_id WHERE c.note_id = ? ORDER BY c.created_at, c.id', [$id])->fetchAll();
            return ['comments' => array_map('commentJson', $rows)];
        }
        $rows = query($db, 'SELECT e.user_id FROM notely_note_editors e JOIN notely_users u ON u.id = e.user_id
            WHERE e.note_id = ? ORDER BY u.name, u.id', [$id])->fetchAll();
        return ['collaborators' => array_map(fn ($row) => loadCollaborator($db, $id, (string) $row['user_id']), $rows)];
    }

    if ($route === 'note-title') {
        $title = noteTitle($input);
        requireEditor($db, $id, $user);
        keepVersion($db, $id, $user, ['title' => $title]);
        query($db, 'UPDATE notely_notes SET title = ? WHERE id = ?', [$title, $id]);
        return ['note' => ['id' => $id, 'title' => $title]];
    }
    if ($route === 'note-content') {
        $format = noteFormat($input);
        $body = noteBody($input);
        requireEditor($db, $id, $user);
        // An HTML body replaces the old highlight and checklist columns; a text body keeps them.
        $checklist = $format === 'html' ? '[]'
            : (query($db, 'SELECT checklist FROM notely_notes WHERE id = ?', [$id])->fetchColumn() ?? '[]');
        [$body, $text] = noteStorage($format, $body, $checklist);
        keepVersion($db, $id, $user, ['body' => $body, 'body_format' => $format]);
        query($db, "UPDATE notely_notes SET body = ?, body_format = ?, body_text = ?, highlights = IF(? = 'html', '[]', highlights),
            checklist = ? WHERE id = ?", [$body, $format, $text, $format, $checklist, $id]);
        return ['note' => ['id' => $id, 'body' => loadNote($db, $id)['body']]];
    }
    if ($route === 'note-save') {
        $role = requireEditor($db, $id, $user);
        // Task #79 / Story #19: merge after locking so checklist-only saves and legacy
        // title/body saves preserve every omitted field, including existing tasks.
        $current = loadNote($db, $id);
        $merged = $input + $current;
        // Card 246: sharing is the owner's choice; an editor's save may not change who can see the note.
        if ($role !== 'owner' && $merged['visibility'] !== $current['visibility']) {
            throw new HttpError(403, "Only the note's owner can change who can see it.");
        }
        // Card 240: a save without a body keeps the stored body in its own format (loadNote's body is converted HTML).
        $format = array_key_exists('body', $input) ? noteFormat($input)
            : query($db, 'SELECT body_format FROM notely_notes WHERE id = ?', [$id])->fetchColumn();
        $body = array_key_exists('body', $input) ? noteBody($input)
            : query($db, 'SELECT body FROM notely_notes WHERE id = ?', [$id])->fetchColumn();
        $title = noteTitle($merged);
        $fields = noteFields($merged);
        // HTML carries its own marks and tasks, so the old highlight and checklist inputs only apply to text notes.
        $highlights = $format === 'html' ? '[]' : noteHighlights($merged['highlights'], $body);
        $checklist = $format === 'html' ? '[]' : noteChecklist($merged['checklist']);
        [$body, $text] = noteStorage($format, $body, $checklist);
        // History remains title/body-only; checklist saves update the edit date like metadata.
        keepVersion($db, $id, $user, ['title' => $title, 'body' => $body, 'body_format' => $format]);
        query($db, 'UPDATE notely_notes SET title = ?, body = ?, body_format = ?, body_text = ?, highlights = ?, course_id = ?,
            lecture_date = ?, category = ?, visibility = ?, tags = ?, checklist = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [$title, $body, $format, $text, $highlights, ...$fields, $checklist, $id]);
        return ['note' => loadNote($db, $id)];
    }
    if ($route === 'note-pin') {
        if (!is_bool($input['pinned'] ?? null)) throw new HttpError(422, 'Choose whether to pin this note.');
        requireEditor($db, $id, $user);
        // Pinning changes list placement, not the note's edit date.
        query($db, 'UPDATE notely_notes SET pinned = ?, updated_at = updated_at WHERE id = ?', [(int) $input['pinned'], $id]);
        return ['note' => loadNote($db, $id)];
    }
    if ($route === 'note-reminder') {
        if (!array_key_exists('remindAt', $input)) throw new HttpError(422, 'Choose a valid reminder time.');
        $remindAt = reminderTime($input['remindAt']);
        requireEditor($db, $id, $user);
        query($db, 'UPDATE notely_notes SET remind_at = ? WHERE id = ?', [$remindAt, $id]);
        return ['note' => loadNote($db, $id)];
    }
    if ($route === 'note-restore') {
        $versionId = recordId($input['versionId'] ?? null, 'Choose a valid version.');
        requireEditor($db, $id, $user);
        $version = query($db, 'SELECT title, body, body_format FROM notely_note_versions WHERE id = ? AND note_id = ?', [$versionId, $id])->fetch();
        if (!$version) throw new HttpError(404, 'Version not found.');
        keepVersion($db, $id, $user, $version);
        // Card 240 (bug 2): the version comes back with its own marks and tasks and none of the current marks.
        // A version kept before migration 019 is plain text with no marks; it keeps the current tasks (Story #19).
        $checklist = $version['body_format'] === 'html' ? '[]'
            : (query($db, 'SELECT checklist FROM notely_notes WHERE id = ?', [$id])->fetchColumn() ?? '[]');
        [$body, $text] = noteStorage($version['body_format'], $version['body'], $checklist);
        query($db, "UPDATE notely_notes SET title = ?, body = ?, body_format = ?, body_text = ?, highlights = '[]', checklist = ?,
            updated_at = CURRENT_TIMESTAMP WHERE id = ?", [$version['title'], $body, $version['body_format'], $text, $checklist, $id]);
        return ['note' => loadNote($db, $id)];
    }
    if ($route === 'note-delete') {
        requireOwner($db, $id, $user, "Only the note's owner can delete it.");
        // Collaborators, versions, and comments go with the note through ON DELETE CASCADE.
        query($db, 'DELETE FROM notely_notes WHERE id = ?', [$id]);
        return ['note' => ['id' => $id]];
    }
    if ($route === 'note-comment') {
        $raw = field($input, 'body');
        if (!preg_match('//u', $raw)) throw new HttpError(422, 'The comment contains characters we could not read.');
        $body = trimEdges($raw);
        if ($body === '') throw new HttpError(422, 'Write a comment first.');
        if (characterCount($body) > 2000) throw new HttpError(422, 'Comments can be at most 2000 characters.');
        $role = noteRole($db, $id, $user, true);
        if ($role === 'none') throw new HttpError(404, 'This note could not be found.');
        // Card 156: notes shared through a course are read only.
        if ($role === 'friend') throw new HttpError(403, 'You do not have permission to edit this note.');
        $visibility = query($db, 'SELECT visibility FROM notely_notes WHERE id = ?', [$id])->fetchColumn();
        if ($visibility !== 'shared') throw new HttpError(422, 'Share this note before adding comments.');
        query($db, 'INSERT INTO notely_note_comments (note_id, author_user_id, body) VALUES (?, ?, ?)', [$id, $user['id'], $body]);
        $row = query($db, 'SELECT c.id, c.note_id, c.body, c.author_user_id, u.name, c.created_at FROM notely_note_comments c
            JOIN notely_users u ON u.id = c.author_user_id WHERE c.id = ?', [$db->lastInsertId()])->fetch();
        return ['comment' => commentJson($row)];
    }
    if ($route === 'note-invite') {
        $email = validEmail(field($input, 'email'));
        requireOwner($db, $id, $user, "Only the note's owner can invite collaborators.");
        // Card 246: only the owner's accepted friends, so a stranger can't push notes into someone's list.
        $invitee = (string) query($db, 'SELECT id FROM notely_users WHERE email = ?', [$email])->fetchColumn();
        $me = (int) $user['id'];
        $friends = $invitee !== '' && query($db, "SELECT 1 FROM notely_friendships WHERE status = 'accepted'
            AND user_low = ? AND user_high = ?", [min($me, (int) $invitee), max($me, (int) $invitee)])->fetchColumn();
        if (!$friends) throw new HttpError(422, NOTE_FRIENDS_ONLY);
        query($db, "INSERT INTO notely_note_editors (note_id, user_id, permission) VALUES (?, ?, 'view')
            ON DUPLICATE KEY UPDATE permission = permission", [$id, $invitee]);
        return ['collaborator' => loadCollaborator($db, $id, (string) $invitee)];
    }
    if ($route === 'note-permission') {
        $userId = recordId($input['userId'] ?? null, 'Choose a valid collaborator.');
        $permission = $input['permission'] ?? null;
        if (!in_array($permission, ['view', 'edit'], true)) throw new HttpError(422, 'Choose view or edit permission.');
        requireOwner($db, $id, $user, "Only the note's owner can change permissions.");
        if (!loadCollaborator($db, $id, $userId)) throw new HttpError(404, 'Collaborator not found.');
        query($db, 'UPDATE notely_note_editors SET permission = ? WHERE note_id = ? AND user_id = ?', [$permission, $id, $userId]);
        return ['collaborator' => loadCollaborator($db, $id, $userId)];
    }
    if ($route === 'note-collaborator-remove') {
        $userId = recordId($input['userId'] ?? null, 'Choose a valid collaborator.');
        $role = noteRole($db, $id, $user, true);
        if ($role === 'none') throw new HttpError(404, 'This note could not be found.');
        // Card 246: the owner removes anyone; a collaborator may only remove themselves (leave the note).
        if ($role !== 'owner' && $userId !== (string) $user['id']) {
            throw new HttpError(403, "Only the note's owner can remove collaborators.");
        }
        if (!loadCollaborator($db, $id, $userId)) throw new HttpError(404, 'Collaborator not found.');
        query($db, 'DELETE FROM notely_note_editors WHERE note_id = ? AND user_id = ?', [$id, $userId]);
        return ['collaborator' => ['id' => $userId]];
    }
    if ($route === 'note-comment-delete') {
        $commentId = recordId($input['commentId'] ?? null, 'Choose a valid comment.');
        $role = noteRole($db, $id, $user, true);
        // Like note-comments: a reader through a shared course never sees the comments.
        if ($role === 'none' || $role === 'friend') throw new HttpError(404, 'This note could not be found.');
        $author = query($db, 'SELECT author_user_id FROM notely_note_comments WHERE id = ? AND note_id = ? FOR UPDATE',
            [$commentId, $id])->fetchColumn();
        if ($author === false) throw new HttpError(404, 'This comment could not be found.');
        // Card 246: authors delete their own comments; the owner may delete any comment on the note.
        if ($role !== 'owner' && (string) $author !== (string) $user['id']) {
            throw new HttpError(403, "Only the comment's author or the note's owner can delete it.");
        }
        query($db, 'DELETE FROM notely_note_comments WHERE id = ?', [$commentId]);
        return ['comment' => ['id' => $commentId]];
    }
    throw new HttpError(404, 'This action was not found.');
}
