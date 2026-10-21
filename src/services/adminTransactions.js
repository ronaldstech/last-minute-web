import { API_BASE_URL } from './apiConfig.js'

export async function listAdminTransactions(token, cursor = '') {
  const params = new URLSearchParams({ limit: '50' })
  if (cursor) params.set('cursor', cursor)
  let response
  try {
    response = await fetch(`${API_BASE_URL}/admin/transactions?${params}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error('Could not connect to transaction history.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.message || 'Could not load transactions.')
    error.status = response.status
    throw error
  }
  const data = result.data || result
  return { documents: data.transactions || [], nextPageToken: data.nextCursor || '', totalCount: Number(data.totalCount || 0) }
}
