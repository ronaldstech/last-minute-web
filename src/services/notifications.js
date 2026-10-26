import { API_BASE_URL } from './apiConfig.js'
import { setDocument } from './firestore.js'

const firestoreBase = 'https://firestore.googleapis.com/v1/projects'
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID

function documentsUrl() {
  if (!projectId) throw new Error('Firebase project is missing. Check VITE_FIREBASE_PROJECT_ID in your .env file.')
  return `${firestoreBase}/${encodeURIComponent(projectId)}/databases/(default)/documents`
}

function authHeaders(idToken) {
  if (!idToken) throw new Error('Sign in to view your notifications.')
  return { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }
}

async function readResponse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = body?.error?.status || body?.error?.message
    throw new Error(code === 'PERMISSION_DENIED'
      ? 'Firestore rules do not allow this account to read notifications.'
      : code || 'Could not complete the notification request.')
  }
  return body
}

function fieldValue(value) {
  if (!value || typeof value !== 'object') return value
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fieldValue)
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, fieldValue(item)]))
  return undefined
}

function parseDocument(document) {
  const fields = Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, fieldValue(value)]))
  return {
    id: document.name.split('/').at(-1),
    title: fields.title || 'Notification',
    body: fields.body || fields.message || '',
    kind: normalizeKind(fields.kind || fields.type),
    userId: fields.userId || '',
    createdAt: fields.createdAt ? new Date(fields.createdAt) : null,
    details: fields.details && typeof fields.details === 'object' ? fields.details : {},
    readBy: Array.isArray(fields.readBy) ? fields.readBy : [],
    actionStatus: fields.actionStatus || null,
  }
}

function normalizeKind(kind) {
  const normalized = String(kind || '').trim().toLowerCase()
  if (['success', 'paid', 'payment'].includes(normalized)) return 'success'
  if (['warning', 'alert', 'failed', 'error'].includes(normalized)) return 'warning'
  return 'info'
}

async function mysqlRequest(path, session, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${session.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Could not complete the notification request.')
  return result
}

export async function fetchNotifications(session, userId) {
  if (session?.authProvider === 'php-mysql') {
    const result = await mysqlRequest('/notifications', session)
    return (result.notifications || []).map((notification) => ({
      ...notification,
      kind: normalizeKind(notification.kind),
      createdAt: notification.createdAt ? new Date(notification.createdAt.replace?.(' ', 'T') || notification.createdAt) : null,
      readBy: notification.read ? [userId] : [],
      details: notification.details || {},
    }))
  }
  const idToken = session?.idToken
  const url = `${documentsUrl()}/notifications?pageSize=50&orderBy=${encodeURIComponent('createdAt desc')}`
  const response = await fetch(url, { headers: authHeaders(idToken) })
  const result = await readResponse(response)
  return (result.documents || [])
    .map(parseDocument)
    .filter((notification) => !notification.userId || notification.userId.toLowerCase() === 'all' || notification.userId === userId)
    .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
}

export async function markNotificationsRead(session, userId, notifications) {
  if (!notifications.length) return
  if (session?.authProvider === 'php-mysql') {
    await mysqlRequest('/notifications/read', session, { ids: notifications.map((notification) => notification.id) })
    return
  }
  const idToken = session?.idToken
  const writes = notifications.map((notification) => ({
    transform: {
      document: `${documentsUrl()}/notifications/${encodeURIComponent(notification.id)}`,
      fieldTransforms: [{
        fieldPath: 'readBy',
        appendMissingElements: { values: [{ stringValue: userId }] },
      }],
    },
  }))
  const response = await fetch(`${documentsUrl()}:commit`, {
    method: 'POST',
    headers: authHeaders(idToken),
    body: JSON.stringify({ writes }),
  })
  await readResponse(response)
}

export async function createAdminNotification(session, notification) {
  if (session?.authProvider === 'php-mysql') {
    return mysqlRequest('/admin/notifications', session, notification)
  }
  const id = `admin-${crypto.randomUUID().replaceAll('-', '')}`
  return setDocument(session.idToken, `notifications/${id}`, {
    title: notification.title, body: notification.body, kind: notification.kind,
    userId: notification.audience === 'all' ? 'all' : notification.userId,
    createdBy: session.userId, createdAt: new Date(), readBy: [], details: {},
  })
}
