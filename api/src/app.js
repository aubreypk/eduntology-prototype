// The platform's API, as one request handler.
//
// Everything served here was concluded at build time by build/build_kb.py. This
// code holds no reasoner and no SHACL engine; it reads the materialised tables
// and applies the same rules as lookups (src/rules.js). Section 4.6 gives the
// reason: the libraries are heavy, they do not run at the edge, and the
// conclusions do not change while a learner is working.
//
// The handler takes a small database interface rather than D1 directly, so the
// same code runs in a Worker over D1 and on a laptop over node:sqlite. The
// adapters are in worker.js and dev-server.mjs.
//
//   db.all(sql, params) -> Promise<Array<Object>>
//   db.run(sql, params) -> Promise<{ lastRowId }>

import { mark } from './marking.js'
import * as rules from './rules.js'

const POINTS = {
  CompletionReward: 10,
  ProcessReward: 15,
  ExplanationReward: 20
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
}

function json (body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra }
  })
}

function fail (status, detail) {
  return json({ detail }, status)
}

function corsHeaders (request) {
  const origin = request.headers.get('origin') || ''
  // The development interface runs on 5173; a deployed one is served from the
  // same origin and needs nothing. Anything else is refused rather than
  // wildcarded, so that the deployed API is not an open endpoint.
  const allowed = /^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin)
  return allowed
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
        vary: 'origin'
      }
    : {}
}

// ------------------------------------------------------------------ helpers
async function one (db, sql, params) {
  const rows = await db.all(sql, params)
  return rows.length ? rows[0] : null
}

function parseJsonColumn (value, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  try {
    return JSON.parse(value)
  } catch (ignored) {
    return fallback
  }
}

async function designFor (db, activityId, level) {
  const design = await one(db,
    'SELECT * FROM design WHERE activity_id = ? AND level = ?', [activityId, level])
  if (!design) return null

  const elements = await db.all(
    `SELECT de.element_id, de.reason, e.label, e.dimension_id
       FROM design_element de
       JOIN element e ON e.id = de.element_id
      WHERE de.design_id = ?
      ORDER BY e.dimension_id, e.id`,
    [design.id])
  const buildTimeViolations = await db.all(
    'SELECT rule, message FROM validation WHERE design_id = ?', [design.id])

  return { ...design, elements, buildTimeViolations }
}

// ------------------------------------------------------------------ routes
const ROUTES = []

function route (method, pattern, handler) {
  // Patterns use :name for a single path segment.
  const names = []
  const source = '^' + pattern.replace(/:([A-Za-z_]+)/g, (_m, name) => {
    names.push(name)
    return '([^/]+)'
  }) + '$'
  ROUTES.push({ method, regex: new RegExp(source), names, handler })
}

route('GET', '/api/meta', async ({ db }) => {
  const rows = await db.all('SELECT key, value FROM build_meta', [])
  const build = {}
  rows.forEach((r) => { build[r.key] = r.value })
  return json({ build, reasoningAtRunTime: false })
})

route('GET', '/api/learners', async ({ db }) => {
  const learners = await db.all('SELECT * FROM learner ORDER BY id', [])
  const out = []
  for (const learner of learners) {
    const declared = await db.all(
      "SELECT process_id FROM learner_process WHERE learner_id = ? AND source = 'declared' ORDER BY process_id",
      [learner.id])
    const earned = await db.all(
      "SELECT process_id FROM learner_process WHERE learner_id = ? AND source = 'earned' ORDER BY process_id",
      [learner.id])
    out.push({
      ...learner,
      declared: declared.map((r) => r.process_id),
      earned: earned.map((r) => r.process_id)
    })
  }
  return json(out)
})

