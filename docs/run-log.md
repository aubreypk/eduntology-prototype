# Prototype run log

Fill this in as you go. Chapter 5 reports the increments and what each produced;
Chapter 6 reports the verification output. **Paste the console output verbatim
rather than summarising it** — the exact numbers are the evidence, and a
disagreement is a finding rather than a bug to tidy away.

Run everything from the repository root. Command Prompt or PowerShell both
work; the commands are identical.

If `py` is not recognised, write `python` instead — see the README. The rest of
this file uses `py`.

---

## Before you start

The build uses `curriculum/tut` if that folder is present and `curriculum/example`
otherwise, and **prints which one it chose.** The TUT material is not in git, so
if you are working in a fresh clone rather than the folder you pushed from, copy
`curriculum/tut/` across first or every step below will quietly run against the
invented example curriculum.

To be explicit, add `--curriculum tut` to any command.

| | |
|---|---|
| Date | |
| Machine | |
| `py --version` | |
| `node --version` | (needs 22.5 or later) |
| Curriculum used | tut / example |

---

## 0. Install the Python packages

```
Requirement already satisfied: rdflib>=7.0 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from -r build\requirements.txt (line 3)) (7.6.0)
Requirement already satisfied: pyshacl>=0.26 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from -r build\requirements.txt (line 4)) (0.40.1)
Requirement already satisfied: fastapi>=0.110 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from -r build\requirements.txt (line 7)) (0.141.1)
Requirement already satisfied: uvicorn>=0.27 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from uvicorn[standard]>=0.27->-r build\requirements.txt (line 8)) (0.52.4)
Requirement already satisfied: pydantic>=2.6 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from -r build\requirements.txt (line 9)) (2.13.5)
Requirement already satisfied: pyparsing<4,>=2.1.0 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from rdflib>=7.0->-r build\requirements.txt (line 3)) (3.3.2)
Requirement already satisfied: owlrl<8,>=7.6.2 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from pyshacl>=0.26->-r build\requirements.txt (line 4)) (7.6.2)
Requirement already satisfied: packaging>=21.3 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from pyshacl>=0.26->-r build\requirements.txt (line 4)) (26.3)
Requirement already satisfied: prettytable>=3.7.0 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from pyshacl>=0.26->-r build\requirements.txt (line 4)) (3.18.0)
Requirement already satisfied: html5rdf<2,>=1.2 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from rdflib[html]<8.0,>=7.3.0->pyshacl>=0.26->-r build\requirements.txt (line 4)) (1.2.1)
Requirement already satisfied: starlette>=0.46.0 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from fastapi>=0.110->-r build\requirements.txt (line 7)) (1.6.0)
Requirement already satisfied: typing-extensions>=4.8.0 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from fastapi>=0.110->-r build\requirements.txt (line 7)) (4.16.0)
Requirement already satisfied: typing-inspection>=0.4.2 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from fastapi>=0.110->-r build\requirements.txt (line 7)) (0.4.4)
Requirement already satisfied: annotated-doc>=0.0.2 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from fastapi>=0.110->-r build\requirements.txt (line 7)) (0.0.5)
Requirement already satisfied: click>=7.0 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from uvicorn>=0.27->uvicorn[standard]>=0.27->-r build\requirements.txt (line 8)) (8.5.0)
Requirement already satisfied: h11>=0.8 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from uvicorn>=0.27->uvicorn[standard]>=0.27->-r build\requirements.txt (line 8)) (0.16.0)
Requirement already satisfied: annotated-types>=0.6.0 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from pydantic>=2.6->-r build\requirements.txt (line 9)) (0.8.0)
Requirement already satisfied: pydantic-core==2.46.5 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from pydantic>=2.6->-r build\requirements.txt (line 9)) (2.46.5)
Requirement already satisfied: wcwidth>=0.3.5 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from prettytable>=3.7.0->pyshacl>=0.26->-r build\requirements.txt (line 4)) (0.8.3)
Requirement already satisfied: anyio<5,>=3.6.2 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from starlette>=0.46.0->fastapi>=0.110->-r build\requirements.txt (line 7)) (4.15.1)
Requirement already satisfied: idna>=2.8 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from anyio<5,>=3.6.2->starlette>=0.46.0->fastapi>=0.110->-r build\requirements.txt (line 7)) (3.19)
Requirement already satisfied: httptools>=0.8.0 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from uvicorn[standard]>=0.27->-r build\requirements.txt (line 8)) (0.8.0)
Requirement already satisfied: python-dotenv>=0.13 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from uvicorn[standard]>=0.27->-r build\requirements.txt (line 8)) (1.2.3)
Requirement already satisfied: pyyaml>=5.1 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from uvicorn[standard]>=0.27->-r build\requirements.txt (line 8)) (6.0.3)
Requirement already satisfied: watchfiles>=0.20 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from uvicorn[standard]>=0.27->-r build\requirements.txt (line 8)) (1.2.0)
Requirement already satisfied: websockets>=13.0 in C:\Users\AubreyKhoza\AppData\Local\Programs\Python\Python313\Lib\site-packages (from uvicorn[standard]>=0.27->-r build\requirements.txt (line 8)) (17.1)
```

