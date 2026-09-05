# Eduntology

**Game elements chosen by an ontology, not by hand.**

Two learners open the same activity. One has been taught how to write a
selection statement and one has not. A rule derived from Thompson et al. (2008)
puts the activity at **Apply** for the first and at **Create** for the second —
and because the cognitive level differs, the set of game elements the model
permits differs with it. Nothing about the activity changed. That is the whole
claim of the study, running.

This is the prototype for a Master of Computing dissertation at the Tshwane
University of Technology: *Aligning Game Elements with Learning Outcomes: An
Ontology-Based Gamification Model for Programming E-Learning.*

Aubrey Pule Khoza · supervised by Dr E.A. van Wyk

---

## The one idea worth knowing before reading the code

**The reasoning happens at build time. The deployed platform holds no reasoner.**

```
model/eduntology.ttl  ──┐
curriculum/<name>/    ──┴──▶  build/build_kb.py  ──▶  build/kb.db
                                       │                build/d1-seed.sql
                              rdflib + pySHACL
                                       │
                                       ▼
                              build/verify_parity.py
                                       │
build/kb.db  or  Cloudflare D1  ──▶  api/  ──▶  web/
                                   JavaScript, no reasoning
```

A reasoner and a SHACL engine are substantial libraries needing a Java or
Python runtime. Neither exists in a Cloudflare Worker. So the rules are run
once, against the ontology, on a machine that has the libraries; their
conclusions are written to a database; and what deploys is the conclusions plus
the lookups that read them.

That is only honest if the lookups agree with the reasoner they replaced.
`build/verify_parity.py` is what settles it: it generates candidate designs and
judges each one **twice** — once with the JavaScript that runs at the edge, once
with pySHACL — and reports every disagreement. There is one implementation of
the rules for the running platform, and that script is how it is put on trial.

## What is here

| Folder | What it holds | Runs where |
|---|---|---|
| `model/` | The ontology: classes, properties, the six cognitive levels, the twenty-one game elements and five dimensions of Toda et al. (2019), the reward bases. Plus the SHACL shapes for R2, R3 and R5 and the SPARQL for R1. **Names no curriculum.** | — |
| `curriculum/` | One folder per curriculum. `example/` is invented and committed; `tut/` is departmental material and is not. See `curriculum/README.md`. | — |
| `build/` | Python. Reasons over the ontology, proposes a design for every activity at every level, validates with pySHACL, writes the knowledge base and the D1 seed. | your machine |
| `api/` | JavaScript, **zero dependencies**. The rules as table lookups, deterministic marking, and one request handler that runs unchanged over `node:sqlite` locally and D1 at the edge. | Worker, or Node |
| `web/` | React 18 and Vite. Activity list, activity workspace, design console, model reference. | browser |

## Running it

Windows commands throughout. You need **Python 3.10+** and **Node 22.5+**
(`node:sqlite` arrived in 22.5).

> **`py` or `python`?** `py` is the Python launcher, which the installer from
> python.org adds and the Microsoft Store build does not. If you get *"The term
> 'py' is not recognized"* (PowerShell) or *"'py' is not recognized as an
> internal or external command"* (cmd), write `python` instead of `py` in every
> command below — nothing else changes. Check with `python --version`; if that
> opens the Microsoft Store instead of printing a version, Python is not
> actually installed, only its stub, and you want the installer from
> <https://www.python.org/downloads/> with **Add python.exe to PATH** ticked.
> A terminal opened before an install will not see it; open a new one.

```
py -m pip install -r build\requirements.txt
```

### 1. Check the content

```
py build\check_content.py
```

Verifies that every criterion an activity names exists in the curriculum graph,
that every activity is structurally complete, and — this is the part worth
having — that **every traced answer is reproduced by executing an equivalent**.
No activity ships with an answer somebody merely believed.

### 2. Build the knowledge base

```
py build\build_kb.py
```

