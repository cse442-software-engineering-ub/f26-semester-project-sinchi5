const notes = [
  { id: 1, title: 'Binary trees / lecture 07', category: 'School', course: 'CS 240', date: 'Oct 14, 2024', updated: '2h ago', created: 'Oct 14', excerpt: 'Traversal patterns, balancing, and the shape of a good recursive thought.', pinned: true, color: 'green', collaborators: ['MC', 'JR'], comments: 3, body: '## Key idea\n\nA binary tree is a recursive structure: every node carries a value, a left subtree, and a right subtree. The key insight from today is that the shape of the tree affects the cost of every operation.\n\n- Every node stores a value\n- Each node can branch left or right\n- Balanced trees keep search fast' },
  { id: 2, title: 'The body as archive', category: 'School', course: 'ART 110', date: 'Oct 11, 2024', updated: 'Yesterday', created: 'Oct 11', excerpt: 'A working vocabulary for reading movement, memory, and the body in performance.', pinned: true, color: 'coral', collaborators: ['MC'], comments: 0, body: 'Performance can hold memory in gesture. Start by noticing what the body repeats, resists, and makes visible.' },
  { id: 3, title: 'Research questions / climate', category: 'School', course: 'BIO 201', date: 'Oct 09, 2024', updated: 'Oct 10', created: 'Oct 09', excerpt: 'Three possible angles for the lab write-up, with a note to check the freshwater dataset.', pinned: true, color: 'yellow', collaborators: ['MC', 'AL'], comments: 5, body: 'The strongest direction asks how temperature shifts affect dissolved oxygen across the freshwater sample.' },
  { id: 4, title: 'Sprint retro — October', category: 'Work', course: 'Northstar', date: 'Oct 08, 2024', updated: 'Oct 08', created: 'Oct 08', excerpt: 'Keep the small demos. Make the handoff doc feel less like a handoff.', pinned: false, color: 'orange', collaborators: ['MC', 'JR', 'SK'], comments: 8, body: 'Keep the small demos. Make the handoff doc feel less like a handoff. We can make the next sprint feel quieter by deciding earlier.' },
  { id: 5, title: 'Books to return', category: 'Personal', course: 'Personal', date: 'Oct 06, 2024', updated: 'Oct 06', created: 'Oct 06', excerpt: 'The books that are currently living on the floor beside my desk.', pinned: false, color: 'pink', collaborators: ['MC'], comments: 0, body: 'Return the library books before the end of the month.' },
  { id: 6, title: 'Field notes — Prospect Park', category: 'Personal', course: 'Personal', date: 'Oct 03, 2024', updated: 'Oct 04', created: 'Oct 03', excerpt: 'Goldenrod, one red-tailed hawk, and the feeling of the city going quiet.', pinned: false, color: 'pink', collaborators: ['MC'], comments: 1, body: 'Goldenrod, one red-tailed hawk, and the feeling of the city going quiet.' },
  { id: 7, title: 'Group project: sources', category: 'School', course: 'BIO 201', date: 'Sep 28, 2024', updated: 'Sep 30', created: 'Sep 28', excerpt: 'Shared source bank for the wetlands presentation.', pinned: false, color: 'yellow', collaborators: ['MC', 'AL'], comments: 4, body: 'Shared source bank for the wetlands presentation.' },
  { id: 8, title: 'Meeting prep — advising', category: 'Work', course: 'Northstar', date: 'Sep 26, 2024', updated: 'Sep 26', created: 'Sep 26', excerpt: 'What I want to ask, what I want to leave with, and one thing to remember.', pinned: false, color: 'orange', collaborators: ['MC'], comments: 0, body: 'What I want to ask, what I want to leave with, and one thing to remember.' },
  { id: 9, title: 'Formatting placeholder — lecture 07', category: 'School', course: 'CS 240', date: 'Oct 14, 2024', updated: 'Draft', created: 'Oct 14', excerpt: 'Placeholder note for testing headings, lists, inline emphasis, and spacing.', pinned: false, color: 'green', collaborators: ['MC'], comments: 0, body: 'Formatting placeholder: use this note to test a heading, a short paragraph, a checklist, and a code sample before the final note is polished.' },
  { id: 10, title: 'Formatting placeholder — meeting notes', category: 'Work', course: 'Northstar', date: 'Oct 10, 2024', updated: 'Draft', created: 'Oct 10', excerpt: 'Placeholder for a shared note with bullets, callouts, and an action list.', pinned: false, color: 'orange', collaborators: ['MC', 'JR'], comments: 0, body: 'Formatting placeholder: add a summary here, then capture decisions, open questions, and next steps.' },
].map((note) => ({ ...note, collaborators: note.collaborators.map((initials) => initials === 'MC' ? 'OV' : initials) }));

