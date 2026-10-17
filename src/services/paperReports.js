import { API_BASE_URL } from './apiConfig.js'
import { queryCollection, setDocument } from './firestore.js'

const CATEGORIES = ['Incorrect content', 'Missing content', 'Wrong paper details', 'Formatting issue', 'Other']

async function request(path, token, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not complete the paper report request.')
  return result
}

export async function submitPaperReport(session, paper, category, details) {
  if (!CATEGORIES.includes(category)) throw new Error('Choose a report category.')
  const cleanDetails = String(details || '').trim()
  if (!cleanDetails || cleanDetails.length > 2000) throw new Error('Describe the issue in 1 to 2000 characters.')
  if (session.authProvider === 'php-mysql') {
    const result = await request('/papers/reports', session.token, { method: 'POST', body: { paperId: String(paper.id), category, details: cleanDetails } })
    return result.report
  }
  const reportId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const report = {
    paperId: String(paper.id),
    paperTitle: paper.title || 'Untitled paper',
    course: paper.course || '',
    reporterId: String(session.userId || ''),
    reporterName: session.name || '',
    category,
    details: cleanDetails,
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  await setDocument(session.idToken, `paperReports/${reportId}`, report)
  return { id: reportId, ...report }
}

export async function listPaperReports(session, paperId) {
  if (session.authProvider === 'php-mysql') {
    const result = await request(`/papers/reports?paperId=${encodeURIComponent(paperId)}`, session.token)
    return result.reports || []
  }
  const reports = await queryCollection(session.idToken, 'paperReports', 'paperId', 'EQUAL', String(paperId))
  return reports.sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
}

export async function listAdminPaperReports(token, { cursor = '', limit = 25 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  const result = await request(`/admin/paper-reports?${params}`, token)
  return { documents: result.reports || [], nextPageToken: result.nextCursor || '' }
}

export async function updateAdminPaperReport(token, id, status) {
  const result = await request(`/admin/paper-reports?id=${encodeURIComponent(id)}`, token, { method: 'PATCH', body: { status } })
  return result.report
}
