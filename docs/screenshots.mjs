// Take the figures Chapter 5 needs, the same way every time.
//
//   node docs/screenshots.mjs [--base http://127.0.0.1:8000] [--out docs/screenshots]
//
// Doing this by hand means a chapter whose figures were captured on different
// days at different window sizes with different data behind them. This drives
// the real interface through the real API and writes numbered PNGs, so a figure
// can be regenerated after any change rather than re-staged.
//
// It is also the groundwork for Chapter 6. Layer 2 audits this interface for
// accessibility and performance and Layer 4 walks tasks through it; both need
// exactly this — a browser driving the built application without a person.
//
// Setup, once:
//     npm install -D playwright
//     npx playwright install chromium     <- optional, see below
//
// If that download is blocked or times out — university networks often block
// cdn.playwright.dev — skip it. The script falls back to the Chromium-based
// browser already on the machine, which on Windows is always Edge. Nothing is
// downloaded and the figures are identical, because Edge and Chrome and
// Playwright's Chromium are the same engine. Force a particular one with
// --browser msedge | chrome | chromium.
//
// Before running:
//   * Rebuild the knowledge base.  The script submits a correct answer, which
//     is recorded, so a second run would start from a solved activity and the
//     "before" figures would be wrong.  build_kb.py recreates the database.
//   * Serve the BUILT interface, not the dev server.  The dev server injects
//     tooling that is not present in use, and Chapter 6 audits the same build.
//         cd web && npm run build
//         cd ../api && npx wrangler dev          (or: node dev-server.mjs, with
//                                                 web/dist served alongside)

import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

function option (name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const BASE = option('base', 'http://127.0.0.1:8000').replace(/\/$/, '')
const OUT = resolve(ROOT, option('out', 'docs/screenshots'))
const WANTED = option('browser', null)
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

const shots = []

// Playwright's own Chromium first, then the browsers Windows already has.
// Which one was used is recorded in FIGURES.md: the figures should be
// reproducible, and "a Chromium browser" is not a reproducible statement.
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
  throw new Error(
    'No Chromium-based browser could be launched.\n' + failures.join('\n') +
    '\n\nEither run  npx playwright install chromium  on a network that allows\n' +
    'cdn.playwright.dev, or install Edge or Chrome. On Windows, Edge is present\n' +
    'by default and needs no download; try  --browser msedge.')
}

async function api (path) {
  const response = await fetch(`${BASE}${path}`)
  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}. Is the API running at ${BASE}?`)
  }
  return response.json()
}

async function shot (page, name, caption) {
  const file = `${String(shots.length + 1).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: resolve(OUT, file), fullPage: true })
  shots.push({ file, caption })
  console.log(`  ${file}`)
}

// The interface keeps the role and the learner in localStorage, but everything
// here goes through the controls a person would use. A figure captured by
// driving the visible interface is a figure of the interface.
async function setRole (page, role) {
  await page.getByRole('button', { name: role === 'student' ? 'Student' : 'Lecturer', exact: true })
    .click()
  await page.waitForTimeout(150)
}

async function setLearner (page, id) {
  await page.selectOption('#learner-select', id)
  await page.waitForTimeout(350)
}

async function openActivity (page, activityId) {
  await page.goto(`${BASE}/#/activity/${encodeURIComponent(activityId)}`)
  await page.getByRole('heading', { level: 2 }).first().waitFor()
  await page.waitForTimeout(350)
}

