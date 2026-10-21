import { API_BASE_URL } from './apiConfig.js'

export async function listAdminGroups(token) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/admin/groups`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error('Could not connect to group administration.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not load study groups.')
  return result.data?.groups || result.groups || []
}

export async function getAdminGroupDetails(token, groupId) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/admin/groups/details?groupId=${encodeURIComponent(groupId)}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error('Could not connect to group administration.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not load group details.')
  return result.data?.group || result.group
}
