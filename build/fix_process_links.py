# Remove gpo:requiresProcess from criteria that require no procedure.
#
#   python build/fix_process_links.py --curriculum tut            (report only)
#   python build/fix_process_links.py --curriculum tut --write    (make the change)
#
# Why
# ---
# gpo:requiresProcess is defined in Section 4.4.2 as relating an assessment
# criterion to the procedure the criterion requires the learner to CARRY OUT.
# On the eleven criteria below it was used instead to record what the criterion
# is ABOUT. Every one of them is of the form "X is explained" or "the difference
# between X and Y is explained by describing...", and the processes they point
# at are topics rather than procedures: Control flow concepts, Loop kinds, Array
# concept, Parallel arrays.
#
# The consequence is not cosmetic. Rules R1a and R1b both require a process, so
# the rule fires on these criteria and derives Apply or Create, overwriting an
# asserted Understand. That is the whole of the "R1 replaced an asserted
# Understand in 60 contexts" finding, and it is an encoding error rather than a
# limitation of the rule.
#
# What is deliberately NOT touched
# --------------------------------
#   D.2.5, A.1.5   a program IS created, so the process link is sound; it is the
#                  asserted Evaluate that is in question. A classification
#                  decision, not an encoding one. A.1.5 also repeats D.2.5.
#   B.2.7          the study guide conflates exemplifying a difference with
#                  writing a program. Split it or classify it, but do not
#                  silently drop the link.
#   D.1.9          drawing flowchart symbols is genuinely a procedure AND the
#                  level is genuinely Understand. This is the real counter-
#                  example to R1 as Section 4.4.4 states it, and it should
#                  survive into Chapter 6 rather than be tidied away.
#   E.1.21         tracing consequences; readable at Understand or Analyse.
#
# The change is reversible through git, and re-running build_kb.py reports the
# effect.

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import which_curriculum                          # noqa: E402

# The criterion is satisfied by an explanation. Nothing is carried out.
TOPIC_TAGGED = {
    "D.1.1": "Importance of control structures ... explained",
    "D.1.3": "Importance of selection control structures ... explained",
    "D.1.6": "Difference between counter- and sentinel-controlled iteration ... explained",
    "D.2.3": "Importance of the braces in an if structure ... explained",
    "D.3.1": "Difference between count-controlled, sentinel-controlled and infinite loops ... explained",
    "E.1.2": "The properties of a one-dimensional array are explained",
    "E.1.12": "The parallel arrays concept is explained",
    "E.1.15": "The linear search technique is explained",
    "E.1.17": "The bubble sort technique is explained",
    "E.1.19": "The pass-by-value concept is explained",
    "E.1.20": "The pass-by-reference concept is explained",
}

CODE = re.compile(r'gpo:criterionCode\s+"([^"]+)"')
REQUIRES = re.compile(r'^\s*gpo:requiresProcess\s+\S+\s*([;.])\s*$')


def blocks(text):
    """Yield (start, end) line indices for each subject block."""
    lines = text.split("\n")
    start = None
    for i, line in enumerate(lines):
        if re.match(r'^\S.*\ba\b.*owl:NamedIndividual', line) or (
                start is None and line.startswith("gpo:")):
            start = i
        if start is not None and line.rstrip().endswith(" ."):
            yield start, i
            start = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--curriculum", default=None)
    parser.add_argument("--write", action="store_true",
                        help="apply the change; without it, only report")
    args = parser.parse_args()

    name, folder = which_curriculum()
    path = os.path.join(folder, "curriculum.ttl")
    if not os.path.exists(path):
        sys.exit("No %s" % path)
    print("Curriculum: %s" % name)
    print("File:       %s" % path)
    print()

    text = open(path, encoding="utf-8").read()
    lines = text.split("\n")
    remove = []

    for start, end in blocks(text):
        block = "\n".join(lines[start:end + 1])
        found = CODE.search(block)
        if not found or found.group(1) not in TOPIC_TAGGED:
            continue
        for i in range(start, end + 1):
            if REQUIRES.match(lines[i]):
                remove.append((found.group(1), i, lines[i].strip()))
                break

    seen = {code for code, _, _ in remove}
    for code in sorted(TOPIC_TAGGED):
        if code not in seen:
            print("   NOT FOUND: %s has no gpo:requiresProcess to remove" % code)

    print("%d of %d criteria carry a process link to remove:" % (len(remove), len(TOPIC_TAGGED)))
    for code, i, statement in sorted(remove):
        print("   %-8s line %-5d %s" % (code, i + 1, statement))
        print("            %s" % TOPIC_TAGGED[code])
    print()

    if not args.write:
        print("Nothing written. Re-run with --write to apply, then:")
        print("   python build\\build_kb.py --curriculum %s" % name)
        print("   python build\\diagnose_r1.py")
        return

    # Removing a line that terminated its block leaves the previous predicate
    # ending in ';', which is not valid Turtle. Repair it.
    drop = {i for _, i, _ in remove}
    out = []
    for i, line in enumerate(lines):
        if i in drop:
            terminator = REQUIRES.match(line).group(1)
            if terminator == "." and out:
                for j in range(len(out) - 1, -1, -1):
                    if out[j].strip():
                        out[j] = re.sub(r'\s*;\s*$', ' .', out[j])
                        break
            continue
        out.append(line)

    open(path, "w", encoding="utf-8").write("\n".join(out))
    print("Removed %d statements from %s" % (len(remove), path))
    print()
    print("Now rebuild and re-measure:")
    print("   python build\\build_kb.py --curriculum %s" % name)
    print("   python build\\diagnose_r1.py")


if __name__ == "__main__":
    main()
