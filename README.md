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
| `web/` | React 18 and Vite. Two roles: a student plays, a lecturer inspects. | browser |

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
npm install
cd web
npm run build
cd ..
npm run api
```

Then open <http://127.0.0.1:8000>. One process serves the API and the built
interface on one origin, exactly as the Worker does — no Cloudflare account, no
wrangler, no network.

While changing the interface, `npm run dev` inside `web` is quicker: it reloads
on save and proxies `/api` to port 8000. Use the built version for anything
measured or photographed, because the dev server injects tooling that is not
present in use.

### 5. Test the API

```
node api\test\run-tests.mjs
```

Thirty-odd checks: R1 against the materialised levels, every stored design
against R2, R3 and R5, the two test designs judged as the model predicts, every
model answer accepted and every wrong one rejected, every route answering, and
a full attempt moving an activity to Remember by rule R1c.

## Figures for the write-up

From the **repository root**, not from `web`:

```
npm install
npm run figures -- --base http://127.0.0.1:8000
```

Playwright is a devDependency of the repository rather than of the interface.
Node resolves `node_modules` by walking up from the importing file, so a copy
installed under `web` would never be found by a script in `docs` — and it does
not belong in the interface's dependency list, which the Layer 2 audit reads.

There is no browser to download. `npx playwright install chromium` fetches one
from `cdn.playwright.dev`, which many university networks block; the script
skips that entirely and drives the Chromium-based browser already on the
machine — on Windows that is Edge, which is always present. It reports which
browser it used and records it in `FIGURES.md`, because "a Chromium browser" is
not a reproducible statement. Force one with `--browser msedge`, `--browser
chrome` or `--browser chromium`.

Drives the real interface through the real API and writes numbered PNGs to
`docs\screenshots\`, with a `FIGURES.md` recording the browser, the viewport
and the theme each was taken in.

Figures are taken in the **light** palette by default, because a dark
screenshot at half a page is a solid block of ink and somebody will read this
on paper. `--theme dark` takes them in the authored palette instead. Pin the
activity the text discusses with `--activity ACT_D2_01`. Taking them by hand
means a chapter whose figures were captured on different days at different
window sizes with different data behind them; this way a figure is regenerated
rather than re-staged.

Rebuild the knowledge base first. The script submits a correct answer, which is
recorded, so a second run would begin from a solved activity and the "before"
figures would be wrong — the learner who should be shown at Apply appears at
Remember, and the captions the script writes then contradict the pixels.

Then cut the captures down for the page:

```
py -m pip install pillow
py docs\crop_figures.py
```

A full-page capture of a five-thousand-pixel page is the right capture and the
wrong figure. `docs/crop_figures.py` trims the trailing whitespace, takes a
stated band from the three captures whose argument sits in one part of a much
longer page, and writes the results to `docs\screenshots\print\`. The bands
are named in the script with the reason for each, the originals are untouched,
and nothing is scaled or retouched — so the crop is reproducible rather than
staged in an image editor.

## Light and dark

The interface follows the reader's system preference. Dark is the authored
design; the light palette is derived from the same tokens rather than
approximated, and both are checked the same way — **all 142 foreground and
background pairs across the two palettes meet WCAG 2.1 AA** against the surface
each actually sits on. The tightest are the control border at 3.43:1 in dark
and 4.39:1 in light, against a 3:1 requirement for non-text contrast.

There is no theme switch in the interface. Honouring `prefers-color-scheme` is
the accessible behaviour and needs no control; adding one would be a preference
the platform stores about a person for no reason.

## Continuous checking

`.github/workflows/ci.yml` runs on every push. It reasons over the ontology with
rdflib and pySHACL, then puts the JavaScript that deploys on trial against
pySHACL and **fails the build on any disagreement**. Every push therefore
carries a fresh answer to the question Section 4.6 raises, and `build_report.json`
and `parity_report.json` are kept as artefacts so a claim in the dissertation can
be traced to the run that produced it.

It runs against `curriculum/example`, because the Tshwane material is not in
this repository and CI has no access to it.

## Deploying to Cloudflare

```
cd api
npx wrangler login
npx wrangler d1 create eduntology-prototype
```

Paste the `database_id` it prints into `api\wrangler.toml`, then:

```
npx wrangler d1 execute eduntology-prototype --local --file=..\build\d1-seed.sql
npx wrangler dev
```

and when that looks right:

```
cd ..\web && npm run build && cd ..\api
npx wrangler d1 execute eduntology-prototype --remote --file=..\build\d1-seed.sql
npx wrangler deploy
```

One Worker serves the API from D1 and the built interface from Workers Assets.

### Deploying from GitHub instead

The two Cloudflare values go in **GitHub repository secrets**. Not `.env`, not
`wrangler.toml`, not the Cloudflare dashboard.

**1. Add the secrets.** Open
<https://github.com/aubreypk/eduntology-prototype/settings/secrets/actions>
and press **New repository secret**, twice:

| Name — must match exactly | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | the Account ID from the Cloudflare dashboard, Workers & Pages overview, right-hand column |
| `CLOUDFLARE_API_TOKEN` | the token from the next step |

A misspelled name makes the deploy step *skip with a notice* rather than fail,
so if nothing deploys, check the spelling first.

**2. Give the token the right permissions.** Two, both on **Account**:

- **Workers Scripts → Edit**
- **D1 → Edit**

The *Edit Cloudflare Workers* template gives you the first and **not** the
second. Add D1 to it at <https://dash.cloudflare.com/profile/api-tokens>.

Without D1, seeding fails with a bare `Authentication error [code: 10000]` —
and wrangler then prints your **account** role, "Super Administrator, All
Privileges", which sends you looking in entirely the wrong place. A token
carries its own permissions, narrower than your account's; being an account
super admin grants a token nothing. The workflow checks for D1 access before it
tries, so it tells you this rather than leaving you with the error code.

**3. First deployment.** **Actions** tab → **check and deploy** → **Run
workflow** → tick **seed** → **Run workflow**.

Seeding is deliberate because it drops and recreates every table: doing it
unasked on every push would wipe whatever the deployed instance had
accumulated. Tick it for the first deployment and after any change to the model
or the curriculum; leave it alone otherwise.

**4. After that**, every push to `main` runs the checks and redeploys. The run
summary gives the URL.

The deployed instance runs `curriculum/example`, because the Tshwane material
is not in this repository and CI cannot see it.

### Deploying from your own machine instead

No token, and no permissions to configure — this authorises in the browser with
your full account rights:

```
cd api
npx wrangler login
npx wrangler d1 execute eduntology-prototype --remote --file=..\build\d1-seed.sql
npx wrangler deploy
```

That deploys whichever curriculum your last `build_kb.py` used, so it is the
way to put the real thing somewhere Dr van Wyk can open it — CI can only ever
deploy the example. Build the interface first (`cd web && npm run build`) or
the Worker serves the API alone.

## Two roles

The top bar switches point of view.

**Student** sees one thing: their activities, grouped by learning outcome, with
the level each one occupies *for them* and the game elements the model allows at
that level. Nothing about the ontology is on screen.

**Lecturer** sees what the model decided and why: the same activity list but as
any chosen learner, the curriculum with every criterion and its classification,
the design console, and the model's own suitability matrix and traceability
table.

**It is a view switch, not authentication.** There are no accounts, no
passwords and no participants, and the learner selector stands in for a login.
Chapter 5 says so rather than implying access control the prototype does not
have.

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
