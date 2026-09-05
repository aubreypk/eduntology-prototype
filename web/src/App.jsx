import React, { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import Activities from './Activities.jsx'
import Activity from './Activity.jsx'
import Console from './Console.jsx'
import Model from './Model.jsx'

// Hash routing, written out rather than pulled in. Four routes is not enough to
// justify a dependency, and every dependency is something the Layer 2 audit has
// to account for.
function useRoute () {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/activities')
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.slice(1) || '/activities')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

const NAV = [
  ['/activities', 'Play'],
  ['/console', 'Design console'],
  ['/model', 'The model']
]

export default function App () {
  const route = useRoute()
  const [learners, setLearners] = useState([])
  const [learner, setLearner] = useState(() => {
    try { return window.localStorage.getItem('gpo.learner') || '' } catch (e) { return '' }
  })
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

  useEffect(() => {
    // Remembering the selected learner is a convenience only; a browser that
    // refuses storage must still work, so the failure is swallowed.
    try {
      if (learner) window.localStorage.setItem('gpo.learner', learner)
    } catch (ignored) { /* private window, or site data blocked */ }
  }, [learner])

  // Re-read the score whenever the learner changes or the view does, so that
  // returning from an activity shows what the attempt earned.
  useEffect(() => {
    if (!learner) return
    api.progress(learner).then(setProgress).catch(() => setProgress(null))
  }, [learner, route])

  // Move focus to the heading on a route change, so that a keyboard or screen
  // reader user is not left at the top of the navigation after every click.
  useEffect(() => {
    if (mainRef.current) mainRef.current.focus()
  }, [route])

  const parts = route.replace(/^\/+/, '').split('/')
  const path = parts[0] || 'activities'
  const param = parts[1] ? decodeURIComponent(parts[1]) : null

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
  } else if (path === 'activity' && param) {
    view = <Activity id={param} learner={learner} />
  } else if (path === 'console') {
    view = <Console key={param || 'any'} learner={learner} activityId={param} />
  } else if (path === 'model') {
    view = <Model />
  } else {
    view = <Activities learner={learner} />
  }

  const current = learners.find((l) => l.id === learner)
  const solved = progress ? progress.solved : 0
  const total = progress ? progress.activities : 0
  const percent = total ? Math.round((solved / total) * 100) : 0

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>

      <header className="masthead">
        <div className="masthead-inner">
          <h1 className="brand">
            Eduntology
            <span>Game elements chosen by the model, not by hand</span>
          </h1>

          <nav aria-label="Sections">
            <ul>
              {NAV.map(([href, label]) => (
                <li key={href}>
                  <a href={`#${href}`} aria-current={route.startsWith(href) ? 'page' : undefined}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="learner-bar">
            <div style={{ minWidth: '15rem' }}>
              <label htmlFor="learner-select">
                Playing as <span className="hint">— what each has been taught differs</span>
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

            {progress && (
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
      </header>

      <main id="main" ref={mainRef} tabIndex={-1}>
        {current && (
          <div className="card card--raised" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem 2rem',
              alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ margin: 0, maxWidth: '52ch' }}>
                <strong>{current.label}.</strong>{' '}
                <span className="hint">{current.note}</span>
              </p>
              {progress && (
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
