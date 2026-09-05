// The model's rules, expressed over the materialised tables.
//
// Nothing here reasons over RDF. Each function is a lookup or a count against
// the tables build/build_kb.py wrote, which is what lets this run in a
// Cloudflare Worker: a reasoner and a SHACL engine are substantial libraries
// needing a Java or Python runtime, and neither exists at the edge. Section 4.6
// argues that materialising the reasoning at design time costs nothing, and
// build/verify_parity.py is what tests the claim — it judges generated designs
// twice, once by this file and once by pySHACL, and reports every disagreement.
//
// If you change a rule here, change it in model/shapes.ttl too, and expect
// verify_parity.py to tell you if the two have drifted apart.

export const LEVEL_ORDER = [
  'Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate', 'Create'
]

export const REQUIRED_DIMENSIONS = ['Personal', 'Measurement']
export const MINIMUM_DIMENSIONS = 3

function placeholders (n) {
  return new Array(n).fill('?').join(',')
}

function englishList (items) {
  if (items.length === 0) return 'nothing'
  if (items.length === 1) return items[0]
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]
}

async function processLabels (db, ids) {
  if (ids.length === 0) return []
  const rows = await db.all(
    `SELECT label FROM process WHERE id IN (${placeholders(ids.length)}) ORDER BY id`,
    ids)
  return rows.map((r) => r.label)
}

// ---------------------------------------------------------------- R1
/**
 * Rule R1: the level this activity occupies for this learner.
 *
 * Formalises Thompson et al. (2008). The level is a relation between the
 * activity and what the learner has already met, not a property of the
 * activity. Three cases, in the order the rule states them:
 *
 *   R1c Remember  the learner has already completed this same activity
 *   R1b Create    some process the activity requires has not been met
 *   R1a Apply     every required process has been met
 *
 * includeEarned = false restricts the learner's exposure to the declared
 * baseline and ignores completed attempts, which is the state build_kb.py
 * reasoned over. verify_parity.py uses it to compare like with like.
 */
export async function effectiveLevel (db, learnerId, activityId, includeEarned = true) {
  const requiredRows = await db.all(
    `SELECT DISTINCT c.process_id AS process_id
       FROM activity_criterion ac
       JOIN criterion c ON c.id = ac.criterion_id
      WHERE ac.activity_id = ? AND c.process_id IS NOT NULL`,
    [activityId])
  const required = requiredRows.map((r) => r.process_id)

  const metRows = includeEarned
    ? await db.all('SELECT process_id FROM learner_process WHERE learner_id = ?',
      [learnerId])
    : await db.all(
      "SELECT process_id FROM learner_process WHERE learner_id = ? AND source = 'declared'",
      [learnerId])
  const met = new Set(metRows.map((r) => r.process_id))

  let completedIdentical = false
  if (includeEarned) {
    const done = await db.all(
      'SELECT 1 AS hit FROM attempt WHERE learner_id = ? AND activity_id = ? AND correct = 1 LIMIT 1',
      [learnerId, activityId])
    completedIdentical = done.length > 0
  }

  const unmet = required.filter((p) => !met.has(p))

  if (completedIdentical) {
    return {
      level: 'Remember',
      rule: 'R1c',
      basis: 'This learner has already completed this activity correctly. ' +
             'Thompson et al. treat a task already met in the same form as Remember.',
      required,
      unmet
    }
  }

  if (unmet.length > 0) {
    const labels = await processLabels(db, unmet)
    return {
      level: 'Create',
      rule: 'R1b',
      basis: `This learner has not met ${englishList(labels)}, which the activity ` +
             'requires. With no taught procedure to apply, the learner must assemble ' +
             'a solution, which Thompson et al. place at Create.',
      required,
      unmet
    }
  }

  if (required.length > 0) {
    const labels = await processLabels(db, required)
    return {
      level: 'Apply',
      rule: 'R1a',
      basis: `This learner has met ${englishList(labels)}, so the activity asks for ` +
             'a taught procedure to be carried out on a problem not previously solved ' +
             'in this form. Thompson et al. place that at Apply.',
      required,
      unmet: []
    }
  }

  return {
    level: 'Apply',
    rule: 'R1a',
    basis: "No taught procedure is attached to this activity's criteria.",
    required: [],
    unmet: []
  }
}

