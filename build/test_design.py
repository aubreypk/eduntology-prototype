# -*- coding: utf-8 -*-
"""Exercise the design selection on its own, before any build is run.

The selection in design.py claims to produce designs that satisfy rules R2, R3
and R5 by construction. This checks that claim against every activity in the
content at every cognitive level, using the same rule logic the running platform
uses, and needs neither a reasoner nor a database to do it.

It is a fast check that a change to the selection has not quietly started
producing designs the platform would reject. build_kb.py and verify_parity.py
are the slower checks against rdflib and pySHACL.

Run:  py backend\\test_design.py
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import paths                                                             # noqa: E402
from design import LEVEL_ORDER, MINIMUM_DIMENSIONS, REWARD_FOR, propose  # noqa: E402

CURRICULUM, CURRICULUM_TTL, ACTIVITIES, _LEARNERS = paths.curriculum_files()


def read_ontology():
    """Elements, dimensions, the suitability matrix and the criteria.

    Read textually rather than with rdflib, so that this check runs anywhere.
    Everything the platform actually reasons over goes through rdflib in
    build_kb.py; nothing here is used at build time.
    """
    text = (open(paths.MODEL_TTL, encoding="utf-8").read()
            + open(CURRICULUM_TTL, encoding="utf-8").read())

    elements, matrix = [], {}
    for block in re.findall(
            r"gpo:(\w+) a owl:NamedIndividual , gpo:GameElement ;(.*?)\.\n", text, re.S):
        eid, body = block
        dim = re.search(r"gpo:belongsToDimension gpo:(\w+)", body)
        label = re.search(r'rdfs:label "([^"]+)"', body)
        elements.append({"id": eid, "label": label.group(1) if label else eid,
                         "dimension": dim.group(1)})
        for verdict, prop in (("supports", "supportsLevel"),
                              ("contraindicated", "contraindicatedFor")):
            m = re.search(r"gpo:%s ([^;.]+)" % prop, body)
            if m:
                for lv in re.findall(r"gpo:(\w+)", m.group(1)):
                    matrix[(eid, lv)] = verdict

    criteria = {}
    for cid, body in re.findall(
            r"gpo:(AC_\w+) a owl:NamedIndividual , gpo:AssessmentCriterion ;(.*?)\n\n",
            text, re.S):
        code = re.search(r'gpo:criterionCode "([^"]+)"', body).group(1)
        level = re.search(r"gpo:atCognitiveLevel gpo:(\w+)", body).group(1)
        criteria[code] = level

    return elements, matrix, criteria


def main():
    elements, matrix, criteria = read_ontology()
    activities = json.load(open(ACTIVITIES, encoding="utf-8"))["activities"]

    print("Curriculum: %s" % CURRICULUM)
    print("%d game elements, %d suitability entries, %d criteria"
          % (len(elements), len(matrix), len(criteria)))

    by_dimension = {e["id"]: e["dimension"] for e in elements}
    failures, designs = [], 0
    shapes = {}

    for a in activities:
        asserted = {criteria[c] for c in a["criteria"]}
        for level in LEVEL_ORDER:
            respect = {level} | asserted
            chosen, reasons, reward, _rationale = propose(
                elements, matrix, level, respect, a["aiVulnerability"])
            designs += 1
            ids = [e["id"] for e in chosen]
            dims = {by_dimension[i] for i in ids}
            shapes[len(ids)] = shapes.get(len(ids), 0) + 1

            # R2, over every level the design must answer for
            for eid in ids:
                for lv in respect:
                    if matrix.get((eid, lv)) == "contraindicated":
                        failures.append("%s at %s: %s is contraindicated at %s"
                                        % (a["id"], level, eid, lv))

            # R3
            if len(dims) < MINIMUM_DIMENSIONS:
                failures.append("%s at %s: only %d dimension(s): %s"
                                % (a["id"], level, len(dims), ", ".join(sorted(dims))))
            for required in ("Personal", "Measurement"):
                if required not in dims:
                    failures.append("%s at %s: no %s element"
                                    % (a["id"], level, required))

            # R5
            if a["aiVulnerability"] == "high" and reward == "CompletionReward":
                failures.append("%s at %s: completion reward on a high-vulnerability "
                                "activity" % (a["id"], level))

            # every chosen element must carry a reason
            for eid in ids:
                if not reasons.get(eid):
                    failures.append("%s at %s: %s has no reason recorded"
                                    % (a["id"], level, eid))

            # determinism
            again, _r, _w, _x = propose(elements, matrix, level, respect,
                                        a["aiVulnerability"])
            if [e["id"] for e in again] != ids:
                failures.append("%s at %s: selection is not deterministic"
                                % (a["id"], level))

    print("%d designs generated across %d activities and %d levels"
          % (designs, len(activities), len(LEVEL_ORDER)))
    print("elements per design: %s"
          % ", ".join("%d elements in %d designs" % (k, v)
                      for k, v in sorted(shapes.items())))
    print("reward bases in use: %s"
          % ", ".join(sorted({REWARD_FOR[a["aiVulnerability"]] for a in activities})))

    if failures:
        print()
        print("FAILED: %d problem(s)" % len(failures))
        for f in failures[:25]:
            print("  - %s" % f)
        if len(failures) > 25:
            print("  ... and %d more" % (len(failures) - 25))
        return 1

    print()
    print("Every proposed design satisfies R2, R3 and R5 by construction.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
