# Why does rule R1 disagree with the asserted classification?
#
#   python build/diagnose_r1.py [--curriculum tut]
#
# build_kb.py reports that R1 replaced an asserted Understand, Remember or
# Evaluate in some number of contexts. That report does not say *how*, and there
# are two quite different mechanisms behind it, which call for different
# revisions of the model:
#
#   (i)  A criterion carries requiresProcess and is nonetheless asserted at a
#        level R1 cannot express. R1a and R1b both require a process, so the
#        rule fires on that criterion directly and overwrites the assertion.
#        If this dominates, the encoding is internally inconsistent: something
#        classified as Understand has been given a procedure to carry out, and
#        either the classification or the process link is wrong.
#
#   (ii) An activity addresses several criteria, some procedural and some not.
#        Before rule R1d this was a defect: R1 derived one level for the whole
#        activity from the procedural criteria and it stood against the others
#        too. Since R1d each criterion contributes a level of its own and the
#        activity takes the highest, so a divergence of this shape is now the
#        model working -- prior instruction moved a procedural criterion, and
#        the activity followed it. It is reported separately rather than as a
#        fault.
#
# The question is decided by counting, not by argument, and this counts it.
# It reads build/kb.db, so run build_kb.py first. It changes nothing.

import argparse
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "build", "kb.db")

DERIVABLE = {"Apply", "Create", "Remember"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--curriculum", default=None,
                        help="only reported, for the record; the database decides")
    parser.parse_args()

    if not os.path.exists(DB):
        sys.exit("No %s. Run build_kb.py first." % DB)

    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row

    built = dict(db.execute("SELECT key, value FROM build_meta").fetchall())
    print("Curriculum: %s   built: %s" % (built.get("curriculum"), built.get("built")))
    print()

    criteria = {r["id"]: r for r in db.execute("SELECT * FROM criterion")}
    addressed = {}
    for row in db.execute("SELECT activity_id, criterion_id FROM activity_criterion"):
        addressed.setdefault(row["activity_id"], []).append(criteria[row["criterion_id"]])

    contexts = db.execute(
        "SELECT learner_id, activity_id, effective_level FROM context").fetchall()

    # An activity whose criteria all lack a process gets no level at all: R1a
    # and R1b both require one, so the rule cannot fire and the context table
    # has no row. The platform then has no level to select game elements on.
    # This is easy to miss, because the contexts simply are not there to count.
    activities = [r["id"] for r in db.execute("SELECT id FROM activity")]
    learners = [r["id"] for r in db.execute("SELECT id FROM learner")]
    with_level = {c["activity_id"] for c in contexts}
    silent = sorted(set(activities) - with_level)
    if silent:
        print("Activities for which rule R1 derives no level at all: %d of %d"
              % (len(silent), len(activities)))
        print("(%d contexts are absent, not merely divergent)"
              % (len(silent) * len(learners)))
        for aid in silent:
            codes = [c["code"] for c in addressed.get(aid, [])]
            print("   %-16s %s" % (aid, ", ".join(codes)))
        print("   The asserted level of these criteria stands unused: no rule")
        print("   reaches them, so the platform has nothing to gamify against.")
        print()

    direct = 0          # mechanism (i)
    spread = 0          # mechanism (ii)
    agreed = 0
    direct_criteria = {}
    spread_criteria = {}

    for context in contexts:
        rows = addressed.get(context["activity_id"], [])
        asserted = {r["asserted_level"] for r in rows}
        if context["effective_level"] in asserted:
            agreed += 1
            continue

        # criteria whose asserted level R1 cannot express
        stranded = [r for r in rows if r["asserted_level"] not in DERIVABLE]
        by_process = [r for r in stranded if r["process_id"]]
        no_process = [r for r in stranded if not r["process_id"]]

        if by_process:
            direct += 1
        else:
            spread += 1

        for r in by_process:
            key = "%s (%s, requires %s)" % (r["code"], r["asserted_level"], r["process_id"])
            direct_criteria[key] = direct_criteria.get(key, 0) + 1
        for r in no_process:
            key = "%s (%s, no process)" % (r["code"], r["asserted_level"])
            spread_criteria[key] = spread_criteria.get(key, 0) + 1

    total = len(contexts)
    print("Contexts                                              %5d" % total)
    print("  where the derived level is among those asserted     %5d" % agreed)
    print("  where it is not                                     %5d" % (total - agreed))
    print()
    print("Of the contexts that diverge:")
    print("  (i)  a criterion requires a procedure and is asserted")
    print("       at a level R1 cannot derive -- the limitation   %5d" % direct)
    print("  (ii) prior instruction moved a procedural criterion")
    print("       and the activity followed it -- the claim       %5d" % spread)
    print()

    if direct_criteria:
        print("Criteria driving (i) — each requires a procedure to be carried out and is")
        print("classified at a level R1 cannot derive. Either the classification or the")
        print("process link is unsound, or the criterion is a case the rule cannot hold:")
        for key, n in sorted(direct_criteria.items(), key=lambda kv: -kv[1]):
            print("   %-58s %4d contexts" % (key, n))
        print()

    if spread_criteria:
        print("Non-procedural criteria present in those contexts. Since R1d each of")
        print("these contributes its asserted level and the activity takes the highest,")
        print("so their presence no longer means their level was overwritten:")
        for key, n in sorted(spread_criteria.items(), key=lambda kv: -kv[1]):
            print("   %-58s %4d contexts" % (key, n))
        print()

    print("Reading the result")
    print("------------------")
    if direct == 0:
        print("   Every divergence is the model working: prior instruction moved a")
        print("   criterion from its stated classification and the activity followed.")
        print("   No criterion is classified beyond what rule R1 can derive.")
    elif direct > spread:
        print("   Most of the divergence is criteria the rule cannot express. Settle")
        print("   the encoding, or extend the rule, before reading anything else into")
        print("   these numbers.")
    else:
        print("   %d of %d divergent contexts are the model working. The remaining %d"
              % (spread, spread + direct, direct))
        print("   involve a criterion that requires a procedure and is classified at a")
        print("   level R1 cannot derive; each is named above and is a limitation of")
        print("   the rule rather than an error in the curriculum.")

    db.close()


if __name__ == "__main__":
    main()
