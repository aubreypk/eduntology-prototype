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
#        R1 derives one level for the whole activity from the procedural ones,
#        and that level then stands against the non-procedural criteria too.
#        If this dominates, neither R1 nor the classification is wrong: the
#        granularity is. Level is derived per activity and asserted per
#        criterion, and the two do not meet.
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
    both = 0
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

        if by_process and no_process:
            both += 1
        elif by_process:
            direct += 1
        elif no_process:
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
    print("  (i)  a criterion carries a process yet is asserted")
    print("       at a level R1 cannot express                   %5d" % direct)
    print("  (ii) a non-procedural criterion shares an activity")
    print("       with a procedural one                          %5d" % spread)
    print("  both mechanisms present                             %5d" % both)
    print()

    if direct_criteria:
        print("Criteria driving (i) — these carry a process and are classified otherwise.")
        print("Either the classification or the process link is wrong on each of them:")
        for key, n in sorted(direct_criteria.items(), key=lambda kv: -kv[1]):
            print("   %-58s %4d contexts" % (key, n))
        print()

    if spread_criteria:
        print("Criteria driving (ii) — these have no process, and take their level from")
        print("whatever else the activity addresses:")
        for key, n in sorted(spread_criteria.items(), key=lambda kv: -kv[1]):
            print("   %-58s %4d contexts" % (key, n))
        print()

    print("Reading the result")
    print("------------------")
    if direct > spread:
        print("   (i) dominates. The disagreement is largely between two things the")
        print("   curriculum asserts about the same criterion, not between R1 and the")
        print("   classification. Settle the encoding before revising the rule.")
    elif spread > direct:
        print("   (ii) dominates. R1 and the classification are not in conflict; they")
        print("   are answering about different units. The revision to consider is one")
        print("   of granularity — deriving a level per criterion and reporting the")
        print("   activity's level as a function of them — rather than of R1 itself.")
    else:
        print("   Neither mechanism dominates. Both revisions are in play.")

    db.close()


if __name__ == "__main__":
    main()
