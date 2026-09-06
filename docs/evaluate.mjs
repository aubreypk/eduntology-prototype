// Layers 2, 3 and 4 of the evaluation described in Section 3.7.
//
//   node docs/evaluate.mjs --base http://127.0.0.1:8000 [--layer 2|3|4|all]
//
// Setup, once:
//   npm install -D playwright axe-core
//
// No participants and no human evaluator. Layer 2 inspects the built interface
// against published criteria, Layer 3 operationalises the subset of Nielsen's
// heuristics that admits of machine checking and names the subset that does
// not, and Layer 4 drives task scenarios with the six defined learners standing
// in for personas. What each layer can and cannot establish is stated in
// Section 3.7 and is not restated by the tool.
//
// Everything is written to docs/evaluation/: one JSON file per layer, holding
// the result of every check whether it passed or failed, and RESULTS.md
// summarising them. A claim in Chapter 6 should be traceable to a line in one
// of those files.

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

function option (name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const BASE = option('base', 'http://127.0.0.1:8000').replace(/\/$/, '')
const OUT = resolve(ROOT, option('out', 'docs/evaluation'))
const LAYER = option('layer', 'all')
const WANTED = option('browser', null)
const PINNED = option('activity', null)
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

const LEVELS = ['Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate', 'Create']

async function launchBrowser () {
  const candidates = WANTED
    ? [WANTED === 'chromium' ? undefined : WANTED]
    : [undefined, 'chrome', 'msedge', 'chrome-beta', 'msedge-beta']
  const failures = []
  for (const channel of candidates) {
    try {
      const browser = await chromium.launch(channel ? { channel } : {})
      return { browser, used: channel || 'playwright chromium' }
    } catch (error) {
      failures.push(`  ${channel || 'playwright chromium'}: ${error.message.split('\n')[0]}`)
    }
  }
  throw new Error('No Chromium-based browser could be launched.\n' + failures.join('\n'))
}

async function api (path) {
  const response = await fetch(`${BASE}${path}`)
  if (!response.ok) throw new Error(`${path} answered ${response.status}`)
  return response.json()
}

// Where the built interface is, so that a route can be named in a report.
function routes (demo) {
  return [
    { id: 'activities', hash: '#/activities', role: 'student', label: 'the activity list' },
    { id: 'activity', hash: `#/activity/${encodeURIComponent(demo)}`, role: 'student', label: 'an activity' },
    { id: 'curriculum', hash: '#/curriculum', role: 'lecturer', label: 'the curriculum' },
    { id: 'console', hash: '#/console', role: 'lecturer', label: 'the design console' },
    { id: 'model', hash: '#/model', role: 'lecturer', label: 'the model reference' }
  ]
}

async function setRole (page, role) {
  await page.getByRole('button', { name: role === 'student' ? 'Student' : 'Lecturer', exact: true }).click()
  await page.waitForTimeout(150)
}

async function go (page, route) {
  await page.goto(`${BASE}/${route.hash}`)
  await page.waitForSelector('#learner-select')
  await setRole(page, route.role)
  if (!page.url().endsWith(route.hash)) {
    await page.goto(`${BASE}/${route.hash}`)
  }
  await page.waitForTimeout(500)
}

// ===================================================== Layer 2: conformance
async function layer2 (context, demo) {
  const axePath = (() => {
    try {
      return require.resolve('axe-core/axe.min.js')
    } catch (ignored) {
      return null
    }
  })()
  if (!axePath || !existsSync(axePath)) {
    throw new Error(
      'axe-core is not installed. Run  npm install -D axe-core  in the repository\n' +
      'root. It is injected from node_modules rather than fetched from a CDN, so no\n' +
      'network access is needed once it is installed.')
  }

  const results = { tool: 'axe-core', axe: require('axe-core/package.json').version, routes: [] }

  for (const viewport of [{ name: 'desktop', ...DESKTOP }, { name: 'phone', ...PHONE }]) {
    const page = await context.newPage()
    await page.setViewportSize({ width: viewport.width, height: viewport.height })

    const consoleErrors = []
    const failedRequests = []
    page.on('pageerror', (e) => consoleErrors.push(e.message))
    page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`) })

    for (const route of routes(demo)) {
      let transferred = 0
      let requests = 0
      const counting = (response) => {
        requests += 1
        response.body().then((b) => { transferred += b.length }).catch(() => {})
      }
      page.on('response', counting)
      await go(page, route)
      page.off('response', counting)

      await page.addScriptTag({ path: axePath })
      const axeResult = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        return await axe.run(document, {
          resultTypes: ['violations'],
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
        })
      })

      const page_ = await page.evaluate(() => {
        const timing = performance.getEntriesByType('navigation')[0] || {}
        const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
          .map((h) => Number(h.tagName[1]))
        let disordered = 0
        for (let i = 1; i < headings.length; i += 1) {
          if (headings[i] - headings[i - 1] > 1) disordered += 1
        }
        return {
          title: document.title,
          lang: document.documentElement.lang || null,
          viewportMeta: Boolean(document.querySelector('meta[name="viewport"]')),
          landmarks: {
            main: document.querySelectorAll('main').length,
            nav: document.querySelectorAll('nav').length,
            header: document.querySelectorAll('header').length
          },
          headingLevels: headings,
          headingSkips: disordered,
          domNodes: document.querySelectorAll('*').length,
          domContentLoaded: Math.round(timing.domContentLoadedEventEnd || 0),
          loadComplete: Math.round(timing.loadEventEnd || 0)
        }
      })

      // Reflow: WCAG 2.1 asks that content not scroll in two directions at 320
      // CSS pixels. The check is the same at either viewport and is only
      // meaningful at the narrow one.
      const horizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)

      results.routes.push({
        route: route.id,
        label: route.label,
        viewport: viewport.name,
        violations: axeResult.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.length,
          targets: v.nodes.slice(0, 5).map((n) => n.target.join(' '))
        })),
        violationCount: axeResult.violations.length,
        nodeCount: axeResult.violations.reduce((n, v) => n + v.nodes.length, 0),
        horizontalScroll,
        requests,
        transferredBytes: transferred,
        ...page_
      })
      console.log(`  ${viewport.name.padEnd(7)} ${route.id.padEnd(11)} ` +
        `${axeResult.violations.length} violation(s), ${requests} request(s)`)
    }
    results.consoleErrors = consoleErrors
    results.failedRequests = failedRequests
    await page.close()
  }
  return results
}

// ================================================ Layer 3: Nielsen, machined
const HEURISTICS = [
  {
    n: 1,
    name: 'Visibility of system status',
    checkable: true,
    how: 'An answer is submitted and the interface must report the outcome in a ' +
         'region marked aria-live, so that the result is announced and not merely drawn.'
  },
  {
    n: 2,
    name: 'Match between system and the real world',
    checkable: false,
    how: 'Whether the words used are the words a learner would use cannot be ' +
         'established without learners. Ivory and Hearst (2001) name this class of ' +
         'limitation directly.'
  },
  {
    n: 3,
    name: 'User control and freedom',
    checkable: true,
    how: 'Every route below the activity list must offer a way back, and the design ' +
         'console must offer a way to undo a change to the proposed design.'
  },
  {
    n: 4,
    name: 'Consistency and standards',
    checkable: true,
    how: 'The same navigation must appear on every route for a role, and every ' +
         'cognitive level named in the interface must come from the six of the taxonomy.'
  },
  {
    n: 5,
    name: 'Error prevention',
    checkable: true,
    how: 'The control that submits an answer must be unavailable while there is no answer.'
  },
  {
    n: 6,
    name: 'Recognition rather than recall',
    checkable: true,
    how: 'The learner selector must name learners rather than requiring their codes, ' +
         'and the current section must be marked as current.'
  },
  {
    n: 7,
    name: 'Flexibility and efficiency of use',
    checkable: 'partial',
    how: 'Keyboard operability is checkable: every interactive control must be ' +
         'reachable by tabbing. Whether the interface serves an expert faster than a ' +
         'novice is not.'
  },
  {
    n: 8,
    name: 'Aesthetic and minimalist design',
    checkable: false,
    how: 'A count of words or controls is not a judgement of whether a screen carries ' +
         'more than it needs. Measured and reported as description, not as a verdict.'
  },
  {
    n: 9,
    name: 'Help users recognise, diagnose and recover from errors',
    checkable: true,
    how: 'A wrong answer must produce a message that names what was compared, not ' +
         'merely that the answer was wrong.'
  },
  {
    n: 10,
    name: 'Help and documentation',
    checkable: true,
    how: 'Every view must carry text explaining what it shows.'
  }
]

async function layer3 (context, demo) {
  const page = await context.newPage()
  await page.setViewportSize(DESKTOP)
  const checks = []
  const record = (n, passed, detail) => {
    checks.push({ heuristic: n, passed, detail })
    console.log(`  H${String(n).padEnd(2)} ${passed === null ? 'n/a ' : passed ? 'pass' : 'FAIL'}  ${detail}`)
  }

  // H4 first: it needs every route, and the rest reuse the last page state.
  const seen = []
  for (const route of routes(demo)) {
    await go(page, route)
    seen.push({
      route: route.id,
      nav: await page.locator('.masthead-nav a').allTextContents(),
      hasMain: await page.locator('main#main').count(),
      // H10: explanatory prose, not just controls
      prose: (await page.locator('main p').allTextContents()).join(' ').trim().length
    })
  }
  const studentNav = seen.filter((s) => ['activities', 'activity'].includes(s.route))
  const lecturerNav = seen.filter((s) => !['activities', 'activity'].includes(s.route))
  const consistent = (group) =>
    group.length < 2 || group.every((s) => s.nav.join('|') === group[0].nav.join('|'))
  record(4, consistent(studentNav) && consistent(lecturerNav) &&
    seen.every((s) => s.hasMain === 1),
  `navigation identical across ${studentNav.length} student and ${lecturerNav.length} ` +
  'lecturer routes, one main landmark on each')

  record(10, seen.every((s) => s.prose > 80),
    `every view carries explanatory text (shortest ${Math.min(...seen.map((s) => s.prose))} characters)`)

  // H6
  await go(page, routes(demo)[0])
  const learnerOptions = await page.locator('#learner-select option').allTextContents()
  const namesLearners = learnerOptions.every((t) => /\s/.test(t.trim()) && t.trim().length > 6)
  const currentMarked = await page.locator('.masthead-nav a[aria-current="page"]').count()
  record(6, namesLearners && currentMarked === 1,
    `learner options name learners rather than codes; ${currentMarked} section marked current`)

  // H4 (second half) and the level vocabulary
  const badges = await page.locator('.level, .badge, [class*="level"]').allTextContents()
  const named = badges.map((t) => t.trim()).filter(Boolean)
  const strays = named.filter((t) => {
    const word = t.split(/\s+/).pop()
    return /^[A-Z][a-z]+$/.test(word) && !LEVELS.includes(word)
  })
  record(4.1, strays.length === 0,
    `every cognitive level named on screen is one of the six (${strays.length} stray term(s))`)

  // H3
  await go(page, routes(demo)[1])
  const back = await page.getByRole('link', { name: /back/i }).count()
  await go(page, routes(demo)[3])
  const reset = await page.getByRole('button', { name: /reset/i }).count()
  record(3, back > 0 && reset > 0,
    `a way back from an activity (${back}); the console offers a reset (${reset})`)

  // H5, H1, H9 all concern the activity workspace
  await go(page, routes(demo)[1])
  const input = page.locator('#complete-input, #trace-input, #order-input').first()
  const submit = page.getByRole('button', { name: /Submit answer/ })
  if (await input.count() && await submit.count()) {
    await input.fill('')
    await page.waitForTimeout(200)
    record(5, await submit.isDisabled(),
      'the submit control is unavailable while the answer is empty')

    // H9: a wrong answer must say what was compared
    await input.fill('this is certainly not the answer')
    await submit.click()
    await page.waitForSelector('.note-good, .note-bad')
    const wrong = (await page.locator('.note-good, .note-bad').first().innerText()).trim()
    record(9, wrong.length > 40 && !/^\s*(wrong|incorrect)\s*\.?$/i.test(wrong),
      `a wrong answer is explained: "${wrong.slice(0, 70)}..."`)

    // H1: the outcome is announced, not merely drawn
    const live = await page.locator('[aria-live] .note-good, [aria-live] .note-bad').count()
    record(1, live > 0, `the outcome appears inside an aria-live region (${live})`)
  } else {
    record(5, null, 'the demonstration activity takes no free-text answer')
    record(9, null, 'not applicable to this activity kind')
    record(1, null, 'not applicable to this activity kind')
  }

  // H7 partial: keyboard reachability.
  //
  // The obvious version of this check is wrong, and was wrong here: it counted
  // everything matching an interactive selector and compared that with what
  // tabbing reached. But an element inside a closed <details>, or hidden, or
  // carrying tabindex="-1", is not in the tab order and should not be, so the
  // comparison reports a failure where the interface is behaving correctly.
  // What follows marks the elements that are genuinely focusable, walks the tab
  // order, and names anything it did not reach.
  await go(page, routes(demo)[0])
  const expected = await page.evaluate(() => {
    const selector = 'a[href], button:not([disabled]), select, input:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    let n = 0
    for (const el of document.querySelectorAll(selector)) {
      if (el.closest('details:not([open])') && el.tagName !== 'SUMMARY') continue
      if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const box = el.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue
      el.setAttribute('data-tab-probe', String(n))
      n += 1
    }
    return n
  })

  // Walk the tab order in both directions and take the union. Blurring does not
  // reset the sequential focus navigation starting point in Chromium, so a
  // forward-only walk measures where focus happened to be as much as it
  // measures the tab order. Walking back as well removes that from the result;
  // whether a control sits behind the starting point on load is a separate
  // question, and one for the interface rather than for this count.
  const reachedSet = new Set()
  const probe = async () => {
    const found = await page.evaluate(() => {
      const el = document.activeElement
      return el && el.getAttribute ? el.getAttribute('data-tab-probe') : null
    })
    if (found !== null) reachedSet.add(found)
  }
  for (let i = 0; i < expected + 5; i += 1) {
    await page.keyboard.press('Tab')
    await probe()
  }
  for (let i = 0; i < expected + 5; i += 1) {
    await page.keyboard.press('Shift+Tab')
    await probe()
  }
  const missed = await page.evaluate((reached) => {
    const out = []
    for (const el of document.querySelectorAll('[data-tab-probe]')) {
      if (!reached.includes(el.getAttribute('data-tab-probe'))) {
        out.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
          ': ' + (el.textContent || '').trim().slice(0, 30))
      }
    }
    return out
  }, [...reachedSet])

  record(7, missed.length === 0,
    `${reachedSet.size} of ${expected} focusable controls reached by tabbing` +
    (missed.length ? `; missed ${missed.slice(0, 5).join(', ')}` : ''))

  // H8 measured, not judged
  const density = await page.evaluate(() => ({
    words: (document.querySelector('main').innerText.match(/\S+/g) || []).length,
    controls: document.querySelectorAll('main a,main button,main select,main input').length
  }))
  record(8, null,
    `${density.words} words and ${density.controls} controls on the activity list; ` +
    'reported, not judged')

  record(2, null, 'not machine-checkable; requires learners')

  await page.close()
  return { heuristics: HEURISTICS, checks }
}

// ============================================== Layer 4: agent walkthroughs
async function layer4 (context, demo, learners, thompsonCode, demoKind) {
  const page = await context.newPage()
  await page.setViewportSize(DESKTOP)
  const runs = []

  const failures = []
  page.on('pageerror', (e) => failures.push(e.message))
  page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`) })

  async function task (id, persona, description, optimalSteps, body) {
    const before = failures.length
    const started = Date.now()
    let steps = 0
    const step = async (fn) => { steps += 1; await fn() }
    let completed = false
    let detail = ''
    try {
      detail = await body(step)
      completed = true
    } catch (error) {
      detail = error.message.split('\n')[0]
    }
    const run = {
      task: id,
      persona,
      description,
      completed,
      steps,
      optimalSteps,
      pathDeviation: Number((steps / optimalSteps).toFixed(2)),
      milliseconds: Date.now() - started,
      interactionFailures: failures.length - before,
      detail
    }
    runs.push(run)
    console.log(`  ${id.padEnd(3)} ${completed ? 'done' : 'FAILED'}  ` +
      `${steps}/${optimalSteps} steps  ${run.milliseconds} ms  ${detail.slice(0, 60)}`)
  }

  const first = learners[0]
  const last = learners[learners.length - 1]

  await task('T1', first.id,
    'Open the activity for the demonstration criterion and find why it sits where it does',
    3, async (step) => {
      await step(async () => { await page.goto(BASE); await page.waitForSelector('#learner-select') })
      await step(async () => { await page.selectOption('#learner-select', first.id) })
      await step(async () => { await page.goto(`${BASE}/#/activity/${demo}`) })
      const why = await page.locator('#level-heading').innerText()
      if (!/Create|Apply|Remember|Understand/.test(why)) throw new Error('no level shown')
      return why.trim()
    })

  // T2 needs an activity whose answer can be typed. If the demonstration
  // activity is not one, the task is recorded as not attempted rather than
  // silently passed or silently failed.
  if (demoKind !== 'complete' || !authoredAnswer) {
    runs.push({
      task: 'T2', persona: last.id, completed: null, steps: 0, optimalSteps: 5,
      pathDeviation: null, milliseconds: 0, interactionFailures: 0,
      description: 'Answer the same activity correctly and confirm the level moves',
      detail: 'not attempted: the demonstration activity takes no typed answer'
    })
    console.log('  T2  skipped  the demonstration activity takes no typed answer')
  } else await task('T2', last.id,
    'Answer the same activity correctly and confirm the level moves',
    5, async (step) => {
      await step(async () => { await page.goto(BASE); await page.waitForSelector('#learner-select') })
      await step(async () => { await page.selectOption('#learner-select', last.id) })
      await step(async () => { await page.goto(`${BASE}/#/activity/${demo}`) })
      const beforeLevel = (await page.locator('#level-heading').innerText()).trim()
      await step(async () => {
        await page.fill('#complete-input', authoredAnswer)
      })
      await step(async () => {
        await page.getByRole('button', { name: /Submit answer/ }).click()
        await page.waitForSelector('.note-good, .note-bad')
      })
      await page.goto(`${BASE}/#/activity/${demo}`)
      await page.waitForTimeout(400)
      const afterLevel = (await page.locator('#level-heading').innerText()).trim()
      if (beforeLevel === afterLevel) throw new Error(`level did not move from ${beforeLevel}`)
      return `${beforeLevel} then ${afterLevel}`
    })

  await task('T3', 'lecturer',
    'Find a criterion in the curriculum and read its classification',
    4, async (step) => {
      await step(async () => { await page.goto(BASE); await page.waitForSelector('#learner-select') })
      await step(async () => { await setRole(page, 'lecturer') })
      await step(async () => { await page.getByRole('link', { name: 'Curriculum' }).click() })
      // The criterion belongs to one outcome and the outcomes are collapsed.
      // Opening them until it appears is what a person would do, and each one
      // opened is a step: an agent that has to try four outcomes has deviated
      // from the path of someone who knew which to open.
      const summaries = page.locator('details summary')
      const total = await summaries.count()
      for (let i = 0; i < total; i += 1) {
        let found = false
        await step(async () => {
          await summaries.nth(i).click()
          await page.waitForTimeout(120)
          found = (await page.locator('main').innerText()).includes(thompsonCode)
        })
        if (found) break
      }
      const body = await page.locator('main').innerText()
      if (!body.includes(thompsonCode)) throw new Error(`${thompsonCode} not found in the curriculum view`)
      return `${thompsonCode} shown with its classification`
    })

  await task('T4', 'lecturer',
    'Put the combination Zeng et al. report to the console and read the verdict',
    4, async (step) => {
      await step(async () => { await page.goto(BASE); await page.waitForSelector('#learner-select') })
      await step(async () => { await setRole(page, 'lecturer') })
      await step(async () => { await page.getByRole('link', { name: 'Design console' }).click() })
      await step(async () => {
        await page.getByRole('button', { name: /Levels, badges and leaderboards/ }).click()
        await page.waitForTimeout(500)
      })
      const verdict = await page.locator('main').innerText()
      if (!/R3/.test(verdict) || !/R5/.test(verdict)) throw new Error('the rules broken were not named')
      return 'rejected, naming R3 and R5'
    })

  await task('T5', first.id,
    'Confirm that an activity requiring no procedure does not move with instruction',
    4, async (step) => {
      const untaught = await api(`/api/activities?learner=${first.id}`)
      const taught = await api(`/api/activities?learner=${last.id}`)
      const fixed = untaught.filter((a) => {
        const other = taught.find((b) => b.id === a.id)
        return other && other.effectiveLevel === a.effectiveLevel
      })
      if (!fixed.length) throw new Error('no activity held its level across the two learners')
      await step(async () => { await page.goto(BASE); await page.waitForSelector('#learner-select') })
      await step(async () => { await page.selectOption('#learner-select', first.id) })
      await step(async () => { await page.goto(`${BASE}/#/activity/${fixed[0].id}`) })
      const before = (await page.locator('#level-heading').innerText()).trim()
      await step(async () => {
        await page.goto(BASE)
        await page.selectOption('#learner-select', last.id)
        await page.goto(`${BASE}/#/activity/${fixed[0].id}`)
        await page.waitForTimeout(300)
      })
      const after = (await page.locator('#level-heading').innerText()).trim()
      if (before !== after) throw new Error(`moved from ${before} to ${after}`)
      const level = (before.match(/(Remember|Understand|Apply|Analyse|Evaluate|Create)/) || [])[1] || before
      return `${fixed.length} activities hold their level across the two learners; ${fixed[0].id} stays at ${level}`
    })

  await page.close()
  return { runs }
}

