import { API_BASE_URL, MARKING_API_URL } from './apiConfig.js'

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

function promptText(item) {
  if (!item || typeof item !== 'object') return ''
  const content = Array.isArray(item.content) ? item.content.map((block) => typeof block === 'string' ? block : block?.text || '').filter(Boolean) : []
  return [item.text, ...content].filter((part) => typeof part === 'string' && part.trim()).join('\n').trim()
}

function findQuestionForMarking(questions = [], wantedKey) {
  const visit = (items, parentKey = '', parentContext = [], numberParts = []) => {
    for (const [index, item] of items.entries()) {
      if (!item || typeof item !== 'object') continue
      const segment = String(item.id || index)
      const key = parentKey ? `${parentKey}.${segment}` : segment
      const number = String(item.number ?? index + 1)
      const context = [...parentContext, promptText(item)].filter(Boolean)
      if (key === wantedKey) return { item, prompt: context.join('\n'), number: [...numberParts, number].join('.') }
      const nested = visit(item.subquestions || [], key, context, [...numberParts, number])
      if (nested) return nested
    }
    return null
  }
  return visit(questions)
}

export async function markPracticeAnswer({ token, paper, questionKey, answer }) {
  if (!token) throw new Error('Your session has expired. Sign in again before marking an answer.')
  const question = findQuestionForMarking(paper.questions || [], questionKey)
  if (!question) throw new Error('Could not find this question in the paper.')
  const response = await fetch(MARKING_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      paperId: paper.id == null ? null : String(paper.id),
      paper: { title: paper.title || '', course: paper.course || paper.subject || '', year: paper.year || '' },
      questions: [{
        id: questionKey,
        number: question.number,
        prompt: question.prompt,
        answer,
        maxMarks: Number(question.item.marks || 0),
      }],
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The AI marker could not mark this answer.')
  const marked = (result.results || []).find((item) => item.id === questionKey)
  if (!marked) throw new Error('The AI marker returned no result for this answer.')
  return marked
}
