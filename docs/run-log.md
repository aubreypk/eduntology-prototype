# Prototype run log

Fill this in as you go. Chapter 5 reports the increments and what each produced;
Chapter 6 reports the verification output. **Paste the console output verbatim
rather than summarising it** — the exact numbers are the evidence, and a
disagreement is a finding rather than a bug to tidy away.

Run everything from the repository root, in a Command Prompt.

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
py -m pip install -r build\requirements.txt
```

Only `build/` needs these. The API has no dependencies at all.

```
(paste the last few lines here, or note that it was already satisfied)
```

---

## 1. `py build\check_content.py`

Checks every criterion code against the curriculum graph, every activity for
structural completeness, and **re-executes every traced answer** to confirm it
matches the stated output.

Expected to end with `All checks passed.`

```
(paste the output here)
```

---

## 2. `py build\build_kb.py`

Where the reasoning happens. Writes `build\kb.db`, `build\d1-seed.sql`,
`build\build_report.json` and `build\inferred.ttl`.

```
(paste the whole output here — the table counts and the findings both matter)
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
(paste the output here)
```

| | |
|---|---|
| Contexts compared | |
| R1 disagreements | |
| Candidate designs compared | |
| R2/R3/R5 disagreements | |
| Parity | pass / fail |

---

## 4. `node api\test\run-tests.mjs`

Thirty-three checks against the built knowledge base.

```
(paste the last few lines here)
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
- [ ] the learner selector at the top right changes the levels in the list

---

## 6. Screenshots for Chapter 5

Take these from the **built** interface, not the development server — the dev
server injects tooling that would not be present in use, and the same build is
what the accessibility and performance audits in Chapter 6 will run against.

```
cd web
npm run build
```

then serve it through the Worker (`cd api && npx wrangler dev`), or keep using
`node api\dev-server.mjs` with `npm run preview` in `web`.

- [ ] activity list as the first-week learner, nearly everything at Create
- [ ] activity list as the learner who has finished the module, mostly Apply
- [ ] the selection-writing activity as the first learner — the *Why this level* panel reading Create
- [ ] the same activity as the second — the same panel reading Apply
- [ ] the two gamification panels side by side, showing the different elements
- [ ] a correct attempt moving the activity to Remember, with the elements changing
- [ ] the design console rejecting *Levels, badges and leaderboards*
- [ ] the design console accepting the balanced design
- [ ] the model page: the suitability matrix and the traceability table

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
