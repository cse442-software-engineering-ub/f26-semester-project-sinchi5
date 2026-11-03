-- Task #86 / Story #31: store text highlight ranges with each note.
ALTER TABLE notely_notes
    ADD COLUMN highlights TEXT NULL AFTER body;