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

function accessiblePricing(pricing = {}, isSuperAdmin = false) {
  const values = { daily: 20, weekly: 100, practiceMarkingPerQuestion: 2, ...pricing }
  return isSuperAdmin ? { ...values, daily: 0, weekly: 0, practiceMarkingPerQuestion: 0 } : values
}

export async function listStudentPapers(token) {
  const result = await request('/papers', token)
  const isSuperAdmin = Boolean(result.isSuperAdmin)
  const unlockPricing = accessiblePricing(result.unlockPricing, isSuperAdmin)
  return (result.papers || []).map((paper) => ({ ...paper, isSuperAdmin, unlockPricing }))
}

export async function getStudentPaper(token, paperId) {
  const result = await request(`/papers/detail?id=${encodeURIComponent(paperId)}`, token)
  const isSuperAdmin = Boolean(result.isSuperAdmin)
  return { ...result.paper, isSuperAdmin, unlockPricing: accessiblePricing(result.unlockPricing, isSuperAdmin) }
}

export async function saveStudentPaper(token, paperId, saved) {
  return request(`/papers/saved?id=${encodeURIComponent(paperId)}`, token, { method: saved ? 'POST' : 'DELETE' })
}

export async function unlockStudentPaper(token, paperId, durationDays = 1) {
  const result = await request(`/papers/unlock?id=${encodeURIComponent(paperId)}`, token, { method: 'POST', body: { durationDays } })
  const isSuperAdmin = Boolean(result.isSuperAdmin)
  return { ...result, paper: { ...result.paper, isSuperAdmin, unlockPricing: accessiblePricing(result.unlockPricing, isSuperAdmin) } }
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

export async function markPracticeAnswer({ token, paper, questionKey, answer, images = [] }) {
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
        images: images.map((image) => image.dataUrl),
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

function discussionItemText(item) {
  if (!item || typeof item !== 'object') return ''
  const blocks = Array.isArray(item.content) ? item.content.map((block) => {
    if (typeof block === 'string') return block
    if (!block || typeof block !== 'object') return ''
    if (block.type === 'code') return block.code || ''
    if (block.type === 'bullet_list') return (block.items || []).map((entry) => `• ${entry}`).join('\n')
    if (block.type === 'table') return [block.title, (block.columns || []).join(' | '), ...(block.rows || []).map((row) => row.join(' | '))].filter(Boolean).join('\n')
    if (block.type === 'image') return [block.caption, block.path].filter(Boolean).join(' ')
    return block.text || block.title || ''
  }).filter(Boolean) : []
  return (blocks.length ? blocks.join('\n') : item.text || '').trim()
}

export async function markGroupDiscussionAnswers({ token, plan, question, responses, group }) {
  if (!token) throw new Error('Your session has expired. Sign in again before marking answers.')
  if (!responses?.length) throw new Error('There are no group responses to mark yet.')
  const prompt = [
    ...(question.context || []).map((context) => `${context.number || 'Additional information'}: ${discussionItemText(context)}`),
    `${question.number ? `Question ${question.number}: ` : ''}${discussionItemText(question)}`,
  ].filter(Boolean).join('\n\n')
  const paper = {
    title: plan.paperTitle || 'Group discussion',
    course: plan.course || '',
    year: plan.year || '',
  }
  const response = await fetch(MARKING_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      paperId: plan.paperId == null ? null : String(plan.paperId),
      paper,
      sourceType: 'group_discussion',
      groupId: group?.id == null ? null : String(group.id),
      groupName: group?.name || '',
      discussionId: plan.id == null ? null : String(plan.id),
      questions: responses.map((entry) => ({
        id: String(entry.id),
        number: question.number || '',
        prompt,
        answer: entry.text === 'Pass' ? '' : entry.text,
        maxMarks: Number(question.marks || 0),
      })),
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The AI marker could not mark these group responses.')
  if (!Array.isArray(result.results) || result.results.length !== responses.length) {
    throw new Error('The AI marker did not return a result for every group response.')
  }
  return result.results
}
