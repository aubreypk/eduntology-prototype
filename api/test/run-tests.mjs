// Tests for the deployed API. Node only, no dependencies.
//
//   node api/test/run-tests.mjs
//
// Runs against a copy of build/kb.db, so nothing here disturbs the database the
// development server is serving. What it checks:
//
//   1. Rule R1 as this code computes it equals the level the SPARQL rule
//      derived at build time and wrote to the context table. (The stronger
//      check, against pySHACL itself, is build/verify_parity.py.)
//   2. Every design the build stored satisfies R2, R3 and R5 under this code.
//   3. The two test designs in the curriculum are judged as the model predicts:
//      the Zeng et al. combination rejected for want of dimensions, the
//      balanced one accepted.
//   4. Marking accepts every model answer and rejects a wrong one.
//   5. Every route answers, and answers with the shape the interface expects.
//   6. A correct attempt records the processes it required, and moves the
//      activity to Remember by rule R1c.

import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { handle } from '../src/app.js'
import { mark } from '../src/marking.js'
import * as rules from '../src/rules.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = resolve(HERE, '../../build/kb.db')
const WORKING = resolve(HERE, 'kb.test.db')

if (!existsSync(SOURCE)) {
  console.error(`No knowledge base at ${SOURCE}`)
  console.error('Build it first:  py build\\build_kb.py')
  process.exit(1)
}

rmSync(WORKING, { force: true })
copyFileSync(SOURCE, WORKING)

const database = new DatabaseSync(WORKING)
const db = {
  async all (sql, params = []) { return database.prepare(sql).all(...params) },
  async run (sql, params = []) {
    const r = database.prepare(sql).run(...params)
    return { lastRowId: r.lastInsertRowid }
  }
}

let passed = 0
const failures = []

function check (name, condition, detail = '') {
  if (condition) {
    passed += 1
  } else {
    failures.push(detail ? `${name}: ${detail}` : name)
  }
}

function section (title) {
  console.log('')
  console.log(title)
  console.log('-'.repeat(title.length))
}

async function call (method, path, body) {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  })
  const response = await handle(request, db)
  let payload = null
  try {
    payload = await response.json()
  } catch (ignored) { /* not JSON */ }
  return { status: response.status, body: payload }
}

// ------------------------------------------------------------------ 1. R1
section('1. Rule R1 against the level materialised at build time')

const contexts = await db.all('SELECT * FROM context ORDER BY id', [])
let r1Mismatch = 0
for (const context of contexts) {
  const live = await rules.effectiveLevel(db, context.learner_id, context.activity_id, false)
  if (live.level !== context.effective_level) {
    r1Mismatch += 1
    if (r1Mismatch <= 5) {
      failures.push(`R1 ${context.id}: table ${context.effective_level}, lookup ${live.level}`)
    }
  }
}
check('R1 parity', r1Mismatch === 0, `${r1Mismatch} of ${contexts.length} disagree`)
console.log(`   ${contexts.length} contexts compared, ${r1Mismatch} disagreement(s)`)

// ------------------------------------------------------------------ 2. designs
section('2. Every stored design satisfies R2, R3 and R5')

const designs = await db.all('SELECT * FROM design ORDER BY id', [])
let rejected = 0
for (const design of designs) {
  const elements = (await db.all(
    'SELECT element_id FROM design_element WHERE design_id = ?', [design.id]))
    .map((r) => r.element_id)
  const verdict = await rules.validate(db, design.activity_id, design.level,
    elements, design.reward_basis)
  if (!verdict.conforms) {
    rejected += 1
    if (rejected <= 5) {
      failures.push(`design ${design.id}: ${verdict.problems.map((p) => p.message).join(' / ')}`)
    }
  }
}
check('stored designs conform', rejected === 0, `${rejected} of ${designs.length} rejected`)
console.log(`   ${designs.length} designs checked, ${rejected} rejected`)

