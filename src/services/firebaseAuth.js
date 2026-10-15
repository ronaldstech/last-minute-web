export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
const identityToolkitUrl = 'https://identitytoolkit.googleapis.com/v1/accounts'

function authUrl(method) {
  if (!firebaseConfig.apiKey) throw new Error('Firebase is not configured. Check the VITE_FIREBASE_API_KEY setting in your .env file.')
  return `${identityToolkitUrl}:${method}?key=${encodeURIComponent(firebaseConfig.apiKey)}`
}

async function request(method, body) {
  const response = await fetch(authUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(firebaseErrorMessage(data?.error?.message))
  return data
}

function firebaseErrorMessage(code = '') {
  const errors = {
    'EMAIL_NOT_FOUND': 'The email or password is incorrect.',
    'INVALID_LOGIN_CREDENTIALS': 'The email or password is incorrect.',
    'INVALID_PASSWORD': 'The email or password is incorrect.',
    'USER_DISABLED': 'This account has been disabled.',
    'EMAIL_EXISTS': 'An account already exists for this email.',
    'WEAK_PASSWORD': 'Choose a stronger password with at least 6 characters.',
    'INVALID_EMAIL': 'Enter a valid email address.',
    'TOO_MANY_ATTEMPTS_TRY_LATER': 'Too many attempts. Wait a moment and try again.',
    'OPERATION_NOT_ALLOWED': 'Email and password sign-in is not enabled in Firebase.',
    'API_KEY_INVALID': 'The Firebase API key in .env is invalid.',
  }
  return errors[code] || (code ? code.replaceAll('_', ' ').toLowerCase() : 'Authentication failed. Please try again.')
}

export async function signInWithEmail(email, password) {
  const result = await request('signInWithPassword', { email: email.trim(), password, returnSecureToken: true })
  return sessionFrom(result)
}

export async function createAccount({ name, email, password }) {
  const result = await request('signUp', { email: email.trim(), password, returnSecureToken: true })
  try {
    await request('update', { idToken: result.idToken, displayName: name.trim(), returnSecureToken: true })
  } catch {
    // Keep the account session if profile-name synchronization is temporarily unavailable.
  }
  return { ...sessionFrom(result), name: name.trim() }
}

export async function sendPasswordReset(email) {
  await request('sendOobCode', { requestType: 'PASSWORD_RESET', email: email.trim() })
}

export function saveSession(session) {
  localStorage.setItem('last-minute-session', JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem('last-minute-session')
}

export async function restoreSession() {
  let session
  try {
    session = JSON.parse(localStorage.getItem('last-minute-session') || 'null')
  } catch {
    clearSession()
    return null
  }
  if (!session?.idToken || !session.refreshToken) return null
  if (session.expiresAt > Date.now() + 5 * 60_000) return session

  try {
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }),
    })
    const result = await response.json()
    if (!response.ok) {
      const reason = result?.error?.message || ''
      if (['TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'USER_DISABLED', 'USER_NOT_FOUND'].some((code) => reason.includes(code))) {
        clearSession()
        return null
      }
      // Keep the saved session through transient outages, rate limits, or API configuration errors.
      return session
    }
    const refreshed = {
      ...session,
      idToken: result.id_token,
      refreshToken: result.refresh_token,
      expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
      userId: result.user_id || session.userId,
    }
    saveSession(refreshed)
    return refreshed
  } catch {
    return session
  }
}

export async function refreshSession(session) {
  if (!session?.refreshToken || session.expiresAt > Date.now() + 5 * 60_000) return session
  try {
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }),
    })
    const result = await response.json()
    if (!response.ok) {
      const reason = result?.error?.message || ''
      if (['TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'USER_DISABLED', 'USER_NOT_FOUND'].some((code) => reason.includes(code))) {
        clearSession()
        return null
      }
      return session
    }
    const refreshed = {
      ...session,
      idToken: result.id_token,
      refreshToken: result.refresh_token,
      expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
      userId: result.user_id || session.userId,
    }
    saveSession(refreshed)
    return refreshed
  } catch {
    return session
  }
}

function sessionFrom(result) {
  return {
    idToken: result.idToken,
    refreshToken: result.refreshToken,
    expiresAt: Date.now() + Number(result.expiresIn || 3600) * 1000,
    userId: result.localId,
    email: result.email,
    name: result.displayName || '',
  }
}
