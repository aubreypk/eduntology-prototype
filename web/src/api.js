// Every call goes to the API, which reads what the model concluded at build
// time. Nothing in this interface decides which game elements an activity gets.

async function request(path, options) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = body.detail || detail
    } catch (ignored) { /* the body was not JSON */ }
    throw new Error(detail)
  }
  return response.json()
}

export const api = {
  meta: () => request('/api/meta'),
  learners: () => request('/api/learners'),
  curriculum: () => request('/api/curriculum'),
  elements: () => request('/api/elements'),
  traceability: () => request('/api/traceability'),

  activities: (learner) =>
    request(`/api/activities?learner=${encodeURIComponent(learner)}`),
  activity: (id, learner) =>
    request(`/api/activities/${encodeURIComponent(id)}?learner=${encodeURIComponent(learner)}`),
  progress: (learner) =>
    request(`/api/progress?learner=${encodeURIComponent(learner)}`),

  submit: (learner, activity, submitted) =>
    request('/api/attempts', {
      method: 'POST',
      body: JSON.stringify({ learner, activity, submitted })
    }),

  design: (activity, level) =>
    request(`/api/designs/${encodeURIComponent(activity)}?level=${encodeURIComponent(level)}`),
  validateDesign: (payload) =>
    request('/api/designs/validate', { method: 'POST', body: JSON.stringify(payload) })
}
