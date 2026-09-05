import React, { useEffect, useState } from 'react'
import { api } from './api.js'

// The lecturer's view of the material the model is grounded in: every outcome
// and every assessment criterion, as the study guide states them, with the
// cognitive level assigned to each and the taught procedure it requires.
//
// Nothing here is written into the interface. It is the curriculum graph read
// back out of the knowledge base, which is the point: the model is grounded in
// a curriculum in force rather than in outcomes invented for the study.

const FLAG_NOTE = {
  Thompson: 'The stated verb and the taught procedure place this at different ' +
            'levels, so its level cannot be settled from the text alone. Rule R1 ' +
            'resolves it per learner.',
  Split: 'States two cognitive processes in one sentence; classified at the higher.',
  Repeat: 'Restates a criterion from the earlier module almost word for word.',
  Ambiguous: 'The wording admits more than one reading, for a reason other than teaching.'
}

export default function Curriculum () {
  const [modules, setModules] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.curriculum().then(setModules).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="note note-bad"><p>{error}</p></div>
  if (!modules) return <p>Loading the curriculum.</p>

  const allCriteria = modules.flatMap((m) => m.outcomes.flatMap((o) => o.criteria))
  const flagged = allCriteria.filter((c) => c.flag)
  const byLevel = {}
  allCriteria.forEach((c) => {
    byLevel[c.asserted_level] = (byLevel[c.asserted_level] || 0) + 1
  })

  return (
    <div className="console">
      <h2 style={{ marginTop: 0 }}>The curriculum the model is built on</h2>
      <p className="lede">
        Every outcome and criterion below is quoted from the study guide, not
        written for this study. The level is the classification made in the
        research, following the revised Bloom taxonomy as interpreted for
        programming by Thompson et al. (2008). A flag marks a criterion whose
        level the text alone does not settle.
      </p>

      <div className="card">
        <div className="stat-row">
          <div className="stat">
            <span className="n">{allCriteria.length}</span>
            <span className="k">assessment criteria</span>
          </div>
          <div className="stat">
            <span className="n">
              {modules.reduce((n, m) => n + m.outcomes.length, 0)}
            </span>
            <span className="k">learning outcomes</span>
          </div>
          <div className="stat">
            <span className="n">{flagged.length}</span>
            <span className="k">carrying a flag</span>
          </div>
          {Object.keys(byLevel)
            .sort()
            .map((level) => (
              <div className="stat" key={level}>
                <span className="n">{byLevel[level]}</span>
                <span className="k">at {level}</span>
              </div>
            ))}
        </div>
      </div>

      {modules.map((module) => (
        <section key={module.id} aria-labelledby={`mod-${module.id}`}>
          <h3 id={`mod-${module.id}`}>{module.label}</h3>

          {module.outcomes.map((outcome) => (
            <details className="outcome" key={outcome.id}>
              <summary>
                <span className="outcome-title">{outcome.label}</span>
                <span className="outcome-meta">
                  <span className="chip chip--plain">
                    {outcome.criteria.length} criteria
                  </span>
                  {outcome.criteria.some((c) => c.flag) && (
                    <span className="chip chip--warn">
                      {outcome.criteria.filter((c) => c.flag).length} flagged
                    </span>
                  )}
                </span>
              </summary>

              <div className="outcome-body">
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Criterion</th>
                        <th scope="col">As the study guide states it</th>
                        <th scope="col">Level</th>
                        <th scope="col">Taught procedure</th>
                        <th scope="col">Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outcome.criteria.map((c) => (
                        <tr key={c.id}>
                          <th scope="row">{c.code}</th>
                          <td>{c.text}</td>
                          <td>
                            <span className={`chip chip--${c.asserted_level}`}>
                              {c.asserted_level}
                            </span>
                          </td>
                          <td>{c.process_label || '—'}</td>
                          <td>
                            {c.flag
                              ? <span className="chip chip--warn" title={FLAG_NOTE[c.flag] || ''}>
                                {c.flag}
                              </span>
                              : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          ))}
        </section>
      ))}

      <section className="card" aria-labelledby="flags-heading">
        <h3 id="flags-heading" style={{ marginTop: 0 }}>What the flags mean</h3>
        <dl>
          {Object.entries(FLAG_NOTE).map(([flag, note]) => (
            <div key={flag} style={{ marginBottom: '0.75rem' }}>
              <dt><span className="chip chip--warn">{flag}</span></dt>
              <dd style={{ margin: '0.4rem 0 0' }}>{note}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
