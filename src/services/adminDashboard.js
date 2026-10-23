import { API_BASE_URL } from './apiConfig.js'

export async function getAdminDashboardSummary(token) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/admin/dashboard`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error('Could not connect to the admin dashboard.')
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not load the admin dashboard.')
  return result.data?.summary || result.summary || {}
}
