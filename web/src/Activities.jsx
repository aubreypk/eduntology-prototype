import React, { useEffect, useState } from 'react'
import { api } from './api.js'

const LEVEL_CLASS = {
  Remember: 'badge-plain',
  Understand: 'badge-plain',
  Apply: 'badge-level',
  Analyse: 'badge-warn',
  Evaluate: 'badge-warn',
  Create: 'badge-warn'
}

export default function Activities ({ learner }) {
  const [rows, setRows] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setRows(null)
    Promise.all([api.activities(learner), api.progress(learner)])
      .then(([a, p]) => { setRows(a); setProgress(p); setError(null) })
      .catch((e) => setError(e.message))
  }, [learner])

  if (error) return <div className="note note-bad"><p>{error}</p></div>
  if (!rows) return <p>Loading the activities.</p>

  const spread = {}
  rows.forEach((r) => { spread[r.effectiveLevel] = (spread[r.effectiveLevel] || 0) + 1 })

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Activities</h2>
      <p className="lede">
        The level shown beside each activity is not a property of the activity. It
        is what rule R1 derived for <em>this</em> learner from the procedures the
        activity requires and the procedures the learner has met. Change the
        learner above and the levels change with them, and so does the
        gamification each activity is given.
      </p>

      <div className="card">
        <div className="stat-row">
          <div className="stat">
            <span className="n">{progress?.solved ?? 0}</span>
            <span className="k">solved of {progress?.activities ?? rows.length}</span>
          </div>
          <div className="stat">
            <span className="n">{progress?.points ?? 0}</span>
            <span className="k">points earned</span>
          </div>
          {Object.keys(spread).sort().map((level) => (
            <div className="stat" key={level}>
              <span className="n">{spread[level]}</span>
              <span className="k">at {level} for this learner</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <ul className="activity-list">
          {rows.map((r) => (
            <li key={r.id}>
              <a className="activity-link" href={`#/activity/${encodeURIComponent(r.id)}`}>
                <span>
                  <span className="title">{r.label}</span>
                  <span className="meta">
                    {' '}— {r.criteria.join(', ')}
                    {r.language ? ` · ${r.language}` : ''} · {r.kind}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  {r.solved && <span className="badge badge-good">solved</span>}
                  {r.aiVulnerability === 'high' &&
                    <span className="badge badge-warn">AI-vulnerable</span>}
                  <span className={`badge ${LEVEL_CLASS[r.effectiveLevel] || 'badge-plain'}`}>
                    {r.effectiveLevel} <span className="visually-hidden">by rule</span> {r.rule}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