// ------------------------------------------------------------------ 3. the two test designs
section('3. The curriculum’s own test designs')

const anyActivity = (await db.all('SELECT id FROM activity ORDER BY id LIMIT 1', []))[0].id

const zeng = await rules.validate(db, anyActivity, 'Apply',
  ['Level', 'Acknowledgement', 'Competition'], 'CompletionReward')
check('Zeng combination rejected', !zeng.conforms)
check('Zeng rejection cites R3', zeng.problems.some((p) => p.rule === 'R3'),
  zeng.problems.map((p) => p.rule).join(',') || 'no problems')
console.log(`   levels, badges and leaderboards: conforms=${zeng.conforms}`)
zeng.problems.forEach((p) => console.log(`      ${p.rule} ${p.message.slice(0, 92)}`))

const balanced = await rules.validate(db, anyActivity, 'Apply',
  ['Point', 'Progression', 'Objective', 'Puzzle', 'Narrative'], 'ExplanationReward')
check('balanced design accepted', balanced.conforms,
  balanced.problems.map((p) => p.message).join(' / '))
console.log(`   a balanced design:              conforms=${balanced.conforms}`)

const empty = await rules.validate(db, anyActivity, 'Apply', [], 'CompletionReward')
check('empty design rejected', !empty.conforms)
console.log(`   no elements at all:             conforms=${empty.conforms}`)

// ------------------------------------------------------------------ 4. marking
section('4. Marking')

const activities = await db.all('SELECT * FROM activity ORDER BY id', [])
let markFail = 0
for (const activity of activities) {
  const good = mark(activity, activity.answer)
  if (!good.correct) {
    markFail += 1
    failures.push(`marking rejected its own model answer for ${activity.id}`)
  }
  const bad = mark(activity, '§ definitely not the answer §')
  if (bad.correct) {
    markFail += 1
    failures.push(`marking accepted nonsense for ${activity.id}`)
  }
}
check('marking', markFail === 0, `${markFail} problem(s)`)
console.log(`   ${activities.length} model answers accepted, ${activities.length} wrong answers rejected`)

const traceActivity = activities.find((a) => a.kind === 'trace')
if (traceActivity) {
  check('trace marking tolerates trailing whitespace',
    mark(traceActivity, traceActivity.answer.split('\n').map((l) => l + '   ').join('\n')).correct)
}
const completeActivity = activities.find((a) => a.kind === 'complete')
if (completeActivity) {
  check('complete marking ignores layout',
    mark(completeActivity, completeActivity.answer.replace(/ /g, '')).correct)
}

// ------------------------------------------------------------------ 5. routes
section('5. Routes')

const learners = (await db.all('SELECT id FROM learner ORDER BY id', [])).map((r) => r.id)
const someLearner = learners[learners.length - 1]

const meta = await call('GET', '/api/meta')
check('GET /api/meta', meta.status === 200 && meta.body.reasoningAtRunTime === false)

const learnerList = await call('GET', '/api/learners')
check('GET /api/learners', learnerList.status === 200 && learnerList.body.length === learners.length)

const curriculum = await call('GET', '/api/curriculum')
check('GET /api/curriculum', curriculum.status === 200 && curriculum.body.length > 0
  && curriculum.body[0].outcomes.length > 0
  && curriculum.body[0].outcomes[0].criteria.length > 0)

const elementList = await call('GET', '/api/elements')
check('GET /api/elements returns 21', elementList.status === 200 && elementList.body.length === 21,
  `got ${elementList.body ? elementList.body.length : 'nothing'}`)

const trace = await call('GET', '/api/traceability')
check('GET /api/traceability', trace.status === 200 && Array.isArray(trace.body))

const list = await call('GET', `/api/activities?learner=${someLearner}`)
check('GET /api/activities', list.status === 200 && list.body.length === activities.length)
check('activity list carries a level and a rule',
  list.body.every((a) => a.effectiveLevel && /^R1[abc]$/.test(a.rule)))

