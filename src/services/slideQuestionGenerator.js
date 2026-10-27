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
