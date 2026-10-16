import { API_BASE_URL } from './apiConfig.js'

async function request(path, token, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not complete the admin user request.')
  return result
}

export async function listAdminUsers(token, { search = '', cursor = '' } = {}) {
  const params = new URLSearchParams({ limit: '40' })
  if (search.trim()) params.set('search', search.trim())
  if (cursor) params.set('cursor', cursor)
  const result = await request(`/admin/users?${params}`, token)
  return { documents: result.users || [], nextPageToken: result.nextCursor || '' }
}

export async function updateAdminUser(token, userId, changes) {
  const result = await request(`/admin/users?id=${encodeURIComponent(userId)}`, token, { method: 'PATCH', body: changes })
  return result.user
}

export async function giftAdminUserCoins(token, userId, amount) {
  const result = await request(`/admin/users/gift?id=${encodeURIComponent(userId)}`, token, { method: 'POST', body: { amount } })
  return result.user
}
