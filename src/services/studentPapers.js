const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/backend/public').replace(/\/$/, '')

async function request(path, token, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not load the paper library.')
  return result
}

export async function listStudentPapers(token) {
  const result = await request('/papers', token)
  return result.papers || []
}

export async function getStudentPaper(token, paperId) {
  const result = await request(`/papers/detail?id=${encodeURIComponent(paperId)}`, token)
  return result.paper
}

export async function saveStudentPaper(token, paperId, saved) {
  return request(`/papers/saved?id=${encodeURIComponent(paperId)}`, token, { method: saved ? 'POST' : 'DELETE' })
}

export async function unlockStudentPaper(token, paperId) {
  const result = await request(`/papers/unlock?id=${encodeURIComponent(paperId)}`, token, { method: 'POST' })
  return result
}

export async function submitPracticeAnswer(token, paperId, questionKey, answer) {
  const result = await request('/papers/answers', token, {
    method: 'POST',
    body: { paperId, questionKey, answer },
  })
  return result.submission
}
