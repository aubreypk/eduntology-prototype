import React, { useEffect, useState } from 'react'
import { api } from './api.js'

const LEVELS = ['Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate', 'Create']

export default function Model () {
  const [elements, setElements] = useState([])
  const [trace, setTrace] = useState([])
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([api.elements(), api.traceability(), api.meta()])
      .then(([e, t, m]) => { setElements(e); setTrace(t); setMeta(m) })
      .catch((ex) => setError(ex.message))
  }, [])

  if (error) return <div className="note note-bad"><p>{error}</p></div>

  return (
    <>
      <h2 style={{ marginTop: 0 }}>The model behind the platform</h2>
      <p className="lede">
        Nothing on this page is written into the interface. All of it is read
        from the knowledge base the ontology produced, which is what makes the
        platform an instantiation of the model rather than a program that
        happens to agree with it.
      </p>

      {meta && (
        <section className="card" aria-labelledby="build-heading">
          <h3 id="build-heading" style={{ marginTop: 0 }}>The last build</h3>
          <div className="scroll">
            <table>
              <caption>
                Written by <code>build_kb.py</code>. The platform does no
                reasoning of its own: <strong>reasoning at run time is{' '}
                {String(meta.reasoningAtRunTime)}</strong>.
              </caption>
              <tbody>
                {Object.entries(meta.build).map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{k.replace(/_/g, ' ')}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="matrix-heading">
        <h3 id="matrix-heading" style={{ marginTop: 0 }}>
          Element suitability by cognitive level
        </h3>
        <div className="scroll">
          <table>
            <caption>
              The alignment the model asserts. A blank cell is neither support
              nor contraindication, and under the permissive reading of rule R2
              such an element is allowed at that level.
            </caption>
            <thead>
              <tr>
                <th scope="col">Element</th>
                <th scope="col">Dimension</th>
                {LEVELS.map((l) => <th scope="col" key={l}>{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {elements.map((e) => (
                <tr key={e.id}>
                  <th scope="row">{e.label}</th>
                  <td>{e.dimension_id}</td>
                  {LEVELS.map((l) => (
                    <td key={l}>
                      {e.levels[l] === 'supports' &&
                        <span className="badge badge-good">supports</span>}
                      {e.levels[l] === 'contraindicated' &&
                        <span className="badge badge-bad">against</span>}
                      {!e.levels[l] && <span className="visually-hidden">no verdict</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-labelledby="trace-heading">
        <h3 id="trace-heading" style={{ marginTop: 0 }}>
          Model element to implemented feature
        </h3>
        <div className="scroll">
          <table>
            <caption>
              Generated during the build, so it cannot drift from the code it
              describes. Chapter 5 reports this table.
            </caption>
            <thead>
              <tr>
                <th scope="col">Model element</th>
                <th scope="col">Kind</th>
                <th scope="col">Where it is realised</th>
                <th scope="col">In the code</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {trace.map((t, i) => (
                <tr key={i}>
                  <th scope="row"><code>{t.model_element}</code></th>
                  <td>{t.kind}</td>
                  <td>{t.feature}</td>
                  <td><code>{t.location}</code></td>
                  <td>{t.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
