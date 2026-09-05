import React, { useEffect, useRef, useState } from 'react'
import { api } from './api.js'

const REWARD_WORDS = {
  CompletionReward: 'completing the task',
  ProcessReward: 'the steps you take',
  ExplanationReward: 'explaining your answer'
}

export default function Activity ({ id, learner }) {
  const [data, setData] = useState(null)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const feedbackRef = useRef(null)

  useEffect(() => {
    setData(null); setAnswer(''); setResult(null)
    api.activity(id, learner)
      .then((d) => { setData(d); setError(null) })
      .catch((e) => setError(e.message))
  }, [id, learner])

  useEffect(() => {
    if (result && feedbackRef.current) feedbackRef.current.focus()
  }, [result])

  if (error) return <div className="note note-bad"><p>{error}</p></div>
  if (!data) return <p>Loading the activity.</p>

  const submit = (event) => {
    event.preventDefault()
    setBusy(true)
    api.submit(learner, id, answer)
      .then((r) => {
        setResult(r)
        return api.activity(id, learner)
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const design = data.design
  const ctx = data.context

  return (
    <>
      <p><a href="#/activities">Back to the activity list</a></p>
      <h2 style={{ marginTop: 0 }}>{data.label}</h2>

      <div className="split">
        <div>
          {/* --------------------------------------------- the task */}
          <section className="card" aria-labelledby="task-heading">
            <h3 id="task-heading" style={{ marginTop: 0 }}>The task</h3>
            <p>{data.prompt}</p>

            {data.code && (
              <pre><code>{data.code}</code></pre>
            )}

            <form onSubmit={submit}>
              {data.kind === 'mcq' && (
                <fieldset>
                  <legend>Choose one</legend>
                  {data.options.map((opt, i) => (
                    <div className="choice" key={i}>
                      <input
                        type="radio" id={`opt-${i}`} name="option" value={String(i)}
                        checked={answer === String(i)}
                        onChange={(e) => setAnswer(e.target.value)}
                      />
                      <label htmlFor={`opt-${i}`}>{opt}</label>
                    </div>
                  ))}
                </fieldset>
              )}

              {data.kind === 'order' && (
                <fieldset>
                  <legend>Give the order, as a comma-separated list of numbers</legend>
                  <ol>
                    {data.options.map((opt, i) => (
                      <li key={i}><strong>{i}</strong> — {opt}</li>
                    ))}
                  </ol>
                  <label htmlFor="order-input">Your order</label>
                  <input
                    id="order-input" type="text" value={answer} placeholder="0,1,2,3"
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                </fieldset>
              )}

              {data.kind === 'trace' && (
                <>
                  <label htmlFor="trace-input">
                    The output, one line per printed line
                  </label>
                  <textarea
                    id="trace-input" value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                </>
              )}

              {data.kind === 'complete' && (
                <>
                  <p className="hint" style={{ marginBottom: '0.35rem' }}>
                    Supply the missing part. The surrounding code is fixed.
                  </p>
                  {data.codeBefore && <pre><code>{data.codeBefore}</code></pre>}
                  <label htmlFor="complete-input">Your code</label>
                  <textarea
                    id="complete-input" value={answer} spellCheck="false"
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                  {data.codeAfter && <pre><code>{data.codeAfter}</code></pre>}
                </>
              )}

              <p style={{ marginBottom: 0 }}>
                <button type="submit" disabled={busy || answer.trim() === ''}>
                  {busy ? 'Checking' : 'Submit answer'}
                </button>
              </p>
            </form>
          </section>

          {/* --------------------------------------------- feedback */}
          <div aria-live="polite">
            {result && (
              <section
                ref={feedbackRef} tabIndex={-1}
                className={`note ${result.correct ? 'note-good' : 'note-bad'}`}
                aria-labelledby="feedback-heading"
              >
                <h3 id="feedback-heading" style={{ marginTop: 0 }}>
                  {result.correct ? 'Correct' : 'Not yet'}
                </h3>
                <p>{result.feedback}</p>
                <p>{result.explanation}</p>
                <p>
                  {result.rewardGiven
                    ? <>You earned <strong>{result.points} points</strong> for {REWARD_WORDS[result.rewardBasis]}.</>
                    : <>No points this time. This activity rewards {REWARD_WORDS[result.rewardBasis]}.</>}
                </p>
                {result.processesEarned?.length > 0 && (
                  <p>
                    Your record now shows that you have met{' '}
                    {result.processesEarned.join(', ')}.
                    {result.levelChanged && (
                      <> Because of that, this activity has moved from{' '}
                        <strong>{result.levelBefore}</strong> to{' '}
                        <strong>{result.levelAfter}</strong> for you, and the
                        elements it is allowed to use have changed with it.</>
                    )}
                  </p>
                )}
              </section>
            )}
          </div>

          {/* --------------------------------------------- criteria */}
          <section className="card" aria-labelledby="criteria-heading">
            <h3 id="criteria-heading" style={{ marginTop: 0 }}>
              What this activity is for
            </h3>
            <div className="scroll">
              <table>
                <caption>
                  The assessment criteria this activity addresses, quoted from the
                  study guides.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Criterion</th>
                    <th scope="col">Text</th>
                    <th scope="col">Level as stated</th>
                    <th scope="col">Taught procedure</th>
                  </tr>
                </thead>
                <tbody>
                  {data.criteria.map((c) => (
                    <tr key={c.code}>
                      <th scope="row">
                        {c.code}
                        {c.flag ? <> <span className="badge badge-plain">{c.flag}</span></> : null}
                      </th>
                      <td>{c.text}</td>
                      <td>{c.asserted_level}</td>
                      <td>{c.process_label || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* ----------------------------------------------- the model's side */}
        <div>
          <section className="card" aria-labelledby="level-heading">
            <h3 id="level-heading" style={{ marginTop: 0 }}>
              Why this level
            </h3>
            <p>
              <span className="badge badge-level">{ctx.level}</span>{' '}
              <span className="hint">derived by {ctx.rule}</span>
            </p>
            <p>{ctx.basis}</p>
            {ctx.materialisedLevel && ctx.materialisedLevel !== ctx.level && (
              <p className="hint">
                At build time the model derived {ctx.materialisedLevel} for this
                pairing. It has changed because this learner has since completed
                work that the model counts as exposure.
              </p>
            )}
          </section>

          {design && (
            <section className="card" aria-labelledby="design-heading">
              <h3 id="design-heading" style={{ marginTop: 0 }}>
                The gamification this activity is given
              </h3>
              <p className="hint">{design.rationale}</p>

              <ul className="reasons">
                {design.elements.map((e) => (
                  <li key={e.element_id}>
                    <strong>{e.label}</strong>{' '}
                    <span className="badge badge-plain">{e.dimension_id}</span>
                    <p className="why">{e.reason}</p>
                  </li>
                ))}
              </ul>

              <p style={{ marginBottom: 0 }}>
                Reward attaches to <strong>{REWARD_WORDS[design.reward_basis]}</strong>.
                {data.aiVulnerability === 'high' && (
                  <> Rule R5 forbids rewarding completion here, because the artefact
                    this activity asks for can be produced by a generative model
                    without the learner doing the thinking.</>
                )}
              </p>

              {design.buildTimeViolations?.length > 0 && (
                <div className="note note-warn" style={{ marginTop: '1rem' }}>
                  <p><strong>The validator flagged this design at build time.</strong></p>
                  <ul>
                    {design.buildTimeViolations.map((v, i) => (
                      <li key={i}>{v.rule}: {v.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p style={{ marginBottom: 0 }}>
                <a href={`#/console/${encodeURIComponent(data.id)}`}>
                  Open this design in the console
                </a>
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
