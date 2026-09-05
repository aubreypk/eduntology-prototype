# -*- coding: utf-8 -*-
"""Selecting a gamified design from the model's own suitability matrix.

Kept apart from build_kb.py so that the selection can be exercised on its own,
without a reasoner and without a database. backend/test_design.py does exactly
that, which is how the selection is checked before a build is ever run.
"""

LEVEL_ORDER = ["Remember", "Understand", "Apply", "Analyse", "Evaluate", "Create"]

# Reward basis by AI vulnerability. Rule R5 forbids completion-based reward where
# the artefact can be produced by a generative model without the learner doing
# the work; the gradient below is the platform's reading of that, stated once
# here rather than scattered through the code.
REWARD_FOR = {
    "high": "ExplanationReward",
    "medium": "ProcessReward",
    "low": "CompletionReward",
}

MAX_ELEMENTS = 4
MINIMUM_DIMENSIONS = 3

REWARD_WORDS = {
    "CompletionReward": "the completed artefact",
    "ProcessReward": "the steps taken",
    "ExplanationReward": "the learner's explanation",
}


def propose(elements, matrix, level, respect, ai_vulnerability):
    """Select elements for one activity at one cognitive level.

    elements  list of {"id", "label", "dimension"}, in a fixed order
    matrix    {(element_id, level): "supports" | "contraindicated"}
    level     the effective level rule R1 derived; elements are preferred for it
    respect   every level the activity occupies under either reading: the
              effective level, and the levels asserted on its criteria
    ai_vulnerability  high | medium | low

    An element contraindicated at any level in `respect` is excluded. The wider
    exclusion is deliberate: the SHACL shape for R2 tests a design against the
    criterion's asserted level, while the platform selects on the effective
    level, and a design satisfying only one of the two readings would be
    rejected by the platform's own validator.

    Deterministic. The same inputs always give the same design, which is what
    makes a build reproducible and a disagreement with pySHACL meaningful.

    Returns (chosen, reasons, reward_basis, rationale).
    """
    by_id = sorted(elements, key=lambda e: e["id"])
    allowed = [e for e in by_id
               if not any(matrix.get((e["id"], lv)) == "contraindicated"
                          for lv in respect)]
    supporting = [e for e in allowed if matrix.get((e["id"], level)) == "supports"]

    chosen, reasons = [], {}

    def take(dimension, why):
        for pool, note in ((supporting, "Supports %s." % level),
                           (allowed, "Permitted at %s: nothing in the matrix "
                                     "contraindicates it there, which under the "
                                     "permissive reading of R2 is enough." % level)):
            for e in pool:
                if e["dimension"] == dimension and e not in chosen:
                    chosen.append(e)
                    reasons[e["id"]] = note + " " + why
                    return True
        return False

    take("Measurement",
         "R3 requires a Measurement element: without feedback the learner is "
         "left disoriented.")
    take("Personal",
         "R3 requires a Personal element: without one the activity carries no "
         "meaning for the learner.")

    while len({e["dimension"] for e in chosen}) < MINIMUM_DIMENSIONS:
        covered = {e["dimension"] for e in chosen}
        candidate = (next((e for e in supporting if e["dimension"] not in covered), None)
                     or next((e for e in allowed if e["dimension"] not in covered), None))
        if candidate is None:
            break
        chosen.append(candidate)
        reasons[candidate["id"]] = (
            "Adds the %s dimension, so that the design draws on at least three "
            "as R3 requires." % candidate["dimension"])

    for e in supporting:
        if len(chosen) >= MAX_ELEMENTS:
            break
        if e not in chosen:
            chosen.append(e)
            reasons[e["id"]] = "Supports %s." % level

    reward = REWARD_FOR[ai_vulnerability]
    others = ", ".join(sorted(set(respect) - {level})) or "none"
    rationale = (
        "Built for the %s level, with elements also checked against the levels "
        "asserted on this activity's criteria (%s). Reward attaches to %s "
        "because the activity's vulnerability to generative assistance is %s; "
        "rule R5 bars completion-based reward where that vulnerability is high."
        % (level, others, REWARD_WORDS[reward], ai_vulnerability))

    return chosen, reasons, reward, rationale