// ---------------------------------------------------------------- reporting
let authoredAnswer = ''

async function main () {
  await mkdir(OUT, { recursive: true })
  const meta = await api('/api/meta')
  const learners = await api('/api/learners')
  const catalogue = await api(`/api/activities?learner=${learners[0].id}`)
  const modules = await api('/api/curriculum')

  const thompson = new Set(
    modules.flatMap((m) => m.outcomes.flatMap((o) => o.criteria))
      .filter((c) => c.flag === 'Thompson')
      .map((c) => c.code))
  const demoActivity =
    (PINNED && catalogue.find((a) => a.id === PINNED)) ||
    catalogue.find((a) => a.kind === 'complete' && a.criteria.some((c) => thompson.has(c))) ||
    catalogue.find((a) => a.kind === 'complete') || catalogue[0]
  if (PINNED && demoActivity.id !== PINNED) {
    throw new Error(`No activity ${PINNED} in the catalogue.`)
  }
  const thompsonCode = demoActivity.criteria[0]

  // The model answer is not served by the API, on purpose. Read it from the
  // curriculum the build reported using.
  const { readFile } = await import('node:fs/promises')
  const authored = JSON.parse(await readFile(
    resolve(ROOT, 'curriculum', meta.build.curriculum, 'activities.json'), 'utf-8'))
  authoredAnswer = (authored.activities.find((a) => a.id === demoActivity.id) || {}).answer || ''

  console.log(`Curriculum: ${meta.build.curriculum}`)
  console.log(`Base:       ${BASE}`)
  console.log(`Activity:   ${demoActivity.id} (${demoActivity.criteria.join(', ')})`)

  const { browser, used } = await launchBrowser()
  console.log(`Browser:    ${used}\n`)
  const context = await browser.newContext({
    viewport: DESKTOP, reducedMotion: 'reduce', colorScheme: 'light'
  })

  const report = { generated: new Date().toISOString(), base: BASE, browser: used, build: meta.build }

  try {
    if (LAYER === '2' || LAYER === 'all') {
      console.log('Layer 2: conformance inspection')
      report.layer2 = await layer2(context, demoActivity.id)
      console.log('')
    }
    if (LAYER === '3' || LAYER === 'all') {
      console.log("Layer 3: Nielsen's heuristics, the machine-checkable subset")
      report.layer3 = await layer3(context, demoActivity.id)
      console.log('')
    }
    if (LAYER === '4' || LAYER === 'all') {
      console.log('Layer 4: agent-based walkthrough')
      report.layer4 = await layer4(context, demoActivity.id, learners, thompsonCode, demoActivity.kind)
      console.log('')
    }
  } finally {
    await browser.close()
  }

  await writeFile(resolve(OUT, 'evaluation.json'), JSON.stringify(report, null, 2), 'utf-8')

  const lines = ['# Evaluation, layers 2 to 4', '',
    `Generated ${report.generated} against ${BASE}, in ${used},`,
    `from the ${meta.build.curriculum} curriculum built ${meta.build.built}.`, '']

  if (report.layer2) {
    const total = report.layer2.routes.reduce((n, r) => n + r.violationCount, 0)
    lines.push('## Layer 2: conformance inspection', '',
      `axe-core ${report.layer2.axe}, WCAG 2.0 and 2.1 A and AA rules, ` +
      `${report.layer2.routes.length} route-viewport pairs.`, '',
      `**${total} violation(s) in total.**`, '',
      '| Route | Viewport | Violations | Nodes | Horizontal scroll | Requests | Bytes | DOM nodes |',
      '|---|---|---|---|---|---|---|---|')
    for (const r of report.layer2.routes) {
      lines.push(`| ${r.label} | ${r.viewport} | ${r.violationCount} | ${r.nodeCount} | ` +
        `${r.horizontalScroll ? 'yes' : 'no'} | ${r.requests} | ${r.transferredBytes} | ${r.domNodes} |`)
    }
    const named = report.layer2.routes.flatMap((r) => r.violations.map((v) => `${v.id} (${v.impact})`))
    lines.push('', named.length ? 'Rules violated: ' + [...new Set(named)].join(', ') : 'No rule was violated.', '')
  }

  if (report.layer3) {
    lines.push("## Layer 3: Nielsen's heuristics", '',
      '| # | Heuristic | Machine-checkable | Result |', '|---|---|---|---|')
    for (const h of report.layer3.heuristics) {
      const own = report.layer3.checks.filter((c) => Math.floor(c.heuristic) === h.n)
      const verdict = own.length === 0
        ? '—'
        : own.every((c) => c.passed === null)
          ? 'measured, not judged'
          : own.every((c) => c.passed !== false) ? 'satisfied' : 'not satisfied'
      lines.push(`| ${h.n} | ${h.name} | ${h.checkable === true ? 'yes' : h.checkable === 'partial' ? 'partly' : 'no'} | ${verdict} |`)
    }
    const covered = report.layer3.heuristics.filter((h) => h.checkable === true).length
    lines.push('', `${covered} of the ten heuristics admit of machine checking in full, ` +
      `one in part, and ${report.layer3.heuristics.filter((h) => h.checkable === false).length} not at all. ` +
      'The gap is a property of the method, not of the implementation.', '')
    for (const c of report.layer3.checks) {
      lines.push(`- H${c.heuristic}: ${c.passed === null ? 'reported' : c.passed ? 'pass' : 'FAIL'} — ${c.detail}`)
    }
    lines.push('')
  }

  if (report.layer4) {
    lines.push('## Layer 4: agent-based walkthrough', '',
      '| Task | Persona | Completed | Steps | Optimal | Deviation | ms | Failures |', '|---|---|---|---|---|---|---|---|')
    for (const r of report.layer4.runs) {
      lines.push(`| ${r.task} | ${r.persona} | ${r.completed === null ? 'not attempted' : r.completed ? 'yes' : 'no'} | ${r.steps} | ` +
        `${r.optimalSteps} | ${r.pathDeviation === null ? '—' : r.pathDeviation} | ${r.milliseconds} | ${r.interactionFailures} |`)
    }
    lines.push('')
    for (const r of report.layer4.runs) lines.push(`- **${r.task}** ${r.description}. ${r.detail}`)
    lines.push('')
  }

  await writeFile(resolve(OUT, 'RESULTS.md'), lines.join('\n'), 'utf-8')
  console.log(`Written to ${OUT}`)
  console.log('   evaluation.json   every check, passed or failed')
  console.log('   RESULTS.md        the tables Chapter 6 reports')
  console.log('')
  console.log('The knowledge base now holds recorded attempts. Rebuild before measuring again.')
}

main().catch((error) => {
  console.error('\nFailed:', error.message)
  process.exit(1)
})
