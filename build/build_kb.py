# -*- coding: utf-8 -*-
"""Design-time build: ontology in, materialised knowledge base out.

This is the only place in the platform where reasoning happens. It loads the
ontology, asserts the learners and activities the platform serves, materialises
rule R1 with SPARQL, proposes a gamified design for every activity at every
cognitive level, validates every design with pySHACL, and
writes the conclusions to SQLite. The API afterwards reads those conclusions and
never reasons. Section 4.6 sets out why.

Run from the project root:

    py -m pip install -r requirements.txt
    py backend\\build_kb.py

Writes  backend\\gpo.db          the knowledge base the API serves
        backend\\build_report.json  what the build concluded, for Chapter 6
        ontology\\gpo-inferred.ttl  the graph after R1, for inspection
"""

import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone

try:
    from rdflib import Graph, Literal, Namespace, RDF
    from rdflib.namespace import RDFS
except ImportError:
    sys.exit("rdflib is not installed.  Run:  py -m pip install -r requirements.txt")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import paths                                          # noqa: E402
from design import LEVEL_ORDER, REWARD_FOR, propose   # noqa: E402

CURRICULUM, CURRICULUM_TTL, ACTIVITIES_JSON, LEARNERS_JSON = paths.curriculum_files()

DB_PATH = paths.DB_PATH
REPORT_PATH = paths.BUILD_REPORT
INFERRED_PATH = paths.INFERRED_TTL
SCHEMA_PATH = paths.SCHEMA_SQL
D1_SEED_PATH = paths.D1_SEED

GPO = Namespace("http://www.tut.ac.za/ontologies/gpo#")

report = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
          "findings": []}


def say(text=""):
    print(text)


def head(text):
    print()
    print(text)
    print("-" * len(text))


def local(term):
    return str(term).rsplit("#", 1)[-1]


# ============================================================ 1. load
head("1. Loading the ontology")

g = Graph()
g.parse(paths.MODEL_TTL, format="turtle")
model_triples = len(g)
say("   model/eduntology.ttl parsed: %d triples" % model_triples)

g.parse(CURRICULUM_TTL, format="turtle")
say("   curriculum %r parsed: %d further triples" % (CURRICULUM, len(g) - model_triples))

activities = json.load(open(ACTIVITIES_JSON, encoding="utf-8"))["activities"]
learners = json.load(open(LEARNERS_JSON, encoding="utf-8"))["learners"]
say("   content read: %d activities, %d learners" % (len(activities), len(learners)))


# ============================================================ 2. read the vocabulary
head("2. Reading the vocabulary out of the graph")

Q_MODULES = """
PREFIX gpo:  <http://www.tut.ac.za/ontologies/gpo#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?m ?label WHERE { ?m a gpo:Module ; rdfs:label ?label }
"""
Q_OUTCOMES = """
PREFIX gpo:  <http://www.tut.ac.za/ontologies/gpo#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?m ?o ?label WHERE { ?m gpo:hasOutcome ?o . ?o rdfs:label ?label }
"""
Q_CRITERIA = """
PREFIX gpo:  <http://www.tut.ac.za/ontologies/gpo#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?o ?c ?code ?text ?level ?process ?flag ?note WHERE {
    ?o gpo:hasCriterion ?c .
    ?c gpo:criterionCode ?code ;
       gpo:criterionText ?text ;
       gpo:atCognitiveLevel ?level .
    OPTIONAL { ?c gpo:requiresProcess ?process }
    OPTIONAL { ?c gpo:levelFlag ?flag }
    OPTIONAL { ?c rdfs:comment ?note }
}
"""
Q_PROCESSES = """
PREFIX gpo:  <http://www.tut.ac.za/ontologies/gpo#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?p ?label WHERE { ?p a gpo:Process ; rdfs:label ?label }
"""
Q_DIMENSIONS = """
PREFIX gpo:  <http://www.tut.ac.za/ontologies/gpo#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?d ?label ?note WHERE {
    ?d a gpo:Dimension ; rdfs:label ?label .
    OPTIONAL { ?d rdfs:comment ?note }
}
"""
Q_ELEMENTS = """
PREFIX gpo:  <http://www.tut.ac.za/ontologies/gpo#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?e ?label ?dim WHERE {
    ?e a gpo:GameElement ; rdfs:label ?label ; gpo:belongsToDimension ?dim .
}
"""
Q_SUPPORTS = """
PREFIX gpo: <http://www.tut.ac.za/ontologies/gpo#>
SELECT ?e ?level WHERE { ?e gpo:supportsLevel ?level }
"""
Q_CONTRA = """
PREFIX gpo: <http://www.tut.ac.za/ontologies/gpo#>
SELECT ?e ?level WHERE { ?e gpo:contraindicatedFor ?level }
"""

