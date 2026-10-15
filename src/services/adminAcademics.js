const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/backend/public').replace(/\/$/, '')

async function request(path, token, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not complete the academic structure request.')
  return result
}

export async function listAcademicRecords(token, type, parentId = '') {
  const params = new URLSearchParams({ type })
  if (parentId) params.set('parentId', parentId)
  const result = await request(`/admin/academics?${params}`, token)
  return result.records || []
}

export async function listAcademicCatalog(token, type, parentId = '') {
  const params = new URLSearchParams({ type })
  if (parentId) params.set('parentId', parentId)
  const result = await request(`/academics?${params}`, token)
  return result.records || []
}

export async function createAcademicRecord(token, type, name, alias = '', parentId = '') {
  const result = await request('/admin/academics', token, { method: 'POST', body: { type, name, alias, parentId } })
  return result.record
}