route('GET', '/api/curriculum', async ({ db }) => {
  const modules = await db.all('SELECT * FROM module ORDER BY id', [])
  for (const module of modules) {
    module.outcomes = await db.all(
      'SELECT * FROM outcome WHERE module_id = ? ORDER BY sort_key', [module.id])
    for (const outcome of module.outcomes) {
      outcome.criteria = await db.all(
        `SELECT c.*, p.label AS process_label
           FROM criterion c
           LEFT JOIN process p ON p.id = c.process_id
          WHERE c.outcome_id = ? ORDER BY c.id`,
        [outcome.id])
    }
  }
  return json(modules)
})

route('GET', '/api/elements', async ({ db }) => {
  const dimensions = {}
  for (const d of await db.all('SELECT * FROM dimension', [])) dimensions[d.id] = d

  const elements = await db.all(
    'SELECT * FROM element ORDER BY dimension_id, id', [])
  const out = []
  for (const element of elements) {
    const verdicts = {}
    for (const row of await db.all(
      'SELECT level, verdict FROM element_level WHERE element_id = ?', [element.id])) {
      verdicts[row.level] = row.verdict
    }
    out.push({ ...element, dimension: dimensions[element.dimension_id], levels: verdicts })
  }
  return json(out)
})

route('GET', '/api/traceability', async ({ db }) =>
  json(await db.all('SELECT * FROM traceability', [])))

route('GET', '/api/activities', async ({ db, url }) => {
  const learner = url.searchParams.get('learner')
  if (!learner) return fail(400, 'A learner is required: /api/activities?learner=...')
  if (!await one(db, 'SELECT 1 AS hit FROM learner WHERE id = ?', [learner])) {
    return fail(404, `No such learner: ${learner}`)
  }

  // Everything this route needs, in a fixed number of queries rather than a
  // number that grows with the corpus. The first version asked per activity,
  // which is invisible over a database in the same process and is the slowest
  // path in the platform over one reached across a network.
  const activities = await db.all('SELECT * FROM activity ORDER BY id', [])
  const levels = await rules.effectiveLevels(db, learner)

  const contexts = new Map()
  for (const row of await db.all(
    'SELECT activity_id, effective_level FROM context WHERE learner_id = ?', [learner])) {
    contexts.set(row.activity_id, row.effective_level)
  }

  const attempts = new Map()
  for (const row of await db.all(
    `SELECT activity_id, COUNT(*) AS n, MAX(correct) AS best FROM attempt
      WHERE learner_id = ? GROUP BY activity_id`, [learner])) {
    attempts.set(row.activity_id, row)
  }

  const codes = new Map()
  const outcomes = new Map()
  for (const row of await db.all(
    `SELECT ac.activity_id, c.code, o.id AS outcome_id, o.label AS outcome_label,
            o.module_id, o.sort_key
       FROM activity_criterion ac
       JOIN criterion c ON c.id = ac.criterion_id
       JOIN outcome o ON o.id = c.outcome_id
      ORDER BY ac.activity_id, c.code`, [])) {
    if (!codes.has(row.activity_id)) codes.set(row.activity_id, [])
    codes.get(row.activity_id).push(row.code)
    // The outcome the activity sits under, so that the interface can group by
    // it. No activity in either curriculum spans two outcomes; where one did,
    // the first by criterion code is taken and the grouping shows it once.
    if (!outcomes.has(row.activity_id)) {
      outcomes.set(row.activity_id, {
        id: row.outcome_id,
        label: row.outcome_label,
        module_id: row.module_id,
        sort_key: row.sort_key
      })
    }
  }

  return json(activities.map((activity) => {
    const live = levels.get(activity.id)
    const done = attempts.get(activity.id)
    return {
      id: activity.id,
      label: activity.label,
      kind: activity.kind,
      language: activity.language,
      aiVulnerability: activity.ai_vulnerability,
      criteria: codes.get(activity.id) || [],
      outcome: outcomes.get(activity.id) || null,
      materialisedLevel: contexts.has(activity.id) ? contexts.get(activity.id) : null,
      effectiveLevel: live.level,
      rule: live.rule,
      attempts: done ? done.n : 0,
      solved: Boolean(done && done.best)
    }
  }))
})

