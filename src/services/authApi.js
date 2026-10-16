import { API_BASE_URL } from './apiConfig.js'
const SESSION_KEY = 'last-minute-session'

async function apiRequest(path, { token, method = 'POST', body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not connect to the Last Minute account service.')
  return result
}

function makeSession(result) {
  const user = result.user
  return {
    authProvider: 'php-mysql',
    token: result.token,
    expiresAt: Number(result.expiresAt),
    userId: String(user.id),
    email: user.email,
    name: user.username,
    profile: user,
  }
}

export async function signInWithEmail(email, password) {
  return makeSession(await apiRequest('/auth/login', { body: { email: email.trim(), password } }))
}

export async function createAccount({ name, email, phone, password }) {
  return makeSession(await apiRequest('/auth/register', { body: { name: name.trim(), email: email.trim(), phone: phone.trim(), password } }))
}

export async function sendPasswordReset() {
  throw new Error('Password reset is not connected yet. Contact support to recover your account.')
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export async function restoreSession() {
  let session
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    clearSession()
    return null
  }
  if (!session?.token || session.authProvider !== 'php-mysql' || session.expiresAt <= Date.now()) {
    clearSession()
    return null
  }
  try {
    const result = await apiRequest('/auth/me', { method: 'GET', token: session.token })
    const restored = { ...session, profile: result.user, name: result.user.username }
    saveSession(restored)
    return restored
  } catch (error) {
    if (error.message === 'Your session has expired. Sign in again.') {
      clearSession()
      return null
    }
    return session
  }
}

export async function signOut(session) {
  try {
    if (session?.token) await apiRequest('/auth/logout', { token: session.token })
  } catch {
    // The local session still needs to end if the API is offline.
  } finally {
    clearSession()
  }
}

export async function updateAccountProfile(token, profile) {
  return apiRequest('/profile', { method: 'PATCH', token, body: profile })
}