async function main () {
  await mkdir(OUT, { recursive: true })

  const meta = await api('/api/meta')
  const curriculum = meta.build.curriculum
  const learners = await api('/api/learners')
  console.log(`Curriculum: ${curriculum}`)
  console.log(`Learners:   ${learners.map((l) => l.id).join(', ')}`)
  console.log(`Base:       ${BASE}`)
  console.log(`Writing to  ${OUT}`)

  // The demonstration turns on a criterion whose level depends on teaching.
  // Find it rather than hard-coding an id, so the script works whichever
  // curriculum is loaded.
  const modules = await api('/api/curriculum')
  const thompson = new Set(
    modules.flatMap((m) => m.outcomes.flatMap((o) => o.criteria))
      .filter((c) => c.flag === 'Thompson')
      .map((c) => c.code))

  const first = learners[0]
  const last = learners[learners.length - 1]
  const catalogue = await api(`/api/activities?learner=${first.id}`)

  const demo =
    catalogue.find((a) => a.kind === 'complete' && a.criteria.some((c) => thompson.has(c))) ||
    catalogue.find((a) => a.kind === 'complete') ||
    catalogue[0]

  if (!demo) throw new Error('No activities in the knowledge base. Run build_kb.py.')
  console.log(`Demonstration activity: ${demo.id} (${demo.criteria.join(', ')})`)

  // The answer is not exposed by the API, on purpose. It is read from the
  // curriculum the build reported using.
  const content = JSON.parse(
    await readFile(resolve(ROOT, 'curriculum', curriculum, 'activities.json'), 'utf-8'))
  const authored = content.activities.find((a) => a.id === demo.id)

  const { browser, used } = await launchBrowser()
  console.log(`Browser:    ${used}`)
  const context = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 2,          // legible when printed at half width
    reducedMotion: 'reduce',       // no half-finished transitions in a figure
    colorScheme: 'dark'
  })
  const page = await context.newPage()

  page.on('pageerror', (e) => console.error('  page error:', e.message))

  await page.goto(BASE)
  await page.waitForSelector('#learner-select')

  // ---------------------------------------------------------------- student
  console.log('\nStudent view')
  await setRole(page, 'student')

  await setLearner(page, first.id)
  await shot(page, 'student-list-untaught',
    `The activity list for ${first.id}, ${first.label}. Nothing has been taught, so rule R1 places every activity at Create.`)

  await setLearner(page, last.id)
  await shot(page, 'student-list-taught',
    `The same activities for ${last.id}, ${last.label}. Every one is now at Apply. The activities did not change.`)

  await setLearner(page, first.id)
  await openActivity(page, demo.id)
  await shot(page, 'activity-create',
    `Activity ${demo.id} for ${first.id}: the level, and the model's reason for it. The required procedure has not been taught, so the activity sits at Create.`)

  await setLearner(page, last.id)
  await openActivity(page, demo.id)
  await shot(page, 'activity-apply',
    `The same activity for ${last.id}: Apply, and a different set of game elements, because the level differs.`)

  // ---------------------------------------------------------------- an attempt
  console.log('\nAn attempt')
  if (authored && authored.answer && demo.kind === 'complete') {
    await page.fill('#complete-input', authored.answer)
    await page.getByRole('button', { name: /Submit answer/ }).click()
    await page.waitForSelector('.note-good, .note-bad')
    await page.waitForTimeout(400)
    await shot(page, 'attempt-correct',
      'A correct attempt. The reward attaches to what rule R5 permits for this activity, and the procedure is recorded against the learner.')

    await openActivity(page, demo.id)
    await shot(page, 'activity-remember',
      'The same activity immediately afterwards. Rule R1c now places it at Remember, and the gamification has moved with the level.')
  } else {
    console.log('  skipped: the demonstration activity is not a code-completion item')
  }

  // ---------------------------------------------------------------- lecturer
  console.log('\nLecturer view')
  await page.goto(BASE)
  await page.waitForSelector('#learner-select')
  await setRole(page, 'lecturer')

  await page.getByRole('link', { name: 'Curriculum' }).click()
  await page.waitForTimeout(500)
  await shot(page, 'curriculum',
    'The curriculum the model is grounded in, read back out of the knowledge base: every outcome and criterion as the study guide states it, with its classification and flag.')

  await page.getByRole('link', { name: 'Design console' }).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /Levels, badges and leaderboards/ }).click()
  await page.waitForTimeout(500)
  await shot(page, 'console-rejects-zeng',
    'The design console judging the combination Zeng et al. (2024) found to depress attainment. The model rejects it for the dimensions it lacks, which Toda et al. state in advance, rather than because Zeng reported the result.')

  await page.getByRole('button', { name: /A balanced design/ }).click()
  await page.waitForTimeout(500)
  await shot(page, 'console-accepts-balanced',
    'The same console on a balanced design. Every rule is satisfied, and the levels checked are named.')

  await page.getByRole('link', { name: 'The model' }).click()
  await page.waitForTimeout(600)
  await shot(page, 'model-reference',
    'The suitability matrix and the traceability table, both read from the knowledge base the ontology produced rather than written into the interface.')

  // ---------------------------------------------------------------- reflow
  console.log('\nReflow')
  await page.setViewportSize(PHONE)
  await page.goto(BASE)
  await page.waitForSelector('#learner-select')
  await setRole(page, 'student')
  await page.waitForTimeout(400)
  await shot(page, 'reflow-narrow',
    'The student view at 390 CSS pixels. Nothing scrolls horizontally, which is what WCAG 2.1 reflow asks for.')

  await browser.close()

  // ---------------------------------------------------------------- captions
  const lines = [
    '# Figures',
    '',
    `Generated by \`docs/screenshots.mjs\` from the ${curriculum} curriculum,`,
    `in ${used} at ${DESKTOP.width}x${DESKTOP.height} CSS pixels, device scale 2.`,
    'Regenerate rather than re-stage: rebuild the knowledge base, serve the built',
    'interface, and run the script again.',
    '',
    ...shots.flatMap((s) => [`## ${s.file}`, '', s.caption, ''])
  ]
  await writeFile(resolve(OUT, 'FIGURES.md'), lines.join('\n'), 'utf-8')

  console.log(`\n${shots.length} figures and FIGURES.md written to ${OUT}`)
  console.log('The knowledge base now holds one recorded attempt. Rebuild before')
  console.log('taking measurements for Chapter 6.')
}

main().catch((error) => {
  console.error('\nFailed:', error.message)
  process.exit(1)
})