route('GET', '/api/activities/:id', async ({ db, url, params }) => {
  const learner = url.searchParams.get('learner')
  if (!learner) return fail(400, 'A learner is required: ?learner=...')

  const activity = await one(db, 'SELECT * FROM activity WHERE id = ?', [params.id])
  if (!activity) return fail(404, `No such activity: ${params.id}`)
  if (!await one(db, 'SELECT 1 AS hit FROM learner WHERE id = ?', [learner])) {
    return fail(404, `No such learner: ${learner}`)
  }

  const live = await rules.effectiveLevel(db, learner, params.id)
  const context = await one(db,
    'SELECT * FROM context WHERE learner_id = ? AND activity_id = ?', [learner, params.id])
  const design = await designFor(db, params.id, live.level)
    || (context ? await designFor(db, params.id, context.effective_level) : null)

  const criteria = await db.all(
    `SELECT c.code, c.text, c.asserted_level, c.flag, p.label AS process_label
       FROM activity_criterion ac
       JOIN criterion c ON c.id = ac.criterion_id
       LEFT JOIN process p ON p.id = c.process_id
      WHERE ac.activity_id = ? ORDER BY c.code`,
    [params.id])

  const attempts = await db.all(
    `SELECT correct, submitted, created_at FROM attempt
      WHERE learner_id = ? AND activity_id = ? ORDER BY id DESC LIMIT 5`,
    [learner, params.id])

  return json({
    id: activity.id,
    label: activity.label,
    kind: activity.kind,
    language: activity.language,
    aiVulnerability: activity.ai_vulnerability,
    prompt: activity.prompt,
    code: activity.code,
    codeBefore: activity.code_before,
    codeAfter: activity.code_after,
    options: parseJsonColumn(activity.options_json, null),
    criteria,
    context: {
      materialisedLevel: context ? context.effective_level : null,
      levelsDerivedAtBuild: context ? context.all_levels : null,
      ...live
    },
    design,
    attempts
  })
})