let events = [
  { id: 1, day: 'MON', date: '14', month: 'OCT', course: 'CS 240', title: 'Binary trees lab', detail: 'Lab 05 · due tomorrow', time: '9:00 AM', type: 'ASSIGNMENT', color: 'green', status: 'upcoming', today: false },
  { id: 2, day: 'TUE', date: '15', month: 'OCT', course: 'ART 110', title: 'Studio critique', detail: 'Bring one work-in-progress', time: '2:30 PM', type: 'CLASS', color: 'coral', status: 'upcoming', today: true },
  { id: 3, day: 'WED', date: '16', month: 'OCT', course: 'BIO 201', title: 'Quiz 04', detail: 'Chapters 8–9 · 12 questions', time: '—', type: 'EXAM', color: 'yellow', status: 'upcoming', today: false },
  { id: 4, day: 'THU', date: '17', month: 'OCT', course: 'CS 240', title: 'Lecture 08 · Graphs', detail: 'Read pages 201–224', time: '11:00 AM', type: 'LECTURE', color: 'green', status: 'upcoming', today: false },
  { id: 5, day: 'FRI', date: '18', month: 'OCT', course: 'BIO 201', title: 'Lab report 03', detail: 'Submit before midnight', time: '11:59 PM', type: 'ASSIGNMENT', color: 'yellow', status: 'upcoming', today: false },
];
let activeCategory = 'All';
let weekOffset = 0;
let activeNoteId = null;

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

function colorClass(color) { return color === 'green' ? '' : ` ${color}`; }
function renderSchedule(target, full = false) {
  target.innerHTML = events.map((event) => `
    <div class="schedule-row ${event.today && !full ? 'today' : ''}" data-event-id="${event.id}">
      <div class="schedule-date">${event.day}<strong>${event.date} ${event.month}</strong></div>
      <div class="schedule-course"><span class="course-dot${colorClass(event.color)}"></span>${event.course}</div>
      <div class="schedule-event"><strong>${event.title}</strong><small>${event.detail}</small></div>
      <div class="schedule-type">${event.type}</div>
      ${full ? `<div class="event-status ${event.status}"><span class="status-dot"></span>${event.status}</div>` : ''}
      <div class="schedule-time">${event.time}</div>
      <button class="schedule-row-action" aria-label="Edit ${event.title}">✎</button>
    </div>`).join('');
  $$('.schedule-row-action', target).forEach((button) => button.addEventListener('click', (e) => { e.stopPropagation(); openEventModal(Number(button.closest('.schedule-row').dataset.eventId)); }));
  $$('.schedule-row', target).forEach((row) => row.addEventListener('click', () => openEventModal(Number(row.dataset.eventId))));
}

function renderNotes(target, mode = 'cards', query = '') {
  const normalized = query.trim().toLowerCase();
  const filtered = notes.filter((note) => (activeCategory === 'All' || note.category === activeCategory) && (!normalized || `${note.title} ${note.course} ${note.excerpt} ${note.body}`.toLowerCase().includes(normalized)));
  if (!filtered.length) { target.innerHTML = '<div class="empty-state">No notes match that search yet.</div>'; return; }
  if (mode === 'cards') {
    target.innerHTML = filtered.filter((note) => note.pinned).slice(0, 3).map((note) => noteCard(note)).join('');
  } else {
    const sort = $('#sort-select')?.value || 'updated';
    const sorted = [...filtered].sort((a, b) => sort === 'alpha' ? a.title.localeCompare(b.title) : sort === 'created' ? b.id - a.id : a.id === 1 ? -1 : b.id - a.id);
    target.innerHTML = sorted.map((note) => listNote(note)).join('');
  }
  $$('.note-card, .list-note', target).forEach((card) => card.addEventListener('click', () => showNoteDetail(Number(card.dataset.noteId))));
}
function noteCard(note) { return `<article class="note-card" data-note-id="${note.id}"><div class="note-card-top"><span class="note-category"><i class="collection-dot ${note.color}"></i>${note.category}</span><span class="pin-icon">⌖</span></div><h3>${note.title}</h3><p class="note-excerpt">${note.excerpt}</p><div class="note-meta"><span>${note.course} · ${note.updated}</span><span>${note.comments ? '◌ Comments' : '—'}</span></div></article>`; }
function listNote(note) { return `<article class="list-note" data-note-id="${note.id}"><i class="collection-dot ${note.color}"></i><div><h3>${note.title}</h3><p>${note.excerpt}</p></div><div class="list-note-meta">${note.pinned ? '<span class="pin-icon">⌖</span>' : ''}${note.updated}</div></article>`; }

