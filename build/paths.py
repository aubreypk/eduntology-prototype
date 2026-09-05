# -*- coding: utf-8 -*-
"""Where everything lives, and which curriculum is in force.

The model and the curriculum are separate graphs. The model is this study's
contribution and is in the repository; a curriculum is somebody's course
material and may not be. `curriculum/example` is invented and committed so that
the repository runs for anyone; `curriculum/tut` holds the Tshwane University of
Technology material and is deliberately not committed.

Choosing a curriculum, in order of precedence:

    py build\\build_kb.py --curriculum example
    set EDUNTOLOGY_CURRICULUM=example
    (neither given: curriculum/tut if it is present, otherwise example)

The fallback means a fresh clone builds and runs with no configuration, and a
working copy that has the TUT material uses it without anyone remembering to
say so.
"""

import os
import sys

BUILD = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BUILD)

MODEL_DIR = os.path.join(ROOT, "model")
MODEL_TTL = os.path.join(MODEL_DIR, "eduntology.ttl")
SHAPES_TTL = os.path.join(MODEL_DIR, "shapes.ttl")
R1_RQ = os.path.join(MODEL_DIR, "r1-effective-level.rq")
CQ_RQ = os.path.join(MODEL_DIR, "competency-questions.rq")

CURRICULA = os.path.join(ROOT, "curriculum")

DB_PATH = os.path.join(BUILD, "kb.db")
D1_SEED = os.path.join(BUILD, "d1-seed.sql")
BUILD_REPORT = os.path.join(BUILD, "build_report.json")
PARITY_REPORT = os.path.join(BUILD, "parity_report.json")
INFERRED_TTL = os.path.join(BUILD, "inferred.ttl")
SCHEMA_SQL = os.path.join(BUILD, "schema.sql")


def which_curriculum(argv=None):
    """The curriculum name in force, from --curriculum, the environment, or the
    fallback. Exits with a clear message if the named one does not exist."""
    argv = sys.argv if argv is None else argv
    name = None

    for i, arg in enumerate(argv):
        if arg == "--curriculum" and i + 1 < len(argv):
            name = argv[i + 1]
        elif arg.startswith("--curriculum="):
            name = arg.split("=", 1)[1]

    if name is None:
        name = os.environ.get("EDUNTOLOGY_CURRICULUM") or None

    if name is None:
        name = "tut" if os.path.isdir(os.path.join(CURRICULA, "tut")) else "example"

    directory = os.path.join(CURRICULA, name)
    if not os.path.isdir(directory):
        available = sorted(d for d in os.listdir(CURRICULA)
                           if os.path.isdir(os.path.join(CURRICULA, d)))
        sys.exit("No curriculum named %r in curriculum\\. Available: %s"
                 % (name, ", ".join(available) or "none"))

    for required in ("curriculum.ttl", "activities.json", "learners.json"):
        if not os.path.isfile(os.path.join(directory, required)):
            sys.exit("Curriculum %r is missing %s. See curriculum\\README.md."
                     % (name, required))

    return name, directory


def curriculum_files(argv=None):
    """(name, curriculum.ttl, activities.json, learners.json)"""
    name, directory = which_curriculum(argv)
    return (name,
            os.path.join(directory, "curriculum.ttl"),
            os.path.join(directory, "activities.json"),
            os.path.join(directory, "learners.json"))