modules = {local(r[0]): str(r[1]) for r in g.query(Q_MODULES)}
outcome_module, outcome_label = {}, {}
for m, o, lab in g.query(Q_OUTCOMES):
    outcome_module[local(o)] = local(m)
    outcome_label[local(o)] = str(lab)

criteria = {}
code_to_criterion = {}
for o, c, code, text, level, proc, flag, note in g.query(Q_CRITERIA):
    cid = local(c)
    criteria[cid] = {
        "id": cid, "outcome": local(o), "code": str(code), "text": str(text),
        "level": local(level),
        "process": local(proc)[2:] if proc is not None else None,
        "flag": str(flag) if flag is not None else "",
        "note": str(note) if note is not None else "",
    }
    code_to_criterion[str(code)] = cid

processes = {local(p)[2:]: str(lab) for p, lab in g.query(Q_PROCESSES)}
dimensions = {local(d): (str(lab), str(note) if note is not None else "")
              for d, lab, note in g.query(Q_DIMENSIONS)}
elements = {local(e): {"id": local(e), "label": str(lab), "dimension": local(dim)}
            for e, lab, dim in g.query(Q_ELEMENTS)}

matrix = {}
for e, lv in g.query(Q_SUPPORTS):
    matrix[(local(e), local(lv))] = "supports"
for e, lv in g.query(Q_CONTRA):
    matrix[(local(e), local(lv))] = "contraindicated"

say("   %d modules, %d outcomes, %d criteria, %d processes"
    % (len(modules), len(outcome_label), len(criteria), len(processes)))
say("   %d dimensions, %d game elements, %d suitability entries"
    % (len(dimensions), len(elements), len(matrix)))

if not criteria:
    sys.exit("The curriculum graph declares no assessment criteria. "
             "See curriculum\\README.md for what a curriculum must supply.")


# ============================================================ 3. assert content
head("3. Asserting learners, activities and contexts into the graph")

for lr in learners:
    subj = GPO["Learner_" + lr["id"]]
    g.add((subj, RDF.type, GPO.Learner))
    g.add((subj, RDFS.label, Literal(lr["label"])))
    for p in lr["encountered"]:
        g.add((subj, GPO.hasEncountered, GPO["P_" + p]))

for a in activities:
    subj = GPO["Act_" + a["id"]]
    g.add((subj, RDF.type, GPO.LearningActivity))
    g.add((subj, RDFS.label, Literal(a["label"])))
    g.add((subj, GPO.aiVulnerability, Literal(a["aiVulnerability"])))
    for code in a["criteria"]:
        cid = code_to_criterion.get(code)
        if cid is None:
            sys.exit("Activity %s names criterion %s, which is not in the ontology."
                     % (a["id"], code))
        g.add((subj, GPO.addressesCriterion, GPO[cid]))

context_ids = {}
for lr in learners:
    for a in activities:
        cid = "CTX_%s_%s" % (lr["id"], a["id"])
        subj = GPO[cid]
        g.add((subj, RDF.type, GPO.LearnerActivityContext))
        g.add((subj, GPO.forLearner, GPO["Learner_" + lr["id"]]))
        g.add((subj, GPO.forActivity, GPO["Act_" + a["id"]]))
        context_ids[cid] = (lr["id"], a["id"])

say("   graph now holds %d triples (%d contexts asserted)"
    % (len(g), len(context_ids)))


# ============================================================ 4. rule R1
head("4. Materialising rule R1")

