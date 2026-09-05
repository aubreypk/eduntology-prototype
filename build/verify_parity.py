# -*- coding: utf-8 -*-
"""Does the deployed platform agree with the reasoner it replaced?

The architecture in Section 4.6 moves the reasoning to build time and leaves the
running platform doing lookups. That is only sound if the lookups reach the same
verdicts as the reasoner and the SHACL engine. This script tests exactly that,
and it is Layer 1 evidence for Chapter 6.

Two comparisons:

  1. Rule R1. For every learner and activity in the knowledge base, the level
     the deployed JavaScript computes from the tables must equal the level the
     SPARQL rule derived at build time and wrote to the context table.

  2. Rules R2, R3 and R5. A systematic set of candidate designs is generated
     and judged twice: once by the deployed JavaScript over the tables, and
     once by pySHACL over an RDF graph built for the purpose. Every
     disagreement is reported.

The verdicts come from api/src/rules.js by way of api/test/verdicts.mjs, so
what is on trial here is the code that actually runs at the edge, not a second
Python copy of the rules kept beside it. Node 18 or later is therefore needed
as well as Python.

Run from the project root, after building the knowledge base:

    py build\\verify_parity.py

Exit status 0 if the two agree everywhere, 1 otherwise. Writes
build\\parity_report.json.
"""

import json
import os
import subprocess
import random
import sqlite3
import sys
from datetime import datetime, timezone

try:
    from rdflib import Graph, Literal, Namespace, RDF
    from rdflib.namespace import RDFS
    from pyshacl import validate as shacl_validate
except ImportError:
    sys.exit("rdflib and pyshacl are needed.  Run:  py -m pip install -r requirements.txt")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import paths                                       # noqa: E402

CURRICULUM, CURRICULUM_TTL, _A, _L = paths.curriculum_files()
DB_PATH = paths.DB_PATH
REPORT = paths.PARITY_REPORT

GPO = Namespace("http://www.tut.ac.za/ontologies/gpo#")
SH = Namespace("http://www.w3.org/ns/shacl#")

SAMPLE_ACTIVITIES = 12      # activities drawn for the design comparison
SAMPLE_DESIGNS = 8          # candidate designs per activity
SEED = 20260905             # fixed, so the run is reproducible

VERDICTS_JS = os.path.join(ROOT, "api", "test", "verdicts.mjs")


def deployed_verdicts(cases):
    """Ask the deployed rule code what it makes of a batch of cases."""
    if not os.path.isfile(VERDICTS_JS):
        sys.exit("Cannot find %s" % VERDICTS_JS)
    try:
        finished = subprocess.run(
            ["node", VERDICTS_JS, DB_PATH],
            input=json.dumps(cases), capture_output=True, text=True, timeout=600)
    except FileNotFoundError:
        sys.exit("Node is not on the PATH. The parity check judges the JavaScript "
                 "that deploys, so Node 18 or later is needed. Install it from "
                 "https://nodejs.org and run this again.")
    if finished.returncode != 0:
        sys.exit("api/test/verdicts.mjs failed:\n%s" % finished.stderr.strip()[:2000])
    return json.loads(finished.stdout)


def head(text):
    print()
    print(text)
    print("-" * len(text))


