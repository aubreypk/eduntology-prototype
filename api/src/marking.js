// Deterministic marking.
//
// No learner code is executed and no external service is called. Every activity
// kind is marked by comparison, which is what allows the evaluation to run
// without a human marker and without a sandbox — and, incidentally, what allows
// the whole thing to run in a Worker. The cost is stated in Chapter 5: an
// activity cannot ask for a free-form program, only for an answer that can be
// compared.

/** Remove every whitespace character. Used for supplied code, where layout is
 *  the learner's business and the tokens are not. */
export function squash (text) {
  return (text || '').replace(/\s+/g, '')
}

/** Trim each line and drop blank lines, so that trailing spaces and a missing
 *  final newline do not fail a correct answer. */
export function normaliseOutput (text) {
  return (text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n')
}

function sequence (text) {
  return (text || '').split(',').map((p) => p.trim()).filter((p) => p !== '')
}

/**
 * activity is a row from the activity table.
 * Returns { correct, feedback } where feedback names what was compared, so the
 * interface can show the learner why an answer was rejected.
 */
export function mark (activity, submitted) {
  const answer = activity.answer

  if (activity.kind === 'mcq') {
    const correct = (submitted || '').trim() === String(answer).trim()
    return {
      correct,
      feedback: correct
        ? 'The selected option is the one the model answer names.'
        : 'That is not the option the model answer names.'
    }
  }

  if (activity.kind === 'order') {
    const got = sequence(submitted)
    const want = sequence(answer)
    const correct = got.length === want.length && got.every((v, i) => v === want[i])
    return {
      correct,
      feedback: correct
        ? 'The steps are in the stated order.'
        : 'The steps are not yet in the stated order.'
    }
  }

  if (activity.kind === 'trace') {
    const got = normaliseOutput(submitted)
    const want = normaliseOutput(answer)
    if (got === want) {
      return { correct: true, feedback: 'The predicted output matches the output of the fragment.' }
    }
    if (got.replace(/ /g, '') === want.replace(/ /g, '')) {
      return {
        correct: false,
        feedback: 'The values are right but the spacing is not. Compare your answer ' +
                  "with the fragment's output character by character."
      }
    }
    if (got.toLowerCase() === want.toLowerCase()) {
      return {
        correct: false,
        feedback: 'The values are right but the case is not. Java prints true and ' +
                  'false in lower case; Python prints True and False.'
      }
    }
    return { correct: false, feedback: 'The predicted output is not what the fragment prints.' }
  }

  if (activity.kind === 'complete') {
    let accept = []
    try {
      accept = JSON.parse(activity.accept_json || '[]')
    } catch (ignored) {
      accept = []
    }
    const acceptable = new Set([...accept, answer].map(squash))
    const got = squash(submitted)
    if (acceptable.has(got)) {
      return { correct: true, feedback: 'The supplied code is accepted.' }
    }
    if (got && squash(answer).toLowerCase() === got.toLowerCase()) {
      return {
        correct: false,
        feedback: 'The code is right apart from its capitalisation. Java and Python ' +
                  'are both case-sensitive.'
      }
    }
    return { correct: false, feedback: 'The supplied code is not accepted.' }
  }

  return { correct: false, feedback: 'This activity has no marking rule.' }
}
