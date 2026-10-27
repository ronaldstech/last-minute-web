import { API_BASE_URL } from './apiConfig.js'

export async function generateSlideQuestions({ token, text, title, questionType, questionCount }) {
  const response = await fetch(`${API_BASE_URL}/slide-questions/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, title, questionType, questionCount }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not generate questions from these notes.')
  return result.data ?? result
}

async function requestSavedPapers(token, path = '/slide-questions', method = 'GET') {
  const response = await fetch(`${API_BASE_URL}${path}`, { method, headers: { Authorization: `Bearer ${token}` } })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not load generated papers.')
  return result
}

export async function listGeneratedSlidePapers(token) {
  const result = await requestSavedPapers(token)
  return result.data ?? result
}

export async function deleteGeneratedSlidePaper(token, id, admin = false) {
  const query = `?id=${encodeURIComponent(id)}`
  return requestSavedPapers(token, `${admin ? '/admin/slide-questions' : '/slide-questions'}${query}`, 'DELETE')
}

export async function listAdminGeneratedSlidePapers(token) {
  const result = await requestSavedPapers(token, '/admin/slide-questions')
  return result.data ?? result
}