def main():
    if not os.path.exists(DB_PATH):
        sys.exit("No knowledge base. Run:  py build\\build_kb.py")

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    report = {"run": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "curriculum": CURRICULUM, "seed": SEED}
    print("Curriculum: %s" % CURRICULUM)

    # ------------------------------------------------------------ 1. rule R1
    head("1. Rule R1: the deployed JavaScript against the level the SPARQL rule derived")

    contexts = db.execute("SELECT * FROM context ORDER BY id").fetchall()
    verdicts = deployed_verdicts({
        "r1": [{"learner": c["learner_id"], "activity": c["activity_id"]}
               for c in contexts]})["r1"]

    r1_mismatch = []
    for ctx, live in zip(contexts, verdicts):
        if live["level"] != ctx["effective_level"]:
            r1_mismatch.append({
                "context": ctx["id"],
                "materialised": ctx["effective_level"],
                "recomputed": live["level"],
                "rule": live["rule"],
                "derivedAtBuild": ctx["all_levels"],
            })

    print("   %d contexts compared" % len(contexts))
    print("   %d disagreement(s)" % len(r1_mismatch))
    for m in r1_mismatch[:10]:
        print("      %s: table says %s, lookup says %s (build derived %s)"
              % (m["context"], m["materialised"], m["recomputed"], m["derivedAtBuild"]))
    report["r1"] = {"compared": len(contexts), "mismatches": r1_mismatch}

    # ------------------------------------------------------------ 2. R2, R3, R5
    head("2. Rules R2, R3 and R5: the deployed JavaScript against pySHACL")

    ontology = Graph()
    ontology.parse(paths.MODEL_TTL, format="turtle")
    ontology.parse(CURRICULUM_TTL, format="turtle")
    shapes = Graph().parse(paths.SHAPES_TTL, format="turtle")

    elements = [r["id"] for r in db.execute("SELECT id FROM element ORDER BY id")]
    rewards = ["CompletionReward", "ProcessReward", "ExplanationReward"]

    activity_ids = [r["id"] for r in db.execute("SELECT id FROM activity ORDER BY id")]
    rng = random.Random(SEED)
    sampled = sorted(rng.sample(activity_ids, min(SAMPLE_ACTIVITIES, len(activity_ids))))

    # Build every case first, so that the deployed rule code can judge the whole
    # batch in one call rather than being started once per design.
    plan = []
    for aid in sampled:
        criteria = [r["id"] for r in db.execute(
            "SELECT c.id FROM activity_criterion ac JOIN criterion c "
            "ON c.id = ac.criterion_id WHERE ac.activity_id = ?", (aid,))]
        ai = db.execute("SELECT ai_vulnerability FROM activity WHERE id = ?",
                        (aid,)).fetchone()[0]
        asserted = sorted({r[0] for r in db.execute(
            "SELECT DISTINCT c.asserted_level FROM activity_criterion ac "
            "JOIN criterion c ON c.id = ac.criterion_id WHERE ac.activity_id = ?",
            (aid,))})
        for n in range(SAMPLE_DESIGNS):
            picked = sorted(rng.sample(elements, rng.randint(0, 6)))
            plan.append({"activity": aid, "design": n, "criteria": criteria,
                         "ai": ai, "levels": asserted, "elements": picked,
                         "rewardBasis": rng.choice(rewards)})

    print("   asking the deployed rule code for %d verdicts" % len(plan))
    deployed = deployed_verdicts({"designs": [
        {"activity": c["activity"], "levels": c["levels"],
         "elements": c["elements"], "rewardBasis": c["rewardBasis"]} for c in plan]})["designs"]

    print("   asking pySHACL for the same %d verdicts" % len(plan))
    cases, design_mismatch = 0, []
    for case, table_view in zip(plan, deployed):
        aid, n = case["activity"], case["design"]

        # pySHACL's verdict, over a graph holding just this design
        g = Graph()
        for t in ontology:
            g.add(t)
        act = GPO["Parity_Act_%s" % aid]
        des = GPO["Parity_Design_%s_%d" % (aid, n)]
        g.add((act, RDF.type, GPO.LearningActivity))
        g.add((act, RDFS.label, Literal(aid)))
        g.add((act, GPO.aiVulnerability, Literal(case["ai"])))
        for cid in case["criteria"]:
            g.add((act, GPO.addressesCriterion, GPO[cid]))
        g.add((des, RDF.type, GPO.GamifiedActivityDesign))
        g.add((des, GPO.gamifies, act))
        g.add((des, GPO.hasRewardBasis, GPO[case["rewardBasis"]]))
        for e in case["elements"]:
            g.add((des, GPO.appliesElement, GPO[e]))

        _conforms, results, _text = shacl_validate(
            g, shacl_graph=shapes, advanced=True, inference="none",
            abort_on_first=False, meta_shacl=False)

        # The curriculum carries two test designs of its own; ignore any result
        # whose focus node is not the design under test.
        flagged = {str(o) for o in results.objects(None, SH.focusNode)}
        shacl_conforms = str(des) not in flagged

        cases += 1
        if shacl_conforms != table_view["conforms"]:
            design_mismatch.append({
                "activity": aid, "design": n, "elements": case["elements"],
                "reward": case["rewardBasis"], "levels": case["levels"],
                "deployedConforms": table_view["conforms"],
                "shaclConforms": shacl_conforms,
                "deployedProblems": [p["message"] for p in table_view["problems"]],
            })

    print("   %d candidate designs across %d activities compared"
          % (cases, len(sampled)))
    print("   %d disagreement(s)" % len(design_mismatch))
    for m in design_mismatch[:10]:
        print("      %s design %d: the platform says conforms=%s, pySHACL says conforms=%s"
              % (m["activity"], m["design"], m["deployedConforms"], m["shaclConforms"]))
        print("         elements: %s" % (", ".join(m["elements"]) or "(none)"))
        for p in m["deployedProblems"]:
            print("         platform: %s" % p[:110])
    report["designs"] = {"compared": cases, "activities": sampled,
                         "mismatches": design_mismatch}

    # ------------------------------------------------------------ 3. verdict
    head("Verdict")
    ok = not r1_mismatch and not design_mismatch
    report["parity"] = ok
    json.dump(report, open(REPORT, "w", encoding="utf-8"), indent=2)

    if ok:
        print("   The JavaScript that runs at the edge reaches the same verdict as")
        print("   the reasoner and the SHACL engine on every case tested. On this")
        print("   evidence, materialising the reasoning at design time and shipping")
        print("   only lookups costs nothing in correctness.")
    else:
        print("   PARITY FAILED. The running platform would serve a verdict the")
        print("   reasoner does not support. Report this rather than working around it.")
    print("   wrote %s" % os.path.relpath(REPORT, ROOT))
    db.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