Where the reasoning happens. Loads the model and the curriculum, asserts the
learners and activities, materialises rule R1 with SPARQL, proposes a design for
every activity at every cognitive level, validates every one with pySHACL, and
writes `build\kb.db` and `build\d1-seed.sql`.

**Read the findings it prints at the end.** They are not warnings to be cleared;
they are what the prototype found out about the model.

### 3. Check the platform against the reasoner

```
py build\verify_parity.py
```

The one that matters. Judges generated designs with the deployed JavaScript and
with pySHACL, and reports every disagreement.

### 4. Run it

```
node api\dev-server.mjs
```

and in a second Command Prompt:

```
cd web
npm install
npm run dev
```

Then open <http://localhost:5173>. The development server needs no Cloudflare
account, no wrangler and no network — it runs the same handler the Worker runs,
over SQLite instead of D1.

### 5. Test the API

```
node api\test\run-tests.mjs
```

Thirty-odd checks: R1 against the materialised levels, every stored design
against R2, R3 and R5, the two test designs judged as the model predicts, every
model answer accepted and every wrong one rejected, every route answering, and
a full attempt moving an activity to Remember by rule R1c.

## Deploying to Cloudflare

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

and when that looks right:

```
cd ..\web && npm run build && cd ..\api
npx wrangler d1 execute eduntology --remote --file=..\build\d1-seed.sql
npx wrangler deploy
```

One Worker serves the API from D1 and the built interface from Workers Assets.

## What to look at first

1. Open the activity list as the **first-week learner**. Nearly everything sits
   at **Create**: no procedure has been taught, so every task asks them to
   assemble something.
2. Change to the **learner who has finished the module**. The same activities
   are now mostly **Apply**.
3. Open the selection-writing activity and read *Why this level*, then switch
   learners and read it again. The panel is not a label; it names the procedure
   and says what follows from it.
4. Answer it correctly. The platform records that the learner has now met that
   procedure, the activity moves to **Remember** by rule R1c, and the
   gamification moves with it.
5. Open the **design console** and press *Levels, badges and leaderboards* — the
   combination Zeng et al. (2024) found to depress attainment. The model rejects
   it, and does so for the absence of Personal and Fictional elements, which
   Toda et al. state in advance, rather than because Zeng reported the result.

## If something does not work

| Symptom | What it is |
|---|---|
| `'py' is not recognized` | The Python launcher is not installed. Use `python` everywhere instead. |
| `python` opens the Microsoft Store | That is the App Execution Alias stub, not Python. Install from python.org with **Add python.exe to PATH** ticked, then open a new terminal. |
| `No module named rdflib` | `py -m pip install -r build\requirements.txt` was not run, or ran against a different Python. `py -m pip --version` will tell you which one it is using. |
| The build says `Curriculum: example` when you wanted the real one | `curriculum/tut` is not in this working copy. It is not tracked by git, so a fresh clone will not have it. Copy the folder across, or pass `--curriculum tut` to get a clear failure instead of a quiet substitution. |
| `verify_parity.py` says Node is not on the PATH | It judges the JavaScript that deploys, so it needs Node as well as Python. |
| The interface says the API could not be reached | `node api\dev-server.mjs` is not running, or the knowledge base has not been built. |
| `npm install` fails behind the university proxy | Run it once on a network that allows the npm registry; the packages are cached afterwards. |
| `verify_parity.py` reports disagreements | Not a bug to work around. It means the deployed platform would serve a verdict the reasoner does not support. Record it and bring it to supervision. |

## A note on the curriculum

`curriculum/example` is invented. PROG101 is not a real module.

The dissertation itself is grounded in the 2026 study guides for Principles of
Programming A and B at the Tshwane University of Technology — eighty-two
assessment criteria, taken as written. That material is the department's, not
mine to publish, so it lives in `curriculum/tut/`, which this repository does
not track. The model does not name it and does not depend on it, which is the
point: swapping the curriculum is what the separation is for.

## Licence

Not yet settled. Ask before reusing.