route('POST', '/api/attempts', async ({ db, body }) => {
  const { learner, activity: activityId, submitted = '' } = body || {}
  if (!learner || !activityId) {
    return fail(400, 'learner and activity are both required')
  }

  const activity = await one(db, 'SELECT * FROM activity WHERE id = ?', [activityId])
  if (!activity) return fail(404, `No such activity: ${activityId}`)
  if (!await one(db, 'SELECT 1 AS hit FROM learner WHERE id = ?', [learner])) {
    return fail(404, `No such learner: ${learner}`)
  }

  const before = await rules.effectiveLevel(db, learner, activityId)
  const { correct, feedback } = mark(activity, submitted)

  const design = await designFor(db, activityId, before.level)
  const basis = design ? design.reward_basis : 'CompletionReward'

  // Rule R5 in force at the moment of reward, not only at design time.
  const r5 = await rules.checkR5(db, activityId, basis)
  const rewardGiven = correct && r5.length === 0
  const points = rewardGiven ? (POINTS[basis] || 10) : 0

  await db.run(
    `INSERT INTO attempt (learner_id, activity_id, submitted, correct,
                          reward_basis, reward_given, points, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [learner, activityId, submitted, correct ? 1 : 0, basis,
      rewardGiven ? 1 : 0, points, new Date().toISOString()])

  const earned = []
  if (correct) {
    const required = await db.all(
      `SELECT DISTINCT c.process_id AS process_id
         FROM activity_criterion ac
         JOIN criterion c ON c.id = ac.criterion_id
        WHERE ac.activity_id = ? AND c.process_id IS NOT NULL`,
      [activityId])
    for (const row of required) {
      await db.run(
        "INSERT OR IGNORE INTO learner_process VALUES (?,?,'earned')",
        [learner, row.process_id])
      earned.push(row.process_id)
    }
  }

  const after = await rules.effectiveLevel(db, learner, activityId)

  return json({
    correct,
    feedback,
    explanation: activity.explanation,
    rewardBasis: basis,
    rewardGiven,
    points,
    processesEarned: earned,
    levelBefore: before.level,
    levelAfter: after.level,
    levelChanged: before.level !== after.level
  })
})

route('GET', '/api/progress', async ({ db, url }) => {
  const learner = url.searchParams.get('learner')
  if (!learner) return fail(400, 'A learner is required: ?learner=...')

  const row = await one(db,
    `SELECT COUNT(*) AS attempts,
            COALESCE(SUM(points), 0) AS points,
            COUNT(DISTINCT CASE WHEN correct = 1 THEN activity_id END) AS solved
       FROM attempt WHERE learner_id = ?`,
    [learner])
  const total = await one(db, 'SELECT COUNT(*) AS n FROM activity', [])
  const spread = await db.all(
    `SELECT effective_level, COUNT(*) AS n FROM context
      WHERE learner_id = ? GROUP BY effective_level`,
    [learner])

  return json({ ...row, activities: total.n, levelSpread: spread })
})

route('GET', '/api/designs/:id', async ({ db, url, params }) => {
  const level = url.searchParams.get('level') || 'Apply'
  const design = await designFor(db, params.id, level)
  if (!design) return fail(404, `No design for ${params.id} at ${level}`)
  return json(design)
})

route('POST', '/api/designs/validate', async ({ db, body }) => {
  const {
    activity: activityId,
    level = 'Apply',
    elements = [],
    rewardBasis = 'CompletionReward'
  } = body || {}

  if (!activityId) return fail(400, 'activity is required')
  if (!await one(db, 'SELECT 1 AS hit FROM activity WHERE id = ?', [activityId])) {
    return fail(404, `No such activity: ${activityId}`)
  }

  const result = await rules.validate(db, activityId, level, elements, rewardBasis)
  result.dimensions = elements.length
    ? await db.all(
      `SELECT DISTINCT dimension_id FROM element WHERE id IN (${elements.map(() => '?').join(',')})`,
      elements)
    : []
  return json(result)
})

// ------------------------------------------------------------------ entry
export async function handle (request, db) {
  const cors = corsHeaders(request)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  const url = new URL(request.url)

  // Match on path first and method second. Doing it the other way round makes
  // /api/designs/validate collide with /api/designs/:id, which matches the path
  // but not the method, and answers 405 to a request that has a handler.
  const pathMatches = []
  for (const candidate of ROUTES) {
    const match = candidate.regex.exec(url.pathname)
    if (match) pathMatches.push({ candidate, match })
  }

  if (pathMatches.length === 0) {
    return json({ detail: `No such endpoint: ${url.pathname}` }, 404, cors)
  }

  const chosen = pathMatches.find(({ candidate }) => candidate.method === request.method)
  if (!chosen) {
    const allow = [...new Set(pathMatches.map(({ candidate }) => candidate.method))].join(', ')
    return json({ detail: `${request.method} is not allowed here. Allowed: ${allow}` },
      405, { ...cors, allow })
  }

  {
    const { candidate, match } = chosen

    const params = {}
    candidate.names.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1])
    })

    let body = null
    if (request.method === 'POST') {
      try {
        body = await request.json()
      } catch (ignored) {
        return json({ detail: 'The request body is not valid JSON.' }, 400, cors)
      }
    }

    try {
      const response = await candidate.handler({ db, url, params, body, request })
      const headers = new Headers(response.headers)
      Object.entries(cors).forEach(([k, v]) => headers.set(k, v))
      return new Response(response.body, { status: response.status, headers })
    } catch (error) {
      // A missing table almost always means the knowledge base has not been
      // built or seeded, which is worth saying plainly rather than as a 500.
      const message = String(error && error.message ? error.message : error)
      if (/no such table/i.test(message)) {
        return json({
          detail: 'The knowledge base is empty. Run: py build\\build_kb.py, then ' +
                  'seed D1 with build\\d1-seed.sql.'
        }, 503, cors)
      }
      return json({ detail: message }, 500, cors)
    }
  }
}

export { ROUTES }