R1_QUERIES = {}
r1_source = open(paths.R1_RQ, encoding="utf-8").read()
# The .rq file holds three CONSTRUCT queries after one shared PREFIX line. They
# are split out of the file rather than repeated here, so that the rule has one
# home on disk. The split is on a line that begins with CONSTRUCT in column one,
# which no comment does.
prefix_line = "PREFIX gpo: <http://www.tut.ac.za/ontologies/gpo#>\n"
for chunk in re.split(r"(?m)^(?=CONSTRUCT)", r1_source):
    if not chunk.startswith("CONSTRUCT"):
        continue
    end = chunk.rfind("}")
    name = "R1" + "abcd"[len(R1_QUERIES)]
    R1_QUERIES[name] = prefix_line + chunk[:end + 1]

if len(R1_QUERIES) != 4:
    sys.exit("Expected four CONSTRUCT queries in the R1 file, found %d."
             % len(R1_QUERIES))

derived_counts = {}
for name in sorted(R1_QUERIES):
    res = g.query(R1_QUERIES[name])
    n = len(res.graph)
    g += res.graph
    derived_counts[name] = n
    say("   %s derived %d assertion(s)" % (name, n))

g.serialize(INFERRED_PATH, format="turtle")
say("   wrote %s (%d triples)" % (os.path.relpath(INFERRED_PATH, ROOT), len(g)))

Q_LEVELS = """
PREFIX gpo: <http://www.tut.ac.za/ontologies/gpo#>
SELECT ?ctx ?level WHERE { ?ctx gpo:hasEffectiveLevel ?level }
"""
levels_by_context = {}
for ctx, lv in g.query(Q_LEVELS):
    levels_by_context.setdefault(local(ctx), set()).add(local(lv))

platform_contexts = {}
multi = 0
for cid, (lid, aid) in context_ids.items():
    found = levels_by_context.get(cid)
    if not found:
        report["findings"].append("Rule R1 derived no level for %s." % cid)
        continue
    if len(found) > 1:
        multi += 1
    highest = max(found, key=lambda x: LEVEL_ORDER.index(x))
    platform_contexts[cid] = (lid, aid, highest, len(found),
                              ",".join(sorted(found, key=LEVEL_ORDER.index)))

say("   %d of %d platform contexts received a level" % (len(platform_contexts),
                                                        len(context_ids)))
if multi:
    msg = ("Rule R1 derived more than one level for %d contexts. An activity "
           "addressing several criteria receives a level for each: derived by "
           "R1a to R1c where the criterion requires a procedure, and asserted by "
           "R1d where it does not. The highest is taken, on the reading that an "
           "activity is no easier than its hardest part." % multi)
    say("   note: %s" % msg)
    report["findings"].append(msg)

fixture_levels = {c: sorted(v) for c, v in levels_by_context.items()
                  if c not in context_ids}
report["ontology_fixtures"] = fixture_levels
say("   ontology's own demonstration contexts: %s"
    % (", ".join("%s=%s" % (k, "/".join(v)) for k, v in sorted(fixture_levels.items()))
       or "(none)"))


# ============================================================ 5. propose designs
head("5. Proposing a design for every activity at every level reached")

levels_reached = sorted({c[2] for c in platform_contexts.values()},
                        key=LEVEL_ORDER.index)
say("   levels reached by the corpus: %s" % ", ".join(levels_reached))

by_id = sorted(elements.values(), key=lambda e: e["id"])


designs = {}
activity_by_id = {a["id"]: a for a in activities}
asserted_levels = {
    a["id"]: {criteria[code_to_criterion[c]]["level"] for c in a["criteria"]}
    for a in activities
}
# A design is proposed for every activity at every level, not only at the levels
# the corpus currently reaches. Two reasons. The design console lets an educator
# ask what the model would do at any level, and rule R1c moves a learner to
# Remember the moment they complete an activity, which is a level no context
# starts at.
needed = [(a["id"], lv) for a in activities for lv in LEVEL_ORDER]

