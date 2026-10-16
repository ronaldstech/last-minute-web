import { API_BASE_URL } from './apiConfig.js'

async function request(path, token, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not complete the paper library request.')
  return result
}

export async function listAdminPapers(token, { cursor = '', limit = 40 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  const result = await request(`/admin/papers?${params}`, token)
  return { documents: result.papers || [], nextPageToken: result.nextCursor || '' }
}

export async function getAdminPaper(token, id) {
  const result = await request(`/admin/papers?id=${encodeURIComponent(id)}`, token)
  return result.paper
}

export async function saveAdminPaper(token, paper, id = '') {
  const result = await request(id ? `/admin/papers?id=${encodeURIComponent(id)}` : '/admin/papers', token, {
    method: id ? 'PATCH' : 'POST',
    body: paper,
  })
  return result.paper
}

export async function deleteAdminPaper(token, id) {
  return request(`/admin/papers?id=${encodeURIComponent(id)}`, token, { method: 'DELETE' })
}