Only `build/` needs these. The API has no dependencies at all.

```
already satisfied
```

---

## 1. `py build\check_content.py`

Checks every criterion code against the curriculum graph, every activity for
structural completeness, and **re-executes every traced answer** to confirm it
matches the stated output.

Expected to end with `All checks passed.`

```
Curriculum: tut
Ontology read by rdflib: 82 criteria, 29 processes.

42 activities, 6 learners.
57 of 82 criteria addressed by at least one activity.
Outcomes touched: A.1, A.2, B.2, D.1, D.2, D.3, E.1
19 traced answers verified by execution, 0 hand-checked.

All checks passed.
```

---

## 2. `py build\build_kb.py`

Where the reasoning happens. Writes `build\kb.db`, `build\d1-seed.sql`,
`build\build_report.json` and `build\inferred.ttl`.

```
1. Loading the ontology
-----------------------
   model/eduntology.ttl parsed: 352 triples
   curriculum 'tut' parsed: 942 further triples
   content read: 42 activities, 6 learners

2. Reading the vocabulary out of the graph
------------------------------------------
   2 modules, 7 outcomes, 82 criteria, 29 processes
   5 dimensions, 21 game elements, 43 suitability entries

3. Asserting learners, activities and contexts into the graph
-------------------------------------------------------------
   graph now holds 2346 triples (252 contexts asserted)

4. Materialising rule R1
------------------------
   R1a derived 160 assertion(s)
   R1b derived 99 assertion(s)
   R1c derived 0 assertion(s)
   wrote build\inferred.ttl (2605 triples)
   252 of 252 platform contexts received a level
   note: Rule R1 derived more than one level for 5 contexts. This happens where an activity addresses criteria requiring different taught processes and the learner has met some but not all of them. The highest level is taken, on the reading that an activity is no easier than its hardest unmet part.
   ontology's own demonstration contexts: Context_A_WriteIf=Create, Context_B_WriteIf=Apply

5. Proposing a design for every activity at every level reached
---------------------------------------------------------------
   levels reached by the corpus: Apply, Create
   252 designs proposed: 42 activities at each of 6 levels
   elements per design: 4

6. Validating every design with pySHACL
---------------------------------------
   conforms: False
   3 violation(s) reported
   against the 252 proposed designs: 0
   against the ontology's own test designs: 3
      Design_ZengCombination  R5 violated: this design rewards completion on an activity of high AI vulnerability. Reward shou
      Design_ZengCombination  R3 violated: this design draws on fewer than three of the five dimensions.
      Design_ZengCombination  R3 violated: this design includes no Personal element. Toda et al. (2019) state that the absence

   FINDING: In 148 of 252 contexts the effective level derived by R1 is not among the levels asserted on the activity's criteria. The platform selects elements on the effective level; the SHACL shape for R2 tests against the asserted level. The design proposal therefore excludes any element contraindicated at either, so both readings are satisfied.

   FINDING: Rule R1 as formulated derives only Apply, Create or Remember, because it reasons from procedural familiarity alone. It therefore replaces the asserted level of criteria that are not procedural: Evaluate in 12 contexts, Remember in 24 contexts, Understand in 60 contexts. A criterion such as 'the difference between two loop kinds is explained' sits at Understand whatever the learner has been taught, and R1 has no way to say so. This is a limitation of R1 as stated in Section 4.4.4 and is a candidate for revision: the rule should apply where a criterion requires a process to be carried out, and leave other criteria alone.

7. Writing the knowledge base
-----------------------------
   activity                42
   activity_criterion      59
   context                252
   criterion               82
   design                 252
   design_element        1008
   dimension                5
   element                 21
   element_level           43
   learner                  6
   learner_process         99
   module                   2
   outcome                  7
   process                 29
   traceability            15
   validation               0
   wrote build\kb.db

8. Writing the Cloudflare D1 seed
---------------------------------
   1933 rows across 17 tables
   wrote build\d1-seed.sql (441 KB)

Done
----
   build\build_report.json

   3 finding(s) recorded for Chapter 6:
     - Rule R1 derived more than one level for 5 contexts. This happens where an activity addresses criteria requiring different taught processes and the lea
     - In 148 of 252 contexts the effective level derived by R1 is not among the levels asserted on the activity's criteria. The platform selects elements on
     - Rule R1 as formulated derives only Apply, Create or Remember, because it reasons from procedural familiarity alone. It therefore replaces the asserted
```

Findings printed at the end:

- [ ] recorded in `claude/chapter-5-prototype-record.md`
- [ ] the R1 finding about Understand and Evaluate criteria raised with Dr van Wyk

---

## 3. `py build\verify_parity.py`

The one that matters. Judges generated designs twice — once with the JavaScript
that deploys, once with pySHACL — and reports every disagreement. This is Layer 1
evidence for Chapter 6. It needs Node as well as Python, because it calls the
deployed rule code rather than a second copy of the rules.