for aid, level in needed:
    a = activity_by_id[aid]
    respect = {level} | asserted_levels[aid]
    chosen, reasons, reward, rationale = propose(
        by_id, matrix, level, respect, a["aiVulnerability"])
    did = "DESIGN_%s_%s" % (aid, level)
    designs[did] = {"id": did, "activity": aid, "level": level,
                    "reward": reward, "rationale": rationale,
                    "elements": [(e["id"], reasons[e["id"]]) for e in chosen]}

    subj = GPO[did]
    g.add((subj, RDF.type, GPO.GamifiedActivityDesign))
    g.add((subj, RDFS.label, Literal("%s at %s" % (a["label"], level))))
    g.add((subj, GPO.gamifies, GPO["Act_" + aid]))
    g.add((subj, GPO.hasRewardBasis, GPO[reward]))
    for e in chosen:
        g.add((subj, GPO.appliesElement, GPO[e["id"]]))

say("   %d designs proposed: %d activities at each of %d levels"
    % (len(designs), len(activities), len(LEVEL_ORDER)))
sizes = sorted({len(d["elements"]) for d in designs.values()})
say("   elements per design: %s" % ", ".join(str(s) for s in sizes))


# ============================================================ 6. SHACL
head("6. Validating every design with pySHACL")

try:
    from pyshacl import validate
except ImportError:
    sys.exit("pyshacl is not installed.  Run:  py -m pip install -r requirements.txt")

shapes = Graph().parse(paths.SHAPES_TTL, format="turtle")
conforms, results_graph, results_text = validate(
    g, shacl_graph=shapes, advanced=True, inference="none",
    abort_on_first=False, meta_shacl=False)

SH = Namespace("http://www.w3.org/ns/shacl#")
Q_RESULTS = """
PREFIX sh: <http://www.w3.org/ns/shacl#>
SELECT ?focus ?message ?shape WHERE {
    ?r a sh:ValidationResult ; sh:focusNode ?focus ; sh:resultMessage ?message .
    OPTIONAL { ?r sh:sourceShape ?shape }
}
"""
violations = []
for focus, message, shape in results_graph.query(Q_RESULTS):
    msg = str(message)
    rule_id = msg.split(" ", 1)[0] if msg[:1] == "R" else "?"
    violations.append({"design": local(focus), "rule": rule_id,
                       "shape": local(shape) if shape is not None else "",
                       "message": msg})

say("   conforms: %s" % conforms)
say("   %d violation(s) reported" % len(violations))

platform_violations = [v for v in violations if v["design"] in designs]
fixture_violations = [v for v in violations if v["design"] not in designs]

say("   against the %d proposed designs: %d" % (len(designs), len(platform_violations)))
say("   against the ontology's own test designs: %d" % len(fixture_violations))
for v in fixture_violations:
    say("      %s  %s" % (v["design"], v["message"][:96]))

if platform_violations:
    counts = {}
    for v in platform_violations:
        counts[v["rule"]] = counts.get(v["rule"], 0) + 1
    msg = ("pySHACL rejected %d of the %d designs the platform proposed: %s. The "
           "proposal routine builds designs to satisfy R2, R3 and R5, so every "
           "such rejection is a disagreement between the selection code and the "
           "shapes and must be resolved before the design is served."
           % (len({v['design'] for v in platform_violations}), len(designs),
              ", ".join("%s x%d" % (k, n) for k, n in sorted(counts.items()))))
    say()
    say("   FINDING: %s" % msg)
    report["findings"].append(msg)
    for v in platform_violations[:10]:
        say("      %s  %s" % (v["design"], v["message"][:110]))

# R2's shape tests the criterion's asserted level. The platform selects on the
# effective level R1 derived. Where the two differ, the shape and the selection
# are looking at different things; that divergence is measured, not hidden.
#
# Since rule R1d, an activity receives one level for each criterion it addresses
# -- derived by R1a to R1c where the criterion requires a procedure, asserted
# where it does not -- and the highest is taken. A level outside the asserted set
# therefore means the rule moved at least one criterion, which is the claim of
# the study rather than a defect. What would be a defect is the remaining case:
# a criterion that requires a procedure and is nonetheless classified at a level
# R1 cannot derive at all.
DERIVABLE = ("Remember", "Apply", "Create")

divergent = 0
for cid, (lid, aid, level, _n, _all) in platform_contexts.items():
    if level not in asserted_levels[aid]:
        divergent += 1

beyond = {}
for c in criteria.values():
    if c.get("process") and c["level"] not in DERIVABLE:
        beyond.setdefault(c["level"], []).append(c["code"])

