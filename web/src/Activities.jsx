import React, { useEffect, useMemo, useState } from 'react'
import { api } from './api.js'

const KIND_WORDS = {
  trace: 'predict the output',
  mcq: 'choose one',
  complete: 'write the code',
  order: 'put in order'
}

export default function Activities ({ learner, role }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [openOutcome, setOpenOutcome] = useState(null)

  useEffect(() => {
    setRows(null)
    api.activities(learner)
      .then((a) => { setRows(a); setError(null) })
      .catch((e) => setError(e.message))
  }, [learner])

  // One group per learning outcome, in curriculum order. Forty-two rows in a
  // column is a list to be got through; seven cards is a course.
  const groups = useMemo(() => {
    if (!rows) return []
    const byOutcome = new Map()
    rows.forEach((activity) => {
      const outcome = activity.outcome || { id: 'none', label: 'Ungrouped', module_id: '' }
      if (!byOutcome.has(outcome.id)) {
        byOutcome.set(outcome.id, { outcome, activities: [] })
      }
      byOutcome.get(outcome.id).activities.push(activity)
    })
    return [...byOutcome.values()].sort((a, b) =>
      (a.outcome.module_id + a.outcome.label).localeCompare(
        b.outcome.module_id + b.outcome.label))
  }, [rows])

  // Open the first group that still has something unsolved, so the page lands
  // where there is work rather than at the top of an accordion.
  useEffect(() => {
    if (!groups.length || openOutcome !== null) return
    const next = groups.find((g) => g.activities.some((a) => !a.solved))
    setOpenOutcome((next || groups[0]).outcome.id)
  }, [groups, openOutcome])

  if (error) return <div className="note note-bad"><p>{error}</p></div>
  if (!rows) return <p>Loading the activities.</p>

  const levelsOf = (activities) => {
    const seen = new Map()
    activities.forEach((a) => seen.set(a.effectiveLevel, (seen.get(a.effectiveLevel) || 0) + 1))
    return [...seen.entries()]
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>
        {role === 'lecturer' ? 'What this learner sees' : 'Your activities'}
      </h2>
      <p className="lede">
        {role === 'lecturer'
          ? <>Every activity as this learner meets it. The level on each is
            derived, not stored on the activity: rule R1 works it out from the
            procedures the activity requires and the procedures this learner has
            been taught. Change who you are viewing as and the levels move with
            them, and so does the gamification each activity is given.</>
          : <>The level on each activity is not a property of the activity. It is
            what the model worked out for <em>you</em>, from the procedures the
            activity needs and the procedures you have been taught. Do the work
            and the levels change — and so does what each activity gives you.</>}
      </p>

      {groups.map(({ outcome, activities }) => {
        const solved = activities.filter((a) => a.solved).length
        const percent = Math.round((solved / activities.length) * 100)
        const open = openOutcome === outcome.id

        return (
          <details
            key={outcome.id}
            className="outcome"
            open={open}
            onToggle={(e) => {
              if (e.currentTarget.open) setOpenOutcome(outcome.id)
              else if (open) setOpenOutcome('')
            }}
          >
            <summary>
              <span className="outcome-title">
                <small>{outcome.module_id}</small>
                {outcome.label}
              </span>

              <span className="outcome-meta">
                {levelsOf(activities).map(([level, n]) => (
                  <span key={level} className={`chip chip--${level}`}>
                    {n} at {level}
                  </span>
                ))}
              </span>

              <span className="outcome-progress">
                <span className="k">{solved} of {activities.length} solved</span>
                <span className="meter" aria-hidden="true">
                  <span style={{ width: `${percent}%` }} />
                </span>
              </span>
            </summary>

            <div className="outcome-body">
              <ul className="activity-list">
                {activities.map((a) => (
                  <li key={a.id}>
                    <a className="activity-link" href={`#/activity/${encodeURIComponent(a.id)}`}>
                      <span>
                        <span className="title">{a.label}</span>
                        <span className="meta">
                          {a.criteria.join(', ')}
                          {a.language ? ` · ${a.language}` : ''}
                          {' · '}{KIND_WORDS[a.kind] || a.kind}
                        </span>
                      </span>

                      <span className="marks">
                        {a.solved && (
                          <span className="solved-tick" title="solved">
                            ✓<span className="visually-hidden">solved</span>
                          </span>
                        )}
                        {a.aiVulnerability === 'high' && (
                          <span className="chip chip--warn">AI-vulnerable</span>
                        )}
                        <span className={`chip chip--${a.effectiveLevel}`}>
                          {a.effectiveLevel}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )
      })}
    </>
  )
}
