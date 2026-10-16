import { API_BASE_URL } from './apiConfig.js'

async function request(path, token, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new Error('Could not connect to your online wallet. Check your connection and try again.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'The wallet service could not complete the request.')
  return result
}

export async function loadWallet(token) {
  const result = await request('/wallet', token)
  return { user: result.user, transactions: result.transactions || [] }
}

export async function loadWalletOperators(token) {
  const result = await request('/wallet/operators', token)
  return result.operators || []
}

export async function createWalletTransaction(token, { packId, operatorId, operatorName, mobile }) {
  const result = await request('/wallet/transactions', token, {
    method: 'POST', body: { packId, operatorId, operatorName, mobile },
  })
  return result.transaction
}

export async function verifyWalletTransaction(token, chargeId) {
  return request('/wallet/transactions/verify', token, { method: 'POST', body: { chargeId } })
}