criteria_of_activity = {a["id"]: set(a["criteria"]) for a in activities}
beyond_contexts = 0
if beyond:
    reach = {code for codes in beyond.values() for code in codes}
    for cid, (lid, aid, level, _n, _all) in platform_contexts.items():
        if any(c in reach for c in criteria_of_activity[aid]):
            beyond_contexts += 1

if divergent:
    msg = ("In %d of %d contexts the level the platform serves is not among the "
           "levels the activity's criteria assert. Since rule R1d each criterion "
           "contributes a level -- derived where it requires a procedure, asserted "
           "where it does not -- and the activity takes the highest, so this counts "
           "the contexts in which prior instruction moved the activity away from "
           "its stated classification. That is what the model is for. The SHACL "
           "shape for R2 tests the asserted level while the platform selects on "
           "the effective one, and the design proposal excludes any element "
           "contraindicated at either, so both readings are satisfied."
           % (divergent, len(platform_contexts)))
    say()
    say("   FINDING: %s" % msg)
    report["findings"].append(msg)

if beyond:
    msg = ("%d criterion/criteria require a procedure to be carried out and are "
           "nonetheless classified at a level rule R1 cannot derive (%s), which "
           "affects %d contexts. R1 reasons from procedural familiarity and can "
           "place such a criterion only at Remember, Apply or Create; the "
           "classification says otherwise, and both are defensible. This is the "
           "case the rule cannot accommodate and it is reported rather than "
           "resolved."
           % (sum(len(v) for v in beyond.values()),
              "; ".join("%s at %s" % (", ".join(sorted(codes)), lv)
                        for lv, codes in sorted(beyond.items())),
              beyond_contexts))
    say()
    say("   FINDING: %s" % msg)
    report["findings"].append(msg)
report["levels_overridden_by_r1"] = overridden


# ============================================================ 7. write SQLite
head("7. Writing the knowledge base")

if os.path.exists(DB_PATH):
    os.remove(DB_PATH)
db = sqlite3.connect(DB_PATH)
db.executescript(open(SCHEMA_PATH, encoding="utf-8").read())

db.executemany("INSERT INTO module VALUES (?,?)", sorted(modules.items()))
db.executemany("INSERT INTO process VALUES (?,?)", sorted(processes.items()))
db.executemany("INSERT INTO outcome VALUES (?,?,?,?)",
               [(oid, outcome_module[oid], outcome_label[oid], outcome_label[oid])
                for oid in sorted(outcome_label)])
db.executemany(
    "INSERT INTO criterion VALUES (?,?,?,?,?,?,?,?)",
    [(c["id"], c["outcome"], c["code"], c["text"], c["level"], c["process"],
      c["flag"], c["note"]) for c in sorted(criteria.values(), key=lambda x: x["id"])])

db.executemany("INSERT INTO dimension VALUES (?,?,?)",
               [(d, v[0], v[1]) for d, v in sorted(dimensions.items())])
db.executemany("INSERT INTO element VALUES (?,?,?)",
               [(e["id"], e["label"], e["dimension"]) for e in by_id])
db.executemany("INSERT INTO element_level VALUES (?,?,?)",
               [(eid, lv, verdict) for (eid, lv), verdict in sorted(matrix.items())])

db.executemany("INSERT INTO learner VALUES (?,?,?)",
               [(l["id"], l["label"], l.get("note", "")) for l in learners])
db.executemany("INSERT INTO learner_process VALUES (?,?,'declared')",
               [(l["id"], p) for l in learners for p in l["encountered"]])

db.executemany(
    "INSERT INTO activity VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [(a["id"], a["label"], a.get("language"), a["kind"], a["aiVulnerability"],
      a["prompt"], a.get("code"), a.get("codeBefore"), a.get("codeAfter"),
      json.dumps(a.get("options")) if a.get("options") else None,
      a["answer"], json.dumps(a.get("accept", [])), a["explanation"])
     for a in activities])
db.executemany("INSERT INTO activity_criterion VALUES (?,?)",
               [(a["id"], code_to_criterion[c])
                for a in activities for c in a["criteria"]])

