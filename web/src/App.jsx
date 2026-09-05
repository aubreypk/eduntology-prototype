import React, { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import Activities from './Activities.jsx'
import Activity from './Activity.jsx'
import Console from './Console.jsx'
import Curriculum from './Curriculum.jsx'
import Model from './Model.jsx'

// Hash routing, written out rather than pulled in. A handful of routes is not
// enough to justify a dependency, and every dependency is something the Layer 2
// audit has to account for.
function useRoute () {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/activities')
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.slice(1) || '/activities')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

// Two roles, because the platform has two audiences and they want opposite
// things. A learner wants somewhere to work; a lecturer wants to see what the
// model decided and why. Showing both audiences every view at once is what made
// the interface read as an admin console.
//
// This is a view switch, NOT authentication. There are no accounts and no
// participants; Chapter 5 says so plainly rather than implying access control
// the prototype does not have.
const NAV = {
  student: [
    ['/activities', 'Play']
  ],
  lecturer: [
    ['/activities', 'Student view'],
    ['/curriculum', 'Curriculum'],
    ['/console', 'Design console'],
    ['/model', 'The model']
  ]
}

const LECTURER_ONLY = ['curriculum', 'console', 'model']

function readStored (key, fallback) {
  try {
    return window.localStorage.getItem(key) || fallback
  } catch (ignored) {
    return fallback
  }
}

function store (key, value) {
  // A convenience only; a browser that refuses storage must still work.
  try {
    window.localStorage.setItem(key, value)
  } catch (ignored) { /* private window, or site data blocked */ }
}

export default function App () {
  const route = useRoute()
  const [role, setRole] = useState(() => readStored('gpo.role', 'student'))
  const [learners, setLearners] = useState([])
  const [learner, setLearner] = useState(() => readStored('gpo.learner', ''))
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const mainRef = useRef(null)

  useEffect(() => {
    api.learners()
      .then((rows) => {
        setLearners(rows)
        setLearner((current) =>
          rows.some((r) => r.id === current) ? current : (rows[0]?.id || ''))
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => { if (learner) store('gpo.learner', learner) }, [learner])
  useEffect(() => { store('gpo.role', role) }, [role])

  // Re-read the score whenever the learner changes or the view does, so that
  // returning from an activity shows what the attempt earned.
  useEffect(() => {
    if (!learner) return
    api.progress(learner).then(setProgress).catch(() => setProgress(null))
  }, [learner, route])

  const parts = route.replace(/^\/+/, '').split('/')
  const path = parts[0] || 'activities'
  const param = parts[1] ? decodeURIComponent(parts[1]) : null

  // A student who lands on a lecturer route — by a bookmark, or by switching
  // role while looking at one — is sent back rather than shown an empty page.
  useEffect(() => {
    if (role === 'student' && LECTURER_ONLY.includes(path)) {
      window.location.hash = '/activities'
    }
  }, [role, path])

  // Move focus to the heading on a route change, so that a keyboard or screen
  // reader user is not left at the top of the navigation after every click.
  useEffect(() => {
    if (mainRef.current) mainRef.current.focus()
  }, [route, role])

  let view
  if (error) {
    view = (
      <div className="note note-bad">
        <p><strong>The API could not be reached.</strong> {error}</p>
        <p>
          Build the knowledge base with <code className="inline-code">py build\build_kb.py</code>,
          then start the API with <code className="inline-code">node api\dev-server.mjs</code>.
        </p>
      </div>
    )
  } else if (!learner) {
    view = <p>Loading.</p>
  } else if (role === 'student' && LECTURER_ONLY.includes(path)) {
    view = <p>Taking you back to your activities.</p>
  } else if (path === 'activity' && param) {
    view = <Activity id={param} learner={learner} role={role} />
  } else if (path === 'console') {
    view = <Console key={param || 'any'} learner={learner} activityId={param} />
  } else if (path === 'curriculum') {
    view = <Curriculum />
  } else if (path === 'model') {
    view = <Model />
  } else {
    view = <Activities learner={learner} role={role} />
  }

  const current = learners.find((l) => l.id === learner)
  const solved = progress ? progress.solved : 0
  const total = progress ? progress.activities : 0
  const percent = total ? Math.round((solved / total) * 100) : 0
  const student = role === 'student'

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>

      <header className="masthead">
        <div className="masthead-inner">
          {/* Row one: who you are. Row two: where you can go. Kept apart
              because the lecturer has four destinations and they will not
              share a line with the identity controls at usable widths. */}
          <div className="masthead-top">
            <h1 className="brand">
              Eduntology
              <span>
                {student
                  ? 'Game elements chosen by the model, not by hand'
                  : 'What the model decided for each learner, and why'}
              </span>
            </h1>

            <div className="identity">
              <div className="roles" role="group" aria-label="Point of view">
                <button
                  type="button" aria-pressed={student}
                  onClick={() => setRole('student')}
                >
                  Student
                </button>
                <button
                  type="button" aria-pressed={!student}
                  onClick={() => setRole('lecturer')}
                >
                  Lecturer
                </button>
              </div>

              <div className="learner-field">
                <label htmlFor="learner-select">
                  {student ? 'Signed in as' : 'Viewing as'}{' '}
                  <span className="hint">
                    {student ? '— stands in for a login' : '— taught different amounts'}
                  </span>
                </label>
                <select
                  id="learner-select"
                  value={learner}
                  onChange={(e) => setLearner(e.target.value)}
                >
                  {learners.map((l) => (
                    <option key={l.id} value={l.id}>{l.id} — {l.label}</option>
                  ))}
                </select>
              </div>

              {student && progress && (
                <p className="xp" style={{ margin: 0 }}>
                  {progress.points}
                  <small>xp</small>
                  <span className="visually-hidden">
                    , {solved} of {total} activities solved
                  </span>
                </p>
              )}
            </div>
          </div>

          <nav className="masthead-nav" aria-label="Sections">
            <ul>
              {NAV[role].map(([href, label]) => (
                <li key={href}>
                  <a
                    href={`#${href}`}
                    aria-current={
                      (href === '/activities'
                        ? ['activities', 'activity'].includes(path)
                        : route.startsWith(href))
                        ? 'page'
                        : undefined
                    }
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1}>
        {current && (
          <div className="card card--raised" style={{ marginBottom: '1.5rem' }}>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '1rem 2rem',
              alignItems: 'center', justifyContent: 'space-between'
            }}>
              <p style={{ margin: 0, maxWidth: '52ch' }}>
                <strong>{current.label}.</strong>{' '}
                <span className="hint">{current.note}</span>
              </p>
              {student && progress && (
                <div style={{ minWidth: '13rem', flex: 'none' }}>
                  <span className="stat">
                    <span className="k">{solved} of {total} solved</span>
                  </span>
                  <div className="meter" aria-hidden="true">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {view}
      </main>
    </>
  )
}
