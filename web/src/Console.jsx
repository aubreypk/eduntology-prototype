import React, { useEffect, useMemo, useState } from 'react'
import { api } from './api.js'

const REWARDS = [
  ['CompletionReward', 'the completed artefact'],
  ['ProcessReward', 'the steps the learner takes'],
  ['ExplanationReward', 'the learner explaining the work']
]

const DIMENSION_ORDER = ['Measurement', 'Personal', 'Ecological', 'Social', 'Fictional']

export default function Console ({ learner, activityId }) {
  const [activities, setActivities] = useState([])
  const [elements, setElements] = useState([])
  const [chosenActivity, setChosenActivity] = useState(activityId || '')
  const [level, setLevel] = useState('Apply')
  const [selected, setSelected] = useState([])
  const [reward, setReward] = useState('CompletionReward')
  const [proposal, setProposal] = useState(null)
  const [verdict, setVerdict] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([api.activities(learner), api.elements()])
      .then(([a, e]) => {
        setActivities(a)
        setElements(e)
        setChosenActivity((current) => current || a[0]?.id || '')
      })
      .catch((ex) => setError(ex.message))
  }, [learner])

  // Load the model's own proposal whenever the activity or level changes, and
  // start the console from it. Everything after that is the educator's edit.
  useEffect(() => {
    if (!chosenActivity) return
    api.design(chosenActivity, level)
      .then((d) => {
        setProposal(d)
        setSelected(d.elements.map((e) => e.element_id))
        setReward(d.reward_basis)
        setError(null)
      })
      .catch(() => {
        setProposal(null)
        setSelected([])
        setError(null)
      })
  }, [chosenActivity, level])

  // Re-check on every change. The check is three lookups against the tables, so
  // it costs nothing to run it on each keystroke rather than behind a button.
  useEffect(() => {
    if (!chosenActivity) return
    api.validateDesign({
      activity: chosenActivity, level, elements: selected, rewardBasis: reward
    })
      .then(setVerdict)
      .catch((e) => setError(e.message))
  }, [chosenActivity, level, selected, reward])

  const byDimension = useMemo(() => {
    const groups = {}
    elements.forEach((e) => {
      groups[e.dimension_id] = groups[e.dimension_id] || []
      groups[e.dimension_id].push(e)
    })
    return groups
  }, [elements])

  const current = activities.find((a) => a.id === chosenActivity)

  const toggle = (id) => setSelected((s) =>
    s.includes(id) ? s.filter((x) => x !== id) : [...s, id].sort())

  if (error) return <div className="note note-bad"><p>{error}</p></div>

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Design console</h2>
      <p className="lede">
        The model proposes a design for every activity at every level it can
        occupy. Change it here and the rules are re-checked as you go. The
        checking is done by lookups against the tables the reasoner wrote at
        build time, not by a reasoner running now.
      </p>

      <div className="split">
        <div>
          <section className="card" aria-labelledby="pick-heading">
            <h3 id="pick-heading" style={{ marginTop: 0 }}>What is being designed</h3>

            <label htmlFor="activity-select">Activity</label>
            <select
              id="activity-select" value={chosenActivity}
              onChange={(e) => setChosenActivity(e.target.value)}
            >
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.criteria.join(', ')})
                </option>
              ))}
            </select>

            <p style={{ marginBottom: '0.25rem', marginTop: '1rem' }}>
              <label htmlFor="level-select">
                Cognitive level <span className="hint">— the level the activity occupies for the learner being designed for</span>
              </label>
            </p>
            <select
              id="level-select" value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              {['Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate', 'Create'].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            {current && (
              <p className="hint" style={{ marginTop: '1rem', marginBottom: 0 }}>
                For {learner} this activity currently sits at{' '}
                <strong>{current.effectiveLevel}</strong>. Its vulnerability to
                generative assistance is <strong>{current.aiVulnerability}</strong>.
              </p>
            )}
          </section>

          <section className="card" aria-labelledby="elements-heading">
            <h3 id="elements-heading" style={{ marginTop: 0 }}>Game elements</h3>
            <p className="hint">
              The verdict beside each element is what the model states for the
              level selected above. An element with no verdict is permitted:
              rule R2 is permissive, and only contraindication is an error.
            </p>

            {DIMENSION_ORDER.filter((d) => byDimension[d]).map((dim) => (
              <fieldset key={dim}>
                <legend>{dim}</legend>
                {byDimension[dim].map((e) => {
                  const verdictHere = e.levels[level]
                  return (
                    <div className="choice" key={e.id}>
                      <input
                        type="checkbox" id={`el-${e.id}`}
                        checked={selected.includes(e.id)}
                        onChange={() => toggle(e.id)}
                      />
                      <label htmlFor={`el-${e.id}`}>
                        {e.label}{' '}
                        {verdictHere === 'supports' &&
                          <span className="badge badge-good">supports {level}</span>}
                        {verdictHere === 'contraindicated' &&
                          <span className="badge badge-bad">contraindicated at {level}</span>}
                        {!verdictHere &&
                          <span className="badge badge-plain">no verdict at {level}</span>}
                      </label>
                    </div>
                  )
                })}
              </fieldset>
            ))}

            <fieldset>
              <legend>Reward attaches to</legend>
              {REWARDS.map(([value, words]) => (
                <div className="choice" key={value}>
                  <input
                    type="radio" id={`rw-${value}`} name="reward" value={value}
                    checked={reward === value}
                    onChange={() => setReward(value)}
                  />
                  <label htmlFor={`rw-${value}`}>{words}</label>
                </div>
              ))}
            </fieldset>

            {proposal && (
              <button
                type="button" className="quiet"
                onClick={() => {
                  setSelected(proposal.elements.map((e) => e.element_id))
                  setReward(proposal.reward_basis)
                }}
              >
                Reset to the design the model proposed
              </button>
            )}
          </section>
        </div>

        {/* ------------------------------------------------ verdict */}
        <div>
          <section className="card" aria-labelledby="verdict-heading">
            <h3 id="verdict-heading" style={{ marginTop: 0 }}>The model&rsquo;s verdict</h3>

            <div aria-live="polite">
              {!verdict && <p>Checking.</p>}

              {verdict && verdict.conforms && (
                <div className="note note-good">
                  <p><strong>This design satisfies every rule.</strong></p>
                  <p style={{ marginBottom: 0 }}>
                    Checked at {verdict.levelsChecked.join(' and ')}: the level
                    selected, together with the levels the study guide asserts on
                    this activity&rsquo;s criteria.
                  </p>
                </div>
              )}

              {verdict && !verdict.conforms && (
                <div className="note note-bad">
                  <p>
                    <strong>
                      This design breaks {verdict.problems.length}{' '}
                      {verdict.problems.length === 1 ? 'rule' : 'rules'}.
                    </strong>
                  </p>
                  <ul style={{ marginBottom: 0 }}>
                    {verdict.problems.map((p, i) => (
                      <li key={i}>
                        <strong>{p.rule}</strong>: {p.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <h3>Dimensions covered</h3>
            <p>
              {DIMENSION_ORDER.map((d) => {
                const covered = elements
                  .filter((e) => selected.includes(e.id))
                  .some((e) => e.dimension_id === d)
                return (
                  <span key={d} style={{ marginRight: '0.35rem' }}>
                    <span className={`badge ${covered ? 'badge-good' : 'badge-plain'}`}>
                      {d}{covered ? '' : ' — absent'}
                    </span>
                  </span>
                )
              })}
            </p>
            <p className="hint" style={{ marginBottom: 0 }}>
              Rule R3 asks for at least three dimensions, and requires Personal
              and Measurement among them. The reason is stated in the model
              rather than assumed: Toda and colleagues say what the absence of
              each dimension costs the learner.
            </p>
          </section>

          <section className="card" aria-labelledby="try-heading">
            <h3 id="try-heading" style={{ marginTop: 0 }}>Two designs worth trying</h3>
            <p className="hint">
              Both are discussed in Chapter 4. The console will tell you what the
              model makes of them.
            </p>
            <p>
              <button
                type="button" className="quiet"
                onClick={() => {
                  setSelected(['Acknowledgement', 'Competition', 'Level'].sort())
                  setReward('CompletionReward')
                }}
              >
                Levels, badges and leaderboards
              </button>
            </p>
            <p style={{ marginBottom: 0 }}>
              <button
                type="button" className="quiet"
                onClick={() => {
                  setSelected(['Narrative', 'Objective', 'Point', 'Progression', 'Puzzle'].sort())
                  setReward('ExplanationReward')
                }}
              >
                A balanced design
              </button>
            </p>
          </section>
        </div>
      </div>
    </>
  )
}