db.executemany("INSERT INTO context VALUES (?,?,?,?,?,?)",
               [(cid, lid, aid, lvl, n, allv)
                for cid, (lid, aid, lvl, n, allv) in sorted(platform_contexts.items())])

db.executemany("INSERT INTO design VALUES (?,?,?,?,?)",
               [(d["id"], d["activity"], d["level"], d["reward"], d["rationale"])
                for d in sorted(designs.values(), key=lambda x: x["id"])])
db.executemany("INSERT INTO design_element VALUES (?,?,?)",
               [(d["id"], eid, why)
                for d in sorted(designs.values(), key=lambda x: x["id"])
                for eid, why in d["elements"]])
db.executemany("INSERT INTO validation VALUES (?,?,?,?)",
               [(v["design"], v["rule"], v["shape"], v["message"])
                for v in platform_violations])

TRACE = [
    ("gpo:AssessmentCriterion", "class", "criterion table; criterion codes shown on every activity page",
     "build/schema.sql, web/src/Activity.jsx", "%d rows" % len(criteria)),
    ("gpo:LearningActivity", "class", "activity table; the activity list and workspace",
     "build/schema.sql, web/src/Activities.jsx", "%d rows" % len(activities)),
    ("gpo:LearnerActivityContext", "class", "context table; one row per learner and activity",
     "build/schema.sql", "%d rows" % len(platform_contexts)),
    ("gpo:GamifiedActivityDesign", "class", "design and design_element tables; the design console",
     "build/schema.sql, web/src/Console.jsx", "%d designs" % len(designs)),
    ("gpo:hasEffectiveLevel", "property", "context.effective_level; the level badge on the activity list",
     "build/build_kb.py step 4", "R1 derived %s" % derived_counts),
    ("gpo:aiVulnerability", "property", "activity.ai_vulnerability; drives the reward basis",
     "build/design.py REWARD_FOR", "%d high, %d medium, %d low"
     % (sum(1 for a in activities if a["aiVulnerability"] == "high"),
        sum(1 for a in activities if a["aiVulnerability"] == "medium"),
        sum(1 for a in activities if a["aiVulnerability"] == "low"))),
    ("gpo:supportsLevel / gpo:contraindicatedFor", "property",
     "element_level table; the reason shown beside every element in the console",
     "build/schema.sql, api/src/rules.js", "%d entries" % len(matrix)),
    ("R1 effective cognitive level", "rule",
     "materialised at build time; re-derived at run time by rules.effectiveLevel for parity testing",
     "model/r1-effective-level.rq, api/src/rules.js", "%d contexts" % len(platform_contexts)),
    ("R2 element suitability", "rule", "checked live in the design console",
     "api/src/rules.js checkR2", "permissive reading; %d contraindication entries"
     % sum(1 for v in matrix.values() if v == "contraindicated")),
    ("R3 dimension balance", "rule", "checked live in the design console",
     "api/src/rules.js checkR3", "three dimensions, one Personal, one Measurement"),
    ("R5 AI vulnerability", "rule", "checked live in the design console; sets the reward basis",
     "api/src/rules.js checkR5", "%d activities at high vulnerability"
     % sum(1 for a in activities if a["aiVulnerability"] == "high")),
    ("DR1 educational taxonomy", "requirement", "Toda et al. elements loaded from the ontology",
     "build/build_kb.py step 2", "%d elements in %d dimensions" % (len(elements), len(dimensions))),
    ("DR2 formal learning outcomes", "requirement", "criteria taken from the study guides, not invented",
     "curriculum/%s/activities.json" % CURRICULUM, "%d criteria addressed by activities"
     % len({c for a in activities for c in a["criteria"]})),
    ("DR3 derived rather than asserted level", "requirement",
     "no effective level is written by hand anywhere in the codebase",
     "build/build_kb.py step 4", "every one of %d contexts derived" % len(platform_contexts)),
    ("DR4 automated evaluation", "requirement",
     "check_content.py, verify_parity.py and build_report.json run without a human",
     "build/", "no participant data is collected"),
]
db.executemany("INSERT INTO traceability VALUES (?,?,?,?,?)", TRACE)

