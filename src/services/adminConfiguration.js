import { API_BASE_URL } from './apiConfig.js'

async function request(token, method = 'GET', configuration) {
  const response = await fetch(`${API_BASE_URL}/admin/configuration`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(configuration ? { 'Content-Type': 'application/json' } : {}) },
    ...(configuration ? { body: JSON.stringify(configuration) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not load app configuration.')
  return result.configuration || {}
}

export const getAdminConfiguration = (token) => request(token)
export const saveAdminConfiguration = (token, configuration) => request(token, 'PATCH', configuration)
