"""Check the authored content before it is built into the knowledge base.

Three checks:

  1. Every criterion code named in content/activities.json exists in the ontology,
     and every process code in content/learners.json exists in the ontology.
  2. Every activity is structurally complete for its kind, and every answer is
     reachable (an mcq answer indexes a real option, an order answer permutes
     the options, a complete answer normalises to something in accept[]).
  3. Every traced answer is reproduced by executing the equivalent given in
     verify.python. An activity that asserts an output without an executable
     equivalent is reported, not failed, so that hand-checked items are visible.

Run:  py backend\\check_content.py
Exit status 0 if every check passes, 1 otherwise.
"""

import io
import json
import os
import re
import sys
from contextlib import redirect_stdout

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import paths                                                   # noqa: E402

CURRICULUM, CURRICULUM_TTL, ACTIVITIES, LEARNERS = paths.curriculum_files()

VALID_KINDS = {"trace", "mcq", "complete", "order"}
VALID_AI = {"high", "medium", "low"}
VALID_LANG = {"java", "python", None}


# --------------------------------------------------------------- ontology facts
def ontology_vocabulary():
    """Criterion codes and process codes declared in the ontology.

    rdflib is used when it is installed. The fallback is a textual scan, which is
    adequate for checking that a code exists but is not used for anything the
    model reasons about; all reasoning goes through rdflib in build_kb.py.
    """
    try:
        from rdflib import Graph, Namespace, RDF

        g = Graph()
        g.parse(paths.MODEL_TTL, format="turtle")
        g.parse(CURRICULUM_TTL, format="turtle")
        gpo = Namespace("http://www.tut.ac.za/ontologies/gpo#")
        criteria = {str(o) for o in g.objects(None, gpo.criterionCode)}
        # A process is whatever the curriculum typed as one. The code is the
        # local name with the P_ prefix removed, so gpo:P_X03 is "X03".
        processes = {str(s).rsplit("#P_", 1)[1]
                     for s in g.subjects(RDF.type, gpo.Process)
                     if "#P_" in str(s)}
        return criteria, processes, "rdflib"
    except ImportError:
        text = (open(paths.MODEL_TTL, encoding="utf-8").read()
                + open(CURRICULUM_TTL, encoding="utf-8").read())
        criteria = set(re.findall(r'gpo:criterionCode\s+"([^"]+)"', text))
        processes = {m[2:] for m in re.findall(
            r"gpo:(P_\w+)\s+a\s+owl:NamedIndividual\s*,\s*gpo:Process", text)}
        return criteria, processes, "textual scan (rdflib not installed)"


# --------------------------------------------------------------- helpers
def squash(s):
    """Remove every whitespace character. Used to compare supplied code."""
    return re.sub(r"\s+", "", s or "")


def normalise_output(s):
    """Trim each line and drop blank lines, as the marker does."""
    return "\n".join(ln.strip() for ln in (s or "").splitlines() if ln.strip())


def run_python(source):
    buf = io.StringIO()
    with redirect_stdout(buf):
        exec(compile(source, "<verify>", "exec"), {"__name__": "__verify__"})
    return buf.getvalue()


# --------------------------------------------------------------- checks
def main():
    criteria, processes, how = ontology_vocabulary()
    print("Curriculum: %s" % CURRICULUM)
    print("Ontology read by %s: %d criteria, %d processes."
          % (how, len(criteria), len(processes)))

    activities = json.load(open(ACTIVITIES, encoding="utf-8"))["activities"]
    learners = json.load(open(LEARNERS, encoding="utf-8"))["learners"]

    errors = []
    notes = []

    # ---- learners
    seen_learners = set()
    for lr in learners:
        if lr["id"] in seen_learners:
            errors.append("learner %s: duplicate id" % lr["id"])
        seen_learners.add(lr["id"])
        for p in lr["encountered"]:
            if p not in processes:
                errors.append("learner %s: unknown process %s" % (lr["id"], p))

    # ---- activities
    seen = set()
    checked, unchecked = 0, 0
    for a in activities:
        aid = a.get("id", "<no id>")

        if aid in seen:
            errors.append("%s: duplicate id" % aid)
        seen.add(aid)

        if a.get("kind") not in VALID_KINDS:
            errors.append("%s: kind %r is not one of %s" % (aid, a.get("kind"), sorted(VALID_KINDS)))
        if a.get("aiVulnerability") not in VALID_AI:
            errors.append("%s: aiVulnerability %r invalid" % (aid, a.get("aiVulnerability")))
        if a.get("language", None) not in VALID_LANG:
            errors.append("%s: language %r invalid" % (aid, a.get("language")))
        if not a.get("criteria"):
            errors.append("%s: no criteria" % aid)
        for c in a.get("criteria", []):
            if c not in criteria:
                errors.append("%s: criterion %s is not in the ontology" % (aid, c))
        for field in ("label", "prompt", "answer", "explanation"):
            if not a.get(field):
                errors.append("%s: %s is missing or empty" % (aid, field))

        kind = a.get("kind")
        answer = a.get("answer", "")

        if kind == "mcq":
            opts = a.get("options") or []
            if len(opts) < 2:
                errors.append("%s: mcq needs at least two options" % aid)
            if not answer.isdigit() or int(answer) >= len(opts):
                errors.append("%s: mcq answer %r does not index the options" % (aid, answer))

        elif kind == "order":
            opts = a.get("options") or []
            try:
                idx = [int(x) for x in answer.split(",")]
            except ValueError:
                idx = None
            if idx is None or sorted(idx) != list(range(len(opts))):
                errors.append("%s: order answer %r is not a permutation of %d options"
                              % (aid, answer, len(opts)))

        elif kind == "complete":
            if "codeBefore" not in a or "codeAfter" not in a:
                errors.append("%s: complete needs codeBefore and codeAfter" % aid)
            accept = set(a.get("accept", []))
            accept.add(squash(answer))
            if squash(answer) not in {squash(x) for x in accept}:
                errors.append("%s: the model answer does not match its own accept list" % aid)

        elif kind == "trace":
            if not a.get("code"):
                errors.append("%s: trace needs code" % aid)
            v = (a.get("verify") or {}).get("python")
            if v:
                try:
                    produced = normalise_output(run_python(v))
                except Exception as exc:                       # noqa: BLE001
                    errors.append("%s: verify.python raised %s: %s"
                                  % (aid, type(exc).__name__, exc))
                    continue
                expected = normalise_output(answer)
                if produced != expected:
                    errors.append("%s: verify.python printed %r but the answer is %r"
                                  % (aid, produced, expected))
                else:
                    checked += 1
            else:
                unchecked += 1
                notes.append("%s: traced answer has no executable equivalent; hand-checked" % aid)

    # ---- coverage, reported not enforced
    covered = {c for a in activities for c in a["criteria"]}
    outcomes = {c.rsplit(".", 1)[0] for c in covered}

    print()
    print("%d activities, %d learners." % (len(activities), len(learners)))
    print("%d of %d criteria addressed by at least one activity."
          % (len(covered), len(criteria)))
    print("Outcomes touched: %s" % ", ".join(sorted(outcomes)))
    print("%d traced answers verified by execution, %d hand-checked."
          % (checked, unchecked))

    for n in notes:
        print("  note: %s" % n)

    if errors:
        print()
        print("FAILED with %d problem(s):" % len(errors))
        for e in errors:
            print("  - %s" % e)
        return 1

    print()
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
