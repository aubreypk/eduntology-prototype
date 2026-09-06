// One statement of rule R1, two ways of fetching the data for it.
//
//   node api/test/rule-r1-bulk.mjs
//
// The activity list asks rule R1 for every activity at once (rules.effectiveLevels)
// while the activity page asks for one (rules.effectiveLevel). Both call the same
// decision, but they load the data differently, and a difference in loading is
// exactly the kind of thing that produces a platform which contradicts itself
// depending on which page you are looking at. This checks that it does not, on a
// fixture built here rather than on the knowledge base, so that it runs without
// rdflib and without a build.
//
// It is deliberately unkind: learners who have met nothing, learners who have met
// everything, activities requiring no process at all, activities requiring several,
// a learner who has met some but not all of them, and a recorded correct attempt
// that should move an activity to Remember by rule R1c.

import { DatabaseSync } from 'node:sqlite'
import * as rules from '../src/rules.js'

const db = new DatabaseSync(':memory:')

db.exec(`
  CREATE TABLE process (id TEXT PRIMARY KEY, label TEXT);
  CREATE TABLE criterion (id TEXT PRIMARY KEY, code TEXT, process_id TEXT, asserted_level TEXT);
  CREATE TABLE activity (id TEXT PRIMARY KEY);
  CREATE TABLE activity_criterion (activity_id TEXT, criterion_id TEXT);
  CREATE TABLE learner (id TEXT PRIMARY KEY);
  CREATE TABLE learner_process (learner_id TEXT, process_id TEXT, source TEXT);
  CREATE TABLE attempt (learner_id TEXT, activity_id TEXT, correct INTEGER);
`)

const PROCESSES = [
  ['P01', 'variable declaration'],
  ['P02', 'if construction'],
  ['P03', 'while construction'],
  ['P04', 'array indexing']
]
const CRITERIA = [
  ['C1', 'A.1.1', 'P01', 'Apply'],
  ['C2', 'A.1.2', 'P02', 'Apply'],
  ['C3', 'A.2.1', 'P03', 'Apply'],
  ['C4', 'A.3.1', 'P04', 'Apply'],
  // Requires no taught procedure: rule R1d, the asserted level stands.
  ['C5', 'A.4.1', null, 'Understand'],
  // Same, but asserted below what R1 would derive for a procedural criterion
  // in the same activity, so that the "highest wins" reading is exercised.
  ['C6', 'A.4.2', null, 'Remember'],
  // Asserted ABOVE anything R1 can derive from familiarity, so that R1d is
  // seen to raise a level and not merely to fill a gap.
  ['C7', 'A.4.3', null, 'Evaluate']
]
const ACTIVITIES = {
  ACT1: ['C1'],
  ACT2: ['C2'],
  ACT3: ['C2', 'C3'],          // two processes, met at different points
  ACT4: ['C5'],                // no process at all: R1d alone
  ACT5: ['C1', 'C2', 'C3', 'C4'],
  ACT6: ['C1', 'C5'],          // mixed: R1 derives, and Understand stands higher
  ACT7: ['C1', 'C6'],          // mixed: R1 derives above the asserted level
  ACT8: ['C1', 'C7'],          // mixed: the asserted level is the higher
  ACT9: ['C1', 'C7']           // as ACT8, but completed, so R1c fires too
}
const LEARNERS = {
  L0: [],
  L1: ['P01'],
  L2: ['P01', 'P02'],
  L3: ['P01', 'P02', 'P03'],
  L4: ['P01', 'P02', 'P03', 'P04']
}