// ---------------------------------------------------------------- R2, R3, R5
/**
 * R2. No element may be contraindicated at any level the activity occupies.
 * Permissive, as Section 4.4.5 settles it: an element with no stated
 * suitability at a level is allowed, and only contraindication is an error.
 */
export async function checkR2 (db, elementIds, levels) {
  if (elementIds.length === 0 || levels.length === 0) return []
  const rows = await db.all(
    `SELECT el.element_id AS element_id, el.level AS level, e.label AS label
       FROM element_level el
       JOIN element e ON e.id = el.element_id
      WHERE el.verdict = 'contraindicated'
        AND el.element_id IN (${placeholders(elementIds.length)})
        AND el.level IN (${placeholders(levels.length)})
      ORDER BY el.element_id`,
    [...elementIds, ...levels])
  return rows.map((r) => ({
    rule: 'R2',
    element: r.element_id,
    message: `${r.label} is contraindicated at ${r.level}, which this activity occupies.`
  }))
}

/**
 * R3. A design must draw on at least three dimensions, including Personal and
 * Measurement. Derived from the consequences Toda et al. (2019) state for the
 * absence of each dimension.
 */
export async function checkR3 (db, elementIds) {
  const problems = []
  let dims = new Set()
  if (elementIds.length > 0) {
    const rows = await db.all(
      `SELECT DISTINCT dimension_id FROM element WHERE id IN (${placeholders(elementIds.length)})`,
      elementIds)
    dims = new Set(rows.map((r) => r.dimension_id))
  }

  const absenceRows = await db.all('SELECT id, absence_note FROM dimension', [])
  const absence = {}
  absenceRows.forEach((r) => { absence[r.id] = r.absence_note || '' })

  if (dims.size < MINIMUM_DIMENSIONS) {
    problems.push({
      rule: 'R3',
      element: null,
      message: `This design draws on ${dims.size} of the five dimensions. ` +
               `At least ${MINIMUM_DIMENSIONS} are required.`
    })
  }
  for (const required of REQUIRED_DIMENSIONS) {
    if (!dims.has(required)) {
      problems.push({
        rule: 'R3',
        element: null,
        message: `This design includes no ${required} element. ${absence[required] || ''}`.trim()
      })
    }
  }
  return problems
}

/**
 * R5. Where the artefact can be produced by a generative model without the
 * learner doing the cognitive work, reward must not attach to completion.
 */
export async function checkR5 (db, activityId, rewardBasis) {
  const rows = await db.all(
    'SELECT ai_vulnerability FROM activity WHERE id = ?', [activityId])
  if (rows.length === 0) return []
  if (rows[0].ai_vulnerability === 'high' && rewardBasis === 'CompletionReward') {
    return [{
      rule: 'R5',
      element: null,
      message: "This activity's vulnerability to generative assistance is high, so " +
               'reward may not attach to completion. Attach it to the steps taken or ' +
               "to the learner's explanation instead."
    }]
  }
  return []
}

/** The levels the curriculum's own criteria put this activity at. These are
 *  what the SHACL shape for R2 tests against. */
export async function assertedLevels (db, activityId) {
  const rows = await db.all(
    `SELECT DISTINCT c.asserted_level AS level
       FROM activity_criterion ac
       JOIN criterion c ON c.id = ac.criterion_id
      WHERE ac.activity_id = ?`,
    [activityId])
  return rows.map((r) => r.level)
}

function orderLevels (levels) {
  return [...new Set(levels)].sort(
    (a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))
}

/**
 * Every rule at once, against an explicit set of levels. verify_parity.py calls
 * this with the asserted levels alone, because that is what the SHACL shape
 * sees; comparing anything else would not be comparing like with like.
 */
export async function validateAgainst (db, activityId, levels, elementIds, rewardBasis) {
  const ordered = orderLevels(levels)
  const problems = [
    ...await checkR2(db, elementIds, ordered),
    ...await checkR3(db, elementIds),
    ...await checkR5(db, activityId, rewardBasis)
  ]
  return { conforms: problems.length === 0, levelsChecked: ordered, problems }
}

/**
 * What the design console shows: both readings of the level at once. The shape
 * for R2 tests the asserted level; the platform selects on the effective level
 * R1 derived. A design is served only if it satisfies both.
 */
export async function validate (db, activityId, effective, elementIds, rewardBasis) {
  const asserted = await assertedLevels(db, activityId)
  return validateAgainst(db, activityId, [effective, ...asserted], elementIds, rewardBasis)
}
