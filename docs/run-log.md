# Prototype run log

Fill this in as you go and send it back. Chapter 5 reports the increments and
what each one produced; Chapter 6 reports the verification output. Paste the
console output verbatim rather than summarising it — the exact numbers are the
evidence.

---

## Environment

| | |
|---|---|
| Date | |
| Machine | |
| `py --version` | |
| `node --version` | |

---

## Step 2 — `py backend\check_content.py`

Expected to end with `All checks passed.`

```
(paste the output here)
```

---

## Step 3 — `py backend\build_kb.py`

The table counts and the findings are what matter. Paste the whole thing.

```
(paste the output here)
```

Findings printed at the end:

- [ ] recorded in `claude/chapter-4-model-record.md`
- [ ] raised with Dr van Wyk

---

## Step 4 — `py backend\verify_parity.py`

This is Layer 1 evidence for Chapter 6. If it reports disagreements, that is a
result, not a bug to hide.

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

## Step 5 and 6 — the platform running

Screenshots to take for Chapter 5. Use the built interface
(`npm run build`, then uvicorn on port 8000), not the development server.

- [ ] Activity list as `L01`, showing the levels
- [ ] Activity list as `L04`, showing the same activities at different levels
- [ ] **Write an if that makes a decision** as `L01` — the *Why this level* panel reading Create
- [ ] The same activity as `L04` — the same panel reading Apply
- [ ] The gamification panel for both, side by side, showing the different elements
- [ ] The design console rejecting *Levels, badges and leaderboards*
- [ ] The design console accepting the balanced design
- [ ] The model page, showing the suitability matrix and the traceability table

---

## Notes and anything that broke

```
```