function showView(view) {
  const panel = $(`[data-panel="${view}"]`); if (!panel) return;
  $$('.view-panel').forEach((item) => item.classList.remove('active-view'));
  panel.classList.add('active-view');
  $$('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  const name = view === 'overview' ? 'Overview' : view === 'notes' ? 'All notes' : view === 'schedule' ? 'Course schedule' : 'Shared with me';
  $('#breadcrumb-current').textContent = name;
  $('#breadcrumb-note-wrap').hidden = true;
  if (view === 'notes') renderNotes($('#all-notes-list'), 'list', $('#notes-search-input').value);
  if (view === 'schedule') renderSchedule($('#full-schedule'), true);
  if (view === 'shared') renderShared();
}

function escapeHtml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function inlineMarkdown(value) { return escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/_([^_]+)_/g, '<em>$1</em>'); }
function markdownToHtml(markdown) {
  const lines = markdown.replaceAll('\r', '').split('\n');
  let html = '';
  let listType = null;
  let inCode = false;
  const closeList = () => { if (listType) { html += '</ul>'; listType = null; } };
  lines.forEach((line) => {
    if (line.trim().startsWith('```')) { closeList(); if (inCode) html += '</code></pre>'; else html += '<pre><code>'; inCode = !inCode; return; }
    if (inCode) { html += `${escapeHtml(line)}\n`; return; }
    if (!line.trim()) { closeList(); return; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const quote = line.match(/^\s*>\s+(.+)$/);
    if (heading) { closeList(); const level = heading[1].length; html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`; }
    else if (task) { if (listType !== 'task') { closeList(); html += '<ul class="markdown-list task-list">'; listType = 'task'; } html += `<li><label><input type="checkbox" ${task[1].toLowerCase() === 'x' ? 'checked' : ''} disabled /><span>${inlineMarkdown(task[2])}</span></label></li>`; }
    else if (bullet) { if (listType !== 'bullet') { closeList(); html += '<ul class="markdown-list">'; listType = 'bullet'; } html += `<li>${inlineMarkdown(bullet[1])}</li>`; }
    else if (quote) { closeList(); html += `<blockquote>${inlineMarkdown(quote[1])}</blockquote>`; }
    else { closeList(); html += `<p>${inlineMarkdown(line)}</p>`; }
  });
  closeList(); if (inCode) html += '</code></pre>'; return html || '<p class="markdown-empty">Start writing your note...</p>';
}
function getNoteMarkdown(note) { if (note.markdown === undefined) note.markdown = note.body; return note.markdown; }
function renderChecklist(note) {
  if (!note.checklist) note.checklist = [{ text: 'Review lecture examples', done: false }, { text: 'Add one question for office hours', done: true }, { text: 'Link the reading to this note', done: false }];
  $('#note-page-checklist').innerHTML = note.checklist.map((item, index) => `<label class="page-check-item"><input type="checkbox" data-check-index="${index}" ${item.done ? 'checked' : ''} /><span>${escapeHtml(item.text)}</span></label>`).join('');
  $$('[data-check-index]', $('#note-page-checklist')).forEach((checkbox) => checkbox.addEventListener('change', () => { note.checklist[Number(checkbox.dataset.checkIndex)].done = checkbox.checked; }));
}
function updateNotePreview(note) { $('#note-page-rendered').innerHTML = markdownToHtml(getNoteMarkdown(note)); }
function showNoteDetail(id) {
  const note = notes.find((item) => item.id === id);
  const panel = $('[data-panel="note-detail"]');
  if (!note || !panel) return;
  activeNoteId = id;
  $$('.view-panel').forEach((item) => item.classList.remove('active-view'));
  panel.classList.add('active-view');
  $$('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === 'notes'));
  $('#breadcrumb-current').textContent = 'All notes';
  $('#breadcrumb-note').textContent = note.title;
  $('#breadcrumb-note-wrap').hidden = false;
  $('#note-page-category').innerHTML = `<span class="collection-dot ${note.color}"></span>${note.category} · ${note.course} · ${note.date}`;
  $('#note-page-title').textContent = note.title;
  $('#note-markdown-input').value = getNoteMarkdown(note);
  $('#note-page-editor').hidden = true;
  $('#note-page-rendered').hidden = false;
  $('#note-page-edit-toggle').textContent = 'Edit note';
  updateNotePreview(note);
  renderChecklist(note);
  const people = { OV: ['Oliver Varney', 'Owner'], JR: ['Jordan Rivera', 'Editor'], AL: ['Avery Lee', 'Viewer'], SK: ['Sam Kim', 'Viewer'] };
  $('#note-page-collaborators').innerHTML = note.collaborators.map((initials, index) => { const person = people[initials] || [initials, 'Collaborator']; return `<div class="page-collaborator"><div class="avatar ${index === 0 ? 'avatar-maya' : ''}" style="${index ? 'background:#f5c9b9;color:#865548' : ''}">${initials}</div><div class="page-collaborator-copy"><strong>${person[0]}</strong><small>${person[1]}</small></div><span class="page-collab-role">${person[1] === 'Owner' ? 'Can edit' : person[1]}</span></div>`; }).join('');
  $('#note-page-comments').innerHTML = note.comments ? '<div class="page-comment"><div class="avatar" style="background:#f5c9b9;color:#865548">JR</div><div class="page-comment-copy"><strong>Jordan Rivera</strong><small>This connects nicely to the reading. I added one follow-up question.</small></div></div>' : '<div class="page-empty-comment">No comments yet. Start the conversation.</div>';
}

function setNoteEditMode(editing) {
  const note = notes.find((item) => item.id === activeNoteId); if (!note) return;
  const editor = $('#note-page-editor'); const input = $('#note-markdown-input');
  editor.hidden = !editing; $('#note-page-rendered').hidden = editing; $('#note-page-edit-toggle').textContent = editing ? 'Done editing' : 'Edit note';
  $('#note-markdown-preview').textContent = 'Preview'; input.hidden = false;
  if (editing) { input.value = getNoteMarkdown(note); input.focus(); }
  else { note.body = note.markdown; showToast('Note saved'); }
}
function insertMarkdown(action) {
  const input = $('#note-markdown-input'); const start = input.selectionStart; const end = input.selectionEnd; const selected = input.value.slice(start, end);
  const inline = { bold: ['**', '**'], italic: ['*', '*'], code: ['`', '`'] };
  if (inline[action]) {
    const [before, after] = inline[action]; input.setRangeText(`${before}${selected || 'text'}${after}`, start, end, 'select');
  } else {
    const prefixes = { heading: '## ', bullet: '- ', checklist: '- [ ] ', quote: '> ' }; const prefix = prefixes[action]; if (!prefix) return;
    const lineStart = input.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1; const nextLine = input.value.indexOf('\n', end); const lineEnd = nextLine === -1 ? input.value.length : nextLine; const source = input.value.slice(lineStart, lineEnd);
    const replacement = source.split('\n').map((line) => `${prefix}${line}`).join('\n'); input.setRangeText(replacement, lineStart, lineEnd, 'end');
  }
  input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
}
function openModal(content, className = '') { content = content.replaceAll('Maya Chen', 'Oliver Varney').replaceAll('Maya', 'Oliver').replaceAll('MC', 'OV'); $('#modal-content').innerHTML = content; $('#modal-card').className = `modal ${className}`.trim(); $('#modal-backdrop').classList.add('open'); $('#modal-backdrop').setAttribute('aria-hidden', 'false'); }
function closeModal() { $('#modal-backdrop').classList.remove('open'); $('#modal-backdrop').setAttribute('aria-hidden', 'true'); $('#modal-card').className = 'modal'; }

const tourSteps = [
  { eyebrow: '01 / 05 · Start with the source', title: 'Upload once. See the semester take shape.', copy: 'Drop in a syllabus and margin pulls out the structure: course weeks, subjects, assignments, exams, and the dates that matter.', visual: '<span class="tour-visual-label">From one PDF to a living course map</span><div class="tour-flow"><div class="tour-flow-card"><strong>↥ Syllabus</strong><small>biology-201.pdf</small></div><span class="tour-flow-arrow">→</span><div class="tour-flow-card highlight"><strong>Events mapped</strong><small>detected + ready</small></div><span class="tour-flow-arrow">→</span><div class="tour-flow-card"><strong>Schedule</strong><small>week by week</small></div></div>', action: 'Open syllabus demo', actionType: 'syllabus' },
  { eyebrow: '02 / 05 · Stay current', title: 'Your schedule is allowed to change.', copy: 'Syllabi are a starting point. Edit anything margin detected, or add a deadline that showed up later. Your schedule reflects the latest version.', visual: '<span class="tour-visual-label">A schedule you can keep honest</span><div class="tour-flow"><div class="tour-flow-card"><strong>Quiz 04</strong><small>Wed · 16 Oct</small></div><span class="tour-flow-arrow">→</span><div class="tour-flow-card highlight"><strong>Save changes</strong><small>edit details inline</small></div><span class="tour-flow-arrow">→</span><div class="tour-flow-card"><strong>Updated</strong><small>visible everywhere</small></div></div>', action: 'Open course schedule', actionType: 'schedule' },
  { eyebrow: '03 / 05 · Bring the page in', title: 'Handwritten notes, made findable.', copy: 'Take a photo of a physical page and margin cleans it up, reads the course and lecture date, then files it in the right place.', visual: '<span class="tour-visual-label">A page becomes part of the course</span><div class="tour-note-grid"><div class="tour-note-sample"><small>CS 240 · OCT 14</small><strong>Binary trees / lecture 07</strong><small>saved just now · organized automatically</small></div><div class="tour-checks"><div><span>✓</span> Course detected</div><div><span>✓</span> Lecture date found</div><div><span>✓</span> Digital copy saved</div></div></div>', action: 'Try note capture', actionType: 'capture' },
  { eyebrow: '04 / 05 · Keep the useful things close', title: 'Search the whole semester in a breath.', copy: 'Use keywords, categories, sort order, and pins to get to the right note quickly—even when your workspace has grown to hundreds of pages.', visual: '<span class="tour-visual-label">The right note, without the rummage</span><div class="tour-flow"><div class="tour-flow-card highlight"><strong>⌕ “binary”</strong><small>matching note</small></div><div class="tour-flow-card"><strong>School</strong><small>organized together</small></div><div class="tour-flow-card"><strong>⌖ Pinned</strong><small>always up top</small></div></div>', action: 'Explore all notes', actionType: 'notes' },
  { eyebrow: '05 / 05 · Make space together', title: 'A note can hold a whole study group.', copy: 'Invite classmates with view, comment, or edit access. Leave comments, check off tasks, and keep the note moving together.', visual: '<span class="tour-visual-label">One note, many ways to move forward</span><div class="tour-collab-row"><div class="avatar avatar-maya">MC</div><div><div class="tour-collab-line"></div><div class="tour-collab-line short"></div></div><span class="tour-flow-arrow">→</span><div class="avatar" style="background:#f5c9b9;color:#865548">JR</div><div class="tour-checks"><div><span>◌</span> Comments</div><div><span>✓</span> Tasks</div></div></div>', action: 'See shared notes', actionType: 'shared' },
];
let tourStep = 0;
function openTourModal(step = 0) { tourStep = step; openModal('', 'tour-modal'); renderTourStep(); }
function renderTourStep() {
  const current = tourSteps[tourStep]; current.visual = current.visual.replaceAll('MC', 'OV');
  $('#modal-content').innerHTML = `<div class="tour-shell"><aside class="tour-rail"><span class="eyebrow">A quick tour</span><div class="tour-steps">${tourSteps.map((item, index) => `<button class="tour-step-nav ${index === tourStep ? 'active' : ''}" data-tour-step="${index}"><span>0${index + 1}</span><b>${item.eyebrow.split('·')[1].trim()}</b></button>`).join('')}</div><div class="tour-brand">margin°</div></aside><section class="tour-main"><div class="tour-main-header"><span class="eyebrow">${current.eyebrow}</span><h2>${current.title}</h2><p class="tour-copy">${current.copy}</p></div><div class="tour-visual">${current.visual}</div><div class="tour-footer"><div class="tour-progress">${tourSteps.map((_, index) => `<i class="${index <= tourStep ? 'active' : ''}"></i>`).join('')}</div><button class="tour-try" id="tour-try">${current.action} ↗</button><div class="tour-footer-actions"><button class="button button-quiet" id="tour-back" ${tourStep === 0 ? 'disabled' : ''}>Back</button><button class="button button-dark" id="tour-next">${tourStep === tourSteps.length - 1 ? 'Done' : 'Next'} <span>→</span></button></div></div></section></div>`;
  $$('.tour-step-nav').forEach((button) => button.addEventListener('click', () => { tourStep = Number(button.dataset.tourStep); renderTourStep(); }));
  $('#tour-back').addEventListener('click', () => { if (tourStep > 0) { tourStep -= 1; renderTourStep(); } });
  $('#tour-next').addEventListener('click', () => { if (tourStep < tourSteps.length - 1) { tourStep += 1; renderTourStep(); } else closeModal(); });
  $('#tour-try').addEventListener('click', () => { const action = current.actionType; closeModal(); if (action === 'syllabus') openSyllabusModal(); if (action === 'capture') openCaptureModal(); if (action === 'schedule') showView('schedule'); if (action === 'notes') showView('notes'); if (action === 'shared') showView('shared'); });
}
function openEventModal(id = null) {
  const event = events.find((item) => item.id === id);
  openModal(`<span class="eyebrow">${event ? 'Edit course event' : 'New course event'}</span><h2>${event ? 'Make it current.' : 'Put it on the map.'}</h2><p class="modal-lede">${event ? 'Change the details below and your schedule will update immediately.' : 'Add a deadline, class, or anything else you need to remember this semester.'}</p><form class="modal-form" id="event-form"><div class="field"><label for="event-title">Event title</label><input id="event-title" name="title" required value="${event?.title || ''}" placeholder="e.g. Midterm study session" /></div><div class="form-two-col"><div class="field"><label for="event-course">Course or category</label><input id="event-course" name="course" required value="${event?.course || ''}" placeholder="e.g. CS 240" /></div><div class="field"><label for="event-type">Type</label><select id="event-type" name="type"><option ${event?.type === 'ASSIGNMENT' ? 'selected' : ''}>ASSIGNMENT</option><option ${event?.type === 'EXAM' ? 'selected' : ''}>EXAM</option><option ${event?.type === 'CLASS' ? 'selected' : ''}>CLASS</option><option ${event?.type === 'LECTURE' ? 'selected' : ''}>LECTURE</option></select></div></div><div class="form-two-col"><div class="field"><label for="event-date">Date</label><input id="event-date" name="date" type="date" value="2024-10-${event?.date || '21'}" /></div><div class="field"><label for="event-time">Time</label><input id="event-time" name="time" type="time" value="09:00" /></div></div><div class="field"><label for="event-detail">Details</label><textarea id="event-detail" name="detail" placeholder="Add a little context">${event?.detail || ''}</textarea></div><div class="modal-footer"><button type="button" class="button button-quiet" id="cancel-modal">Cancel</button><button type="submit" class="button button-dark">${event ? 'Save changes' : 'Add to schedule'} <span>↗</span></button></div></form>`);
  $('#cancel-modal').addEventListener('click', closeModal); $('#event-form').addEventListener('submit', (e) => { e.preventDefault(); const data = new FormData(e.target); const date = new Date(data.get('date') + 'T12:00:00'); const updated = { id: event?.id || Date.now(), day: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(), date: date.getDate(), month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), course: data.get('course'), title: data.get('title'), detail: data.get('detail') || 'Added manually', time: data.get('time') ? new Date(`2024-01-01T${data.get('time')}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—', type: data.get('type'), color: event?.color || 'green', status: 'upcoming', today: false }; if (event) events = events.map((item) => item.id === event.id ? updated : item); else events.push(updated); renderSchedule($('#overview-schedule')); if ($('#full-schedule')) renderSchedule($('#full-schedule'), true); closeModal(); showToast(event ? 'Event updated in your schedule' : 'Event added to your schedule'); });
}
function openReminderModal(note) { openModal(`<span class="eyebrow">Keep it in view</span><h2>Set a reminder.</h2><p class="modal-lede">We’ll nudge you when it’s time to return to “${note.title}”.</p><form class="modal-form" id="reminder-form"><div class="form-two-col"><div class="field"><label for="reminder-date">Date</label><input id="reminder-date" type="date" value="2024-10-18" /></div><div class="field"><label for="reminder-time">Time</label><input id="reminder-time" type="time" value="09:00" /></div></div><div class="modal-footer"><button type="button" class="button button-quiet" id="cancel-modal">Cancel</button><button type="submit" class="button button-dark">Set reminder <span>◷</span></button></div></form>`); $('#cancel-modal').addEventListener('click', closeModal); $('#reminder-form').addEventListener('submit', (e) => { e.preventDefault(); closeModal(); showToast('Reminder set for Friday at 9:00 AM'); }); }
function openInviteModal(note = null) { openModal(`<span class="eyebrow">Make space together</span><h2>Invite a collaborator.</h2><p class="modal-lede">Share ${note ? `“${note.title}”` : 'your note'} with someone in your study group.</p><form class="modal-form" id="invite-form"><div class="field"><label for="invite-email">Email address</label><input id="invite-email" type="email" required placeholder="classmate@school.edu" /></div><div class="field"><label for="invite-permission">Permission</label><select id="invite-permission"><option>Can edit</option><option>Can view</option><option>Can comment</option></select></div><div class="modal-footer"><button type="button" class="button button-quiet" id="cancel-modal">Cancel</button><button type="submit" class="button button-dark">Send invite <span>↗</span></button></div></form>`); $('#cancel-modal').addEventListener('click', closeModal); $('#invite-form').addEventListener('submit', (e) => { e.preventDefault(); closeModal(); showToast('Invite sent — your collaborator is on the way'); }); }
function openSyllabusModal(fileName = 'biology-201-syllabus.pdf') { openModal(`<span class="eyebrow">Syllabus reader</span><h2>We found the shape.</h2><p class="modal-lede">Here’s what margin detected in <strong>${fileName}</strong>. You can edit anything before it joins your schedule.</p><div class="scan-result"><span class="scan-check">✓ SCAN COMPLETE</span><h3>BIO 201 · Ecology & evolution</h3><div class="detected-grid"><div class="detected-chip">COURSE START<strong>Aug 26, 2024</strong></div><div class="detected-chip">INSTRUCTOR<strong>Dr. Lena Ortiz</strong></div><div class="detected-chip">ASSIGNMENTS<strong>Found in syllabus</strong></div><div class="detected-chip">EXAMS & QUIZZES<strong>Found in syllabus</strong></div></div></div><div class="modal-footer"><button class="button button-quiet" id="cancel-modal">Review later</button><button class="button button-dark" id="confirm-syllabus">Add to schedule <span>↗</span></button></div>`); $('#cancel-modal').addEventListener('click', closeModal); $('#confirm-syllabus').addEventListener('click', () => { closeModal(); showToast('BIO 201 added — events mapped to your schedule'); }); }
function openCaptureModal() { openModal(`<span class="eyebrow">Add a thought</span><h2>Bring the page in.</h2><p class="modal-lede">Take a photo of your handwritten notes. We’ll clean it up, read the course and lecture date, and file it for you.</p><div class="upload-zone" id="note-modal-drop" tabindex="0"><span class="upload-icon">↑</span><span><strong>Upload a photo or scan</strong><small>JPG, PNG or PDF · up to 20 MB</small></span><span class="upload-arrow">↗</span></div><div class="mini-file-preview"><span>✦</span><div><strong>Automatic organization</strong><br />We’ll look for the course, lecture date, and key topics.</div></div><div class="modal-footer"><button class="button button-quiet" id="cancel-modal">Cancel</button></div>`); $('#cancel-modal').addEventListener('click', closeModal); $('#note-modal-drop').addEventListener('click', () => $('#note-file-input').click()); $('#note-file-input').onchange = () => { closeModal(); showToast('Handwritten note saved to CS 240 · Oct 14'); }; }
function renderShared() { $('#shared-list').innerHTML = notes.filter((note) => note.collaborators.length > 1).slice(0, 4).map((note) => `<article class="shared-note" data-note-id="${note.id}"><div class="note-avatar-stack">${note.collaborators.map((initials, i) => `<div class="avatar ${i === 0 ? 'avatar-maya' : ''}" style="${i ? 'background:#f5c9b9;color:#865548' : ''}">${initials}</div>`).join('')}</div><div class="shared-note-copy"><h3>${note.title}</h3><p>${note.course} · ${note.updated}</p></div><span class="comment-badge">◌ Comments</span><span class="shared-note-time">Open ↗</span></article>`).join(''); $$('.shared-note').forEach((item) => item.addEventListener('click', () => showNoteDetail(Number(item.dataset.noteId)))); }
function showToast(message) { $('#toast-copy').textContent = message; $('#toast').classList.add('visible'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3400); }

const themeNames = { mint: 'Mint', apricot: 'Apricot', ocean: 'Ocean' };
function closeThemeMenu() { $('#theme-menu').hidden = true; $('#theme-toggle').setAttribute('aria-expanded', 'false'); }
function applyTheme(theme) {
  if (!themeNames[theme]) theme = 'mint';
  document.documentElement.dataset.theme = theme;
  $$('.theme-option').forEach((option) => { option.classList.toggle('active', option.dataset.themeOption === theme); option.querySelector('span:last-child').textContent = option.dataset.themeOption === theme ? '✓' : ''; });
  $('#theme-toggle').setAttribute('aria-label', `Change color scheme. Current: ${themeNames[theme]}`);
  try { localStorage.setItem('margin-theme', theme); } catch (error) { /* Local preview may not expose storage. */ }
}
let initialTheme = 'mint';
try { initialTheme = localStorage.getItem('margin-theme') || 'mint'; } catch (error) { /* Local preview may not expose storage. */ }
applyTheme(initialTheme);
$('#theme-toggle').addEventListener('click', () => { const menu = $('#theme-menu'); menu.hidden = !menu.hidden; $('#theme-toggle').setAttribute('aria-expanded', String(!menu.hidden)); });
$$('.theme-option').forEach((option) => option.addEventListener('click', () => { applyTheme(option.dataset.themeOption); closeThemeMenu(); showToast(`${themeNames[option.dataset.themeOption]} color scheme applied`); }));
document.addEventListener('click', (event) => { if (!event.target.closest('.theme-picker')) closeThemeMenu(); });

$$('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
$$('[data-view-target]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.viewTarget)));
$$('.nav-item.collection').forEach((item) => item.addEventListener('click', () => { activeCategory = item.dataset.filter; showView('notes'); $$('.filter-pill').forEach((pill) => pill.classList.toggle('active', pill.dataset.category === activeCategory)); }));
$('#search-input').addEventListener('input', (e) => { const value = e.target.value; if (value.length > 1) { showView('notes'); $('#notes-search-input').value = value; renderNotes($('#all-notes-list'), 'list', value); } }); $('#search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') showView('notes'); });
$('#notes-search-input').addEventListener('input', (e) => renderNotes($('#all-notes-list'), 'list', e.target.value)); $('#sort-select').addEventListener('change', () => renderNotes($('#all-notes-list'), 'list', $('#notes-search-input').value));
$$('.filter-pill').forEach((pill) => pill.addEventListener('click', () => { activeCategory = pill.dataset.category; $$('.filter-pill').forEach((item) => item.classList.toggle('active', item === pill)); renderNotes($('#all-notes-list'), 'list', $('#notes-search-input').value); }));
$('#add-event-button').addEventListener('click', () => openEventModal()); $('#add-event-button-2').addEventListener('click', () => openEventModal()); $('#invite-button').addEventListener('click', () => openInviteModal()); $('#capture-note-button').addEventListener('click', openCaptureModal); $('#capture-note-button-2').addEventListener('click', openCaptureModal); $('#upload-syllabus-button').addEventListener('click', () => $('#syllabus-input').click());
$('#syllabus-dropzone').addEventListener('click', () => $('#syllabus-input').click()); $('#syllabus-dropzone').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') $('#syllabus-input').click(); }); $('#syllabus-input').addEventListener('change', (e) => { if (e.target.files[0]) openSyllabusModal(e.target.files[0].name); });
['dragenter', 'dragover'].forEach((name) => $('#syllabus-dropzone').addEventListener(name, (e) => { e.preventDefault(); $('#syllabus-dropzone').classList.add('dragging'); })); ['dragleave', 'drop'].forEach((name) => $('#syllabus-dropzone').addEventListener(name, (e) => { e.preventDefault(); $('#syllabus-dropzone').classList.remove('dragging'); })); $('#syllabus-dropzone').addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) openSyllabusModal(e.dataTransfer.files[0].name); });
$('#modal-close').addEventListener('click', closeModal); $('#modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); }); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search-input').focus(); } });
$('#back-to-notes').addEventListener('click', () => showView('notes')); $('#note-page-invite').addEventListener('click', () => { const note = notes.find((item) => item.id === activeNoteId); if (note) openInviteModal(note); }); $('#note-page-comment-button').addEventListener('click', () => { const input = $('#note-page-comment-input'); if (!input.value.trim()) return; const comments = $('#note-page-comments'); const empty = $('.page-empty-comment', comments); if (empty) empty.remove(); comments.insertAdjacentHTML('beforeend', '<div class="page-comment"><div class="avatar avatar-maya">OV</div><div class="page-comment-copy"><strong>Oliver Varney</strong><small>' + input.value.trim() + '</small></div></div>'); input.value = ''; showToast('Comment added to this note'); });
$('#previous-week').addEventListener('click', () => { weekOffset -= 1; updateWeekLabel(); showToast('Showing the previous week'); }); $('#next-week').addEventListener('click', () => { weekOffset += 1; updateWeekLabel(); showToast('Showing the next week'); }); function updateWeekLabel() { const labels = ['Oct 07 — 13, 2024', 'Oct 14 — 20, 2024', 'Oct 21 — 27, 2024']; $('#week-label').textContent = labels[Math.max(0, Math.min(2, weekOffset + 1))]; }
$$('.week-tab').forEach((tab) => tab.addEventListener('click', () => { $$('.week-tab').forEach((item) => item.classList.remove('active')); tab.classList.add('active'); renderSchedule($('#full-schedule'), true); showToast(`Showing ${tab.textContent.toLowerCase()}`); }));

