# Curricula

The model and a curriculum are separate graphs, and this folder is where the
second kind lives.

The model — `model/eduntology.ttl` — states classes, properties, the six
cognitive process categories, the twenty-one game elements and five dimensions,
and the reward bases. It names no module and no criterion. That is the study's
contribution and it is in this repository.

A curriculum supplies one institution's course material. That is somebody
else's, and it may not be publishable. So a curriculum is a folder here, and
which one the build uses is chosen at build time.

| Folder | What it is |
|---|---|
| `example/` | Invented. PROG101 is not a real module and no institution teaches it. Committed, so that a fresh clone builds and runs. |
| `tut/` | Principles of Programming A and B at the Tshwane University of Technology, 2026. Departmental material. **Not committed** — see the repository `.gitignore`. |

## Choosing one

```
py build\build_kb.py --curriculum example
set EDUNTOLOGY_CURRICULUM=example
```

With neither given, the build uses `tut` if that folder is present and
`example` otherwise. A fresh clone therefore works with no configuration, and a
working copy that holds the TUT material uses it without anyone having to
remember to say so.

Every tool takes the same flag: `check_content.py`, `test_design.py`,
`build_kb.py` and `verify_parity.py`.

## What a curriculum must contain

Three files.

### `curriculum.ttl`

An RDF graph, Turtle, in the model's namespace
(`http://www.tut.ac.za/ontologies/gpo#`). It must declare:

| Class | With |
|---|---|
| `gpo:Module` | `gpo:hasOutcome`, `gpo:teachesProcess` |
| `gpo:Process` | one per procedure the module explicitly teaches |
| `gpo:LearningOutcome` | `gpo:hasCriterion` |
| `gpo:AssessmentCriterion` | `gpo:criterionCode`, `gpo:criterionText`, `gpo:atCognitiveLevel`, and `gpo:requiresProcess` wherever the criterion asks for a procedure to be carried out |

`gpo:levelFlag` is optional and records why a stated level is uncertain:
`Thompson`, `Split`, `Repeat` or `Ambiguous`.

**Rule R1 turns on `gpo:requiresProcess` and `gpo:hasEncountered`.** A criterion
with no required process gives R1 nothing to reason from. A curriculum that
omits the property throughout will still build, but every activity will sit at
the level its criterion asserts and the model will have nothing to say that a
lookup table could not.

Process identifiers are the local name with `P_` removed, so `gpo:P_X03` is
`X03` everywhere else. The codes are yours to choose.

### `learners.json`

Declared prior exposure, one entry per learner, naming processes by those
codes. This is the lecturer-declared baseline; the platform adds to it as
learners complete activities, and those additions live in the database rather
than in this file.

### `activities.json`

What the interface renders: the prompt, the code, the options, the answer and
the explanation. The graph carries what the model reasons about; this file
carries what a learner reads. They are joined by criterion code.

`aiVulnerability` is `high` where the artefact is code the learner writes,
`medium` for a short answer, `low` for ordering or recognition. Rule R5 bars
completion-based reward at `high`.

Every field, and the marking rules for each activity kind, are documented in the
`_comment` block at the top of `example/activities.json`, and enforced by
`build/check_content.py`.

## Adding your own

```
mkdir curriculum\mine
copy curriculum\example\*.* curriculum\mine\
py build\check_content.py --curriculum mine
py build\build_kb.py --curriculum mine
```

`check_content.py` will tell you about any criterion code an activity names that
the graph does not declare, any process a learner claims that the graph does not
teach, and any traced answer that does not match the output of the equivalent
given alongside it.
