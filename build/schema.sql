-- Materialised knowledge base for the gamified programming platform.
--
-- Every table here is written by build_kb.py from the ontology. Nothing in the
-- running platform writes to any of them except `attempt` and `learner_process`
-- (rows with source = 'earned'). The platform never reasons; it reads what the
-- reasoner and the SHACL validator already concluded. See Section 4.6.

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS build_meta;
DROP TABLE IF EXISTS traceability;
DROP TABLE IF EXISTS attempt;
DROP TABLE IF EXISTS validation;
DROP TABLE IF EXISTS design_element;
DROP TABLE IF EXISTS design;
DROP TABLE IF EXISTS context;
DROP TABLE IF EXISTS activity_criterion;
DROP TABLE IF EXISTS activity;
DROP TABLE IF EXISTS learner_process;
DROP TABLE IF EXISTS learner;
DROP TABLE IF EXISTS element_level;
DROP TABLE IF EXISTS element;
DROP TABLE IF EXISTS dimension;
DROP TABLE IF EXISTS criterion;
DROP TABLE IF EXISTS outcome;
DROP TABLE IF EXISTS process;
DROP TABLE IF EXISTS module;

-- ---------------------------------------------------------------- curriculum
CREATE TABLE module (
    id     TEXT PRIMARY KEY,          -- PPA115D
    label  TEXT NOT NULL
);

CREATE TABLE process (
    id     TEXT PRIMARY KEY,          -- P10
    label  TEXT NOT NULL
);

CREATE TABLE outcome (
    id         TEXT PRIMARY KEY,      -- LO_PPA115D_D_2
    module_id  TEXT NOT NULL REFERENCES module(id),
    label      TEXT NOT NULL,
    sort_key   TEXT NOT NULL
);

CREATE TABLE criterion (
    id              TEXT PRIMARY KEY, -- AC_PPA115D_D_2_1
    outcome_id      TEXT NOT NULL REFERENCES outcome(id),
    code            TEXT NOT NULL,    -- D.2.1
    text            TEXT NOT NULL,
    asserted_level  TEXT NOT NULL,    -- the level the study guide text implies
    process_id      TEXT REFERENCES process(id),
    flag            TEXT,             -- Thompson | Split | Repeat | Ambiguous | ''
    note            TEXT
);

-- ---------------------------------------------------------------- game elements
CREATE TABLE dimension (
    id            TEXT PRIMARY KEY,   -- Personal
    label         TEXT NOT NULL,
    absence_note  TEXT                -- what Toda et al. say follows from its absence
);

CREATE TABLE element (
    id            TEXT PRIMARY KEY,   -- Objective
    label         TEXT NOT NULL,
    dimension_id  TEXT NOT NULL REFERENCES dimension(id)
);

-- The suitability matrix, materialised. A pair absent from this table is
-- neither supported nor contraindicated: under the permissive reading of R2
-- adopted in Section 4.4.5, that means allowed.
CREATE TABLE element_level (
    element_id  TEXT NOT NULL REFERENCES element(id),
    level       TEXT NOT NULL,
    verdict     TEXT NOT NULL CHECK (verdict IN ('supports', 'contraindicated')),
    PRIMARY KEY (element_id, level, verdict)
);

-- ---------------------------------------------------------------- learners
CREATE TABLE learner (
    id     TEXT PRIMARY KEY,
    label  TEXT NOT NULL,
    note   TEXT
);

CREATE TABLE learner_process (
    learner_id  TEXT NOT NULL REFERENCES learner(id),
    process_id  TEXT NOT NULL REFERENCES process(id),
    source      TEXT NOT NULL CHECK (source IN ('declared', 'earned')),
    PRIMARY KEY (learner_id, process_id, source)
);

