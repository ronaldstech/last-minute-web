import { API_BASE_URL } from './apiConfig.js'

export async function loadAdminMarking(token, { limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  let response
  try {
    response = await fetch(`${API_BASE_URL}/admin/marking?${params}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error('Could not connect to marking analytics.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not load marking analytics.')
  return result.data || result
}
