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
  ['/activities', 'Activities'],
  ['/console', 'Design console'],
  ['/model', 'The model']
]

export default function App () {
  const route = useRoute()
  const [learners, setLearners] = useState([])
  const [learner, setLearner] = useState(() => {
    try { return window.localStorage.getItem('gpo.learner') || '' } catch (e) { return '' }
  })
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

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>

      <header className="masthead">
        <div className="masthead-inner">
          <h1 className="brand">
            Eduntology
            <span>Game elements aligned to learning outcomes, by the model rather than by hand</span>
          </h1>

          <nav aria-label="Sections">
            <ul>
              {NAV.map(([href, label]) => (
                <li key={href}>
                  <a
                    href={`#${href}`}
                    aria-current={route.startsWith(href) ? 'page' : undefined}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div style={{ minWidth: '17rem' }}>
            <label htmlFor="learner-select">
              Learner <span className="hint">— what each has been taught differs</span>
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
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1}>
        {current && (
          <p className="lede" style={{ marginBottom: '1rem' }}>
            <strong>{current.label}.</strong> {current.note}
          </p>
        )}
        {view}
      </main>
    </>
  )
}