meta = {
    "built": report["generated"],
    "curriculum": CURRICULUM,
    "ontology_triples_before_r1": "see build_report.json",
    "graph_triples_after_build": str(len(g)),
    "activities": str(len(activities)),
    "learners": str(len(learners)),
    "criteria": str(len(criteria)),
    "contexts": str(len(platform_contexts)),
    "designs": str(len(designs)),
    "shacl_conforms": str(conforms),
    "platform_violations": str(len(platform_violations)),
}
db.executemany("INSERT INTO build_meta VALUES (?,?)", sorted(meta.items()))
db.commit()

counts = {}
for table in ("module", "process", "outcome", "criterion", "dimension", "element",
              "element_level", "learner", "learner_process", "activity",
              "activity_criterion", "context", "design", "design_element",
              "validation", "traceability"):
    counts[table] = db.execute("SELECT COUNT(*) FROM %s" % table).fetchone()[0]
db.close()

for t in sorted(counts):
    say("   %-20s %5d" % (t, counts[t]))
say("   wrote %s" % os.path.relpath(DB_PATH, ROOT))


# ============================================================ 8. D1 seed
head("8. Writing the Cloudflare D1 seed")

# The same conclusions, as SQL, so that the edge deployment holds exactly what
# the local database holds. Written from the database rather than from the
# Python objects, so that anything the schema's constraints rejected is absent
# from both.
def sql_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


db = sqlite3.connect(DB_PATH)
db.row_factory = sqlite3.Row

SEEDED = ("module", "process", "outcome", "criterion", "dimension", "element",
          "element_level", "learner", "learner_process", "activity",
          "activity_criterion", "context", "design", "design_element",
          "validation", "traceability", "build_meta")

schema_sql = open(SCHEMA_PATH, encoding="utf-8").read()
# D1 applies its own foreign-key handling and rejects PRAGMA statements.
schema_sql = "\n".join(ln for ln in schema_sql.splitlines()
                       if not ln.strip().upper().startswith("PRAGMA"))

rows_written = 0
with open(D1_SEED_PATH, "w", encoding="utf-8") as out:
    out.write("-- Generated by build/build_kb.py on %s from curriculum %r.\n"
              "-- Do not edit. Rebuild instead.\n"
              "--\n"
              "-- Apply with:\n"
              "--   npx wrangler d1 execute eduntology --local  --file=../build/d1-seed.sql\n"
              "--   npx wrangler d1 execute eduntology --remote --file=../build/d1-seed.sql\n\n"
              % (report["generated"], CURRICULUM))
    out.write(schema_sql.rstrip() + "\n\n")
    for table in SEEDED:
        cursor = db.execute("SELECT * FROM %s" % table)
        columns = [c[0] for c in cursor.description]
        batch = cursor.fetchall()
        if not batch:
            continue
        out.write("-- %s (%d rows)\n" % (table, len(batch)))
        for row in batch:
            values = ", ".join(sql_literal(row[c]) for c in columns)
            out.write("INSERT INTO %s (%s) VALUES (%s);\n"
                      % (table, ", ".join(columns), values))
            rows_written += 1
        out.write("\n")
db.close()

say("   %d rows across %d tables" % (rows_written, len(SEEDED)))
say("   wrote %s (%.0f KB)"
    % (os.path.relpath(D1_SEED_PATH, ROOT), os.path.getsize(D1_SEED_PATH) / 1024.0))


# ============================================================ 9. report
report.update({
    "curriculum": CURRICULUM,
    "counts": counts,
    "d1_seed_rows": rows_written,
    "r1_derived": derived_counts,
    "levels_reached": levels_reached,
    "shacl_conforms": bool(conforms),
    "platform_violations": platform_violations,
    "fixture_violations": fixture_violations,
    "contexts_with_multiple_levels": multi,
    "contexts_diverging_from_asserted_level": divergent,
})
json.dump(report, open(REPORT_PATH, "w", encoding="utf-8"), indent=2)

head("Done")
say("   %s" % os.path.relpath(REPORT_PATH, ROOT))
if report["findings"]:
    say()
    say("   %d finding(s) recorded for Chapter 6:" % len(report["findings"]))
    for f in report["findings"]:
        say("     - %s" % f[:150])
else:
    say("   no findings")