$('#note-page-edit-toggle').addEventListener('click', () => { const editing = $('#note-page-editor').hidden; setNoteEditMode(editing); });
$('#note-markdown-input').addEventListener('input', (event) => { const note = notes.find((item) => item.id === activeNoteId); if (!note) return; note.markdown = event.target.value; updateNotePreview(note); });
$$('[data-markdown-action]').forEach((button) => button.addEventListener('click', () => insertMarkdown(button.dataset.markdownAction)));
$('#note-markdown-preview').addEventListener('click', () => { const preview = $('#note-page-rendered'); const input = $('#note-markdown-input'); const shouldShowPreview = preview.hidden; preview.hidden = !shouldShowPreview; input.hidden = shouldShowPreview; $('#note-markdown-preview').textContent = shouldShowPreview ? 'Edit' : 'Preview'; });
$('#note-checklist-add').addEventListener('click', () => { const note = notes.find((item) => item.id === activeNoteId); const input = $('#note-checklist-input'); const text = input.value.trim(); if (!note || !text) return; if (!note.checklist) renderChecklist(note); note.checklist.push({ text, done: false }); input.value = ''; renderChecklist(note); showToast('Checklist item added'); });
$('#note-checklist-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('#note-checklist-add').click(); });

renderSchedule($('#overview-schedule')); renderNotes($('#overview-notes')); renderNotes($('#all-notes-list'), 'list');