```
Curriculum: tut

1. Rule R1: the deployed JavaScript against the level the SPARQL rule derived
-----------------------------------------------------------------------------
   252 contexts compared
   0 disagreement(s)

2. Rules R2, R3 and R5: the deployed JavaScript against pySHACL
---------------------------------------------------------------
   asking the deployed rule code for 96 verdicts
   asking pySHACL for the same 96 verdicts
   96 candidate designs across 12 activities compared
   0 disagreement(s)

Verdict
-------
   The JavaScript that runs at the edge reaches the same verdict as
   the reasoner and the SHACL engine on every case tested. On this
   evidence, materialising the reasoning at design time and shipping
   only lookups costs nothing in correctness.
   wrote build\parity_report.json
```

| | |
|---|---|
| Contexts compared | 252 |
| R1 disagreements | 0 |
| Candidate designs compared | 96, across 12 activities |
| R2/R3/R5 disagreements | 0 |
| Parity | **pass** |

---

## 4. `node api\test\run-tests.mjs`

Thirty-three checks against the built knowledge base.

```
1. Rule R1 against the level materialised at build time
-------------------------------------------------------
   252 contexts compared, 0 disagreement(s)

2. Every stored design satisfies R2, R3 and R5
----------------------------------------------
   252 designs checked, 0 rejected

3. The curriculum’s own test designs
------------------------------------
   levels, badges and leaderboards: conforms=false
      R3 This design draws on 2 of the five dimensions. At least 3 are required.
      R3 This design includes no Personal element. Elements concerning the individual learner. Their
      R5 This activity's vulnerability to generative assistance is high, so reward may not attach to
   a balanced design:              conforms=true
   no elements at all:             conforms=false

4. Marking
----------
   42 model answers accepted, 42 wrong answers rejected

5. Routes
---------
   26 checks so far

6. Submitting an attempt
------------------------
   ACT_A1_01 for L06: Apply -> Remember
   reward basis ExplanationReward, 20 points
   processes recorded: P10

All 33 checks passed.
```

---

## 5. Run it

Two Command Prompts.

```
node api\dev-server.mjs
```

```
cd web
npm install
npm run dev
```

Then <http://localhost:5173>.

- [ ] the interface loads
- [ ] the **learner selector** at the top right changes the levels in the list
- [ ] the **Student / Lecturer** switch changes which views are offered
- [ ] in Student view the ontology is nowhere on screen; in Lecturer view it is

---

## 6. Figures for Chapter 5

Do not take these by hand. `docs/screenshots.mjs` drives the real interface
through the real API and writes numbered PNGs with captions, so a figure can be
regenerated after any change rather than re-staged.

**Rebuild the knowledge base first, every time.** The script submits a correct
answer, and that attempt is recorded. On a second run rule R1c has already
fired, so the learner who should be at Apply is shown at Remember and the
figures contradict their own captions. This has happened once already; it is
not hypothetical, and it is not visible unless you read the figures.

```
py build\build_kb.py --curriculum tut
cd web
npm install -D playwright
npm run build
cd ..
node api\dev-server.mjs
```

No browser download is needed. `npx playwright install chromium` fetches one
from a CDN that many university networks block; the script uses the Edge or
Chrome already on the machine instead, and says which in `FIGURES.md`.

then, in a second window:

```
npm run figures -- --base http://127.0.0.1:8000 --activity ACT_D2_01
```

Figures come out in the light palette, which is what prints.

- [ ] `docs\screenshots\` holds the PNGs and `FIGURES.md`
- [ ] `FIGURES.md` names the browser used and the viewport
- [ ] the two list figures show the same activities at different levels
- [ ] **the activity figures show Create and then Apply** — if the second says
      Remember, the knowledge base was not rebuilt; rebuild and run again
- [ ] the two activity figures show different game elements for the same task

Then cut them down for the page. A full-page capture of a long page is the
right capture and the wrong figure: placed whole on A4 it would be scaled to a
width at which the text cannot be read. The crop is scripted so that it is
reproducible from the originals, which stay where they are.

```
py -m pip install pillow
py docs\crop_figures.py
```

- [ ] `docs\screenshots\print\` holds the cropped figures

Rebuild the knowledge base afterwards, so Chapter 6 measures a clean database:

```
py build\build_kb.py --curriculum tut
```

---

## 7. Deploying to Cloudflare (optional at this stage)

Not needed for the supervisor gate, but it is what makes §4.6's argument a
demonstration rather than a claim, so it is worth doing before the evaluation
chapter.

```
cd api
npx wrangler login
npx wrangler d1 create eduntology
```

Paste the `database_id` it prints into `api\wrangler.toml`, then:

```
npx wrangler d1 execute eduntology --local --file=..\build\d1-seed.sql
npx wrangler dev
```

- [ ] the platform runs locally under wrangler, over D1 rather than SQLite
- [ ] deployed URL, if you go that far: ______________________

---

## Notes, and anything that broke

```
```