const first = list.body[0]
const detail = await call('GET', `/api/activities/${first.id}?learner=${someLearner}`)
check('GET /api/activities/:id', detail.status === 200 && detail.body.id === first.id)
check('activity detail carries a design with reasons',
  Boolean(detail.body.design) && detail.body.design.elements.every((e) => e.reason))
check('activity detail quotes its criteria', detail.body.criteria.length > 0
  && detail.body.criteria.every((c) => c.text))

const progress = await call('GET', `/api/progress?learner=${someLearner}`)
check('GET /api/progress', progress.status === 200 && typeof progress.body.points === 'number')

const design = await call('GET', `/api/designs/${first.id}?level=Apply`)
check('GET /api/designs/:id', design.status === 200 && design.body.elements.length > 0)

const validated = await call('POST', '/api/designs/validate', {
  activity: first.id, level: 'Apply', elements: [], rewardBasis: 'CompletionReward'
})
check('POST /api/designs/validate', validated.status === 200 && validated.body.conforms === false)

check('unknown learner is a 404',
  (await call('GET', '/api/activities?learner=NOPE')).status === 404)
check('unknown activity is a 404',
  (await call('GET', `/api/activities/NOPE?learner=${someLearner}`)).status === 404)
check('unknown endpoint is a 404', (await call('GET', '/api/nothing')).status === 404)
check('wrong method is a 405', (await call('GET', '/api/attempts')).status === 405)

console.log(`   ${passed} checks so far`)

// ------------------------------------------------------------------ 6. an attempt
section('6. Submitting an attempt')

// A learner who has met everything, and an activity requiring a process.
const candidate = activities.find((a) => a.answer && a.kind !== 'order')
const beforeDetail = await call('GET', `/api/activities/${candidate.id}?learner=${someLearner}`)
const levelBefore = beforeDetail.body.context.level

const wrong = await call('POST', '/api/attempts', {
  learner: someLearner, activity: candidate.id, submitted: 'not the answer at all'
})
check('a wrong attempt is marked wrong', wrong.status === 200 && wrong.body.correct === false)
check('a wrong attempt earns nothing', wrong.body.points === 0)

const right = await call('POST', '/api/attempts', {
  learner: someLearner, activity: candidate.id, submitted: candidate.answer
})
check('a correct attempt is marked correct', right.status === 200 && right.body.correct === true)
check('a correct attempt returns the explanation', Boolean(right.body.explanation))
check('rule R5 governs the reward',
  candidate.ai_vulnerability !== 'high' || right.body.rewardBasis !== 'CompletionReward',
  `${candidate.ai_vulnerability} activity rewarded ${right.body.rewardBasis}`)

const afterDetail = await call('GET', `/api/activities/${candidate.id}?learner=${someLearner}`)
check('R1c moves a completed activity to Remember',
  afterDetail.body.context.level === 'Remember' && afterDetail.body.context.rule === 'R1c',
  `${levelBefore} -> ${afterDetail.body.context.level} (${afterDetail.body.context.rule})`)
check('the design served changes with the level',
  afterDetail.body.design.level === 'Remember',
  `served ${afterDetail.body.design ? afterDetail.body.design.level : 'none'}`)

console.log(`   ${candidate.id} for ${someLearner}: ${levelBefore} -> ${afterDetail.body.context.level}`)
console.log(`   reward basis ${right.body.rewardBasis}, ${right.body.points} points`)
console.log(`   processes recorded: ${right.body.processesEarned.join(', ') || 'none'}`)

// ------------------------------------------------------------------ verdict
database.close()
rmSync(WORKING, { force: true })

console.log('')
if (failures.length === 0) {
  console.log(`All ${passed} checks passed.`)
  process.exit(0)
}
console.log(`${passed} passed, ${failures.length} FAILED:`)
failures.forEach((f) => console.log(`  - ${f}`))
process.exit(1)
