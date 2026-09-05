// Judge a batch of cases with the deployed rule code, for build/verify_parity.py.
//
//   node api/test/verdicts.mjs <path to kb.db> < cases.json > verdicts.json
//
// This exists so that the parity check compares pySHACL against the JavaScript
// that actually runs at the edge, rather than against a second Python copy of
// the rules kept alongside it. There is one implementation of the rules for the
// running platform, and this is how it is put on trial.
//
// Input:  { "r1": [ {learner, activity}, ... ],
//           "designs": [ {activity, levels: [...], elements: [...], rewardBasis}, ... ] }
// Output: { "r1": [ {learner, activity, level, rule}, ... ],
//           "designs": [ {conforms, levelsChecked, problems: [...] }, ... ] }

import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

import * as rules from '../src/rules.js'

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('usage: node api/test/verdicts.mjs <kb.db>  (cases on stdin)')
  process.exit(2)
}

const database = new DatabaseSync(dbPath, { readOnly: true })
const db = {
  async all (sql, params = []) { return database.prepare(sql).all(...params) },
  async run () { throw new Error('verdicts.mjs is read-only') }
}

const cases = JSON.parse(readFileSync(0, 'utf-8'))
const out = { r1: [], designs: [] }

for (const item of cases.r1 || []) {
  // includeEarned = false: the state build_kb.py reasoned over.
  const verdict = await rules.effectiveLevel(db, item.learner, item.activity, false)
  out.r1.push({
    learner: item.learner,
    activity: item.activity,
    level: verdict.level,
    rule: verdict.rule
  })
}

for (const item of cases.designs || []) {
  const verdict = await rules.validateAgainst(
    db, item.activity, item.levels, item.elements, item.rewardBasis)
  out.designs.push({
    conforms: verdict.conforms,
    levelsChecked: verdict.levelsChecked,
    problems: verdict.problems.map((p) => ({ rule: p.rule, message: p.message }))
  })
}

database.close()
process.stdout.write(JSON.stringify(out))