for (const [id, label] of PROCESSES) {
  db.prepare('INSERT INTO process VALUES (?,?)').run(id, label)
}
for (const [id, code, process, level] of CRITERIA) {
  db.prepare('INSERT INTO criterion VALUES (?,?,?,?)').run(id, code, process, level)
}
for (const [activity, criteria] of Object.entries(ACTIVITIES)) {
  db.prepare('INSERT INTO activity VALUES (?)').run(activity)
  for (const criterion of criteria) {
    db.prepare('INSERT INTO activity_criterion VALUES (?,?)').run(activity, criterion)
  }
}
for (const [learner, met] of Object.entries(LEARNERS)) {
  db.prepare('INSERT INTO learner VALUES (?)').run(learner)
  for (const process of met) {
    db.prepare("INSERT INTO learner_process VALUES (?,?,'declared')").run(learner, process)
  }
}
// L4 has already answered ACT1 correctly: rule R1c should move it to Remember,
// and only for that learner and that activity.
db.prepare('INSERT INTO attempt VALUES (?,?,1)').run('L4', 'ACT1')
db.prepare('INSERT INTO attempt VALUES (?,?,1)').run('L4', 'ACT9')
// A wrong attempt must not count as exposure.
db.prepare('INSERT INTO attempt VALUES (?,?,0)').run('L3', 'ACT2')

const adapter = {
  async all (sql, params = []) { return db.prepare(sql).all(...params) },
  async run (sql, params = []) { return db.prepare(sql).run(...params) }
}

let checks = 0
const failures = []

for (const includeEarned of [true, false]) {
  for (const learner of Object.keys(LEARNERS)) {
    const bulk = await rules.effectiveLevels(adapter, learner, includeEarned)
    for (const activity of Object.keys(ACTIVITIES)) {
      const single = await rules.effectiveLevel(adapter, learner, activity, includeEarned)
      const many = bulk.get(activity)
      checks += 1
      for (const field of ['level', 'rule', 'basis']) {
        if (single[field] !== many[field]) {
          failures.push(
            `${learner}/${activity} includeEarned=${includeEarned}: ${field}\n` +
            `      one:  ${single[field]}\n` +
            `      many: ${many[field]}`)
        }
      }
      if (single.unmet.join(',') !== many.unmet.join(',')) {
        failures.push(`${learner}/${activity}: unmet differs`)
      }
    }
  }
}

// The fixture must actually exercise all three cases, or agreement means nothing.
const seen = new Set()
const bulk = await rules.effectiveLevels(adapter, 'L4')
for (const verdict of bulk.values()) seen.add(verdict.rule)
for (const learner of Object.keys(LEARNERS)) {
  for (const verdict of (await rules.effectiveLevels(adapter, learner)).values()) {
    seen.add(verdict.rule)
  }
}
for (const rule of ['R1a', 'R1b', 'R1c', 'R1d']) {
  if (!seen.has(rule)) failures.push(`the fixture never produced ${rule}`)
}

// R1d in detail, since agreement between two paths says nothing about whether
// either is right.
const taught = await rules.effectiveLevels(adapter, 'L4')
const untaught = await rules.effectiveLevels(adapter, 'L0')
const expectations = [
  [taught, 'ACT4', 'Understand', 'R1d',
   'an activity of only non-procedural criteria takes its asserted level'],
  [untaught, 'ACT4', 'Understand', 'R1d',
   'and takes it whether or not anything has been taught'],
  [taught, 'ACT1', 'Remember', 'R1c',
   'a completed activity is still Remember'],
  [taught, 'ACT6', 'Apply', 'R1a',
   'R1d does not lower a level R1 derived above the asserted one'],
  [untaught, 'ACT6', 'Create', 'R1b',
   'nor lower the Create of an untaught procedure'],
  [taught, 'ACT8', 'Evaluate', 'R1d',
   'R1d raises the level where the criterion is asserted above what R1 derives'],
  [taught, 'ACT9', 'Evaluate', 'R1d',
   'and completing the activity does not erase its hardest part']
]
for (const [source, activity, level, rule, why] of expectations) {
  const got = source.get(activity)
  if (got.level !== level || got.rule !== rule) {
    failures.push(`${activity}: expected ${level} by ${rule} (${why}), got ` +
                  `${got.level} by ${got.rule}`)
  }
}

console.log(`Rule R1: ${checks} comparisons between the single and the bulk path`)
console.log(`Rules exercised: ${[...seen].sort().join(', ')}`)
if (failures.length) {
  console.error('\n' + failures.length + ' disagreement(s):')
  for (const f of failures) console.error('   ' + f)
  process.exit(1)
}
console.log('The two paths agree on every case.')