-- ---------------------------------------------------------------- activities
CREATE TABLE activity (
    id                TEXT PRIMARY KEY,
    label             TEXT NOT NULL,
    language          TEXT,                    -- java | python | NULL
    kind              TEXT NOT NULL,           -- trace | mcq | complete | order
    ai_vulnerability  TEXT NOT NULL,           -- high | medium | low
    prompt            TEXT NOT NULL,
    code              TEXT,
    code_before       TEXT,
    code_after        TEXT,
    options_json      TEXT,
    answer            TEXT NOT NULL,
    accept_json       TEXT,
    explanation       TEXT NOT NULL
);

CREATE TABLE activity_criterion (
    activity_id   TEXT NOT NULL REFERENCES activity(id),
    criterion_id  TEXT NOT NULL REFERENCES criterion(id),
    PRIMARY KEY (activity_id, criterion_id)
);

-- ---------------------------------------------------------------- rule R1, materialised
-- One row per learner and activity. effective_level is what rule R1 derived in
-- build_kb.py; it is never assigned by hand and never recomputed by the API.
-- levels_derived records how many distinct levels R1 produced before the
-- highest was taken, so that the cases where an activity spans criteria with
-- different taught processes remain visible.
CREATE TABLE context (
    id               TEXT PRIMARY KEY,
    learner_id       TEXT NOT NULL REFERENCES learner(id),
    activity_id      TEXT NOT NULL REFERENCES activity(id),
    effective_level  TEXT NOT NULL,
    levels_derived   INTEGER NOT NULL DEFAULT 1,
    all_levels       TEXT NOT NULL
);

-- ---------------------------------------------------------------- designs
-- One design per activity and cognitive level. A learner meets the design that
-- matches the effective level of their context, so two learners on the same
-- activity can be given different gamification.
CREATE TABLE design (
    id            TEXT PRIMARY KEY,
    activity_id   TEXT NOT NULL REFERENCES activity(id),
    level         TEXT NOT NULL,
    reward_basis  TEXT NOT NULL,   -- CompletionReward | ProcessReward | ExplanationReward
    rationale     TEXT NOT NULL
);

CREATE TABLE design_element (
    design_id   TEXT NOT NULL REFERENCES design(id),
    element_id  TEXT NOT NULL REFERENCES element(id),
    reason      TEXT NOT NULL,
    PRIMARY KEY (design_id, element_id)
);

-- SHACL findings, materialised. Written by pySHACL at build time.
CREATE TABLE validation (
    design_id  TEXT NOT NULL,
    rule       TEXT NOT NULL,      -- R2 | R3 | R5
    shape      TEXT NOT NULL,
    message    TEXT NOT NULL
);

-- ---------------------------------------------------------------- run time
CREATE TABLE attempt (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    learner_id   TEXT NOT NULL REFERENCES learner(id),
    activity_id  TEXT NOT NULL REFERENCES activity(id),
    submitted    TEXT NOT NULL,
    correct      INTEGER NOT NULL,
    reward_basis TEXT NOT NULL,
    reward_given INTEGER NOT NULL,
    points       INTEGER NOT NULL,
    created_at   TEXT NOT NULL
);

-- ---------------------------------------------------------------- traceability
-- Model element to implemented feature. Chapter 5 reports this table directly;
-- it is generated, not written by hand, so it cannot drift from the code.
CREATE TABLE traceability (
    model_element  TEXT NOT NULL,
    kind           TEXT NOT NULL,   -- class | property | rule | requirement
    feature        TEXT NOT NULL,
    location       TEXT NOT NULL,
    evidence       TEXT NOT NULL
);

CREATE TABLE build_meta (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

CREATE INDEX idx_criterion_outcome  ON criterion(outcome_id);
CREATE INDEX idx_context_learner    ON context(learner_id);
CREATE INDEX idx_context_activity   ON context(activity_id);
CREATE INDEX idx_design_activity    ON design(activity_id, level);
CREATE INDEX idx_attempt_learner    ON attempt(learner_id, activity_id);
