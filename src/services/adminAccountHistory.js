import { API_BASE_URL } from './apiConfig.js'

export async function loadAdminAccountHistory(token) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/admin/account-history?request=${Date.now()}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error('Could not connect to account history analytics.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.message || 'Could not load account history analytics.')
    error.status = response.status
    throw error
  }
  return result.data || result
}
