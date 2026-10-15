import { firebaseConfig } from './firebaseAuth.js'

const firestoreRoot = 'https://firestore.googleapis.com/v1/projects'
const READ_CACHE_MS = 15_000
const readCache = new Map()
const pendingReads = new Map()

function databaseUrl() {
  if (!firebaseConfig.projectId) throw new Error('Firebase project is missing. Check VITE_FIREBASE_PROJECT_ID in your .env file.')
  return `${firestoreRoot}/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents`
}

function documentPath(path) {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

async function request(path, { token, method = 'GET', body, query = '' } = {}) {
  if (!token) throw new Error('Your sign-in session is missing. Please sign in again.')
  const url = path.startsWith(':') ? `${databaseUrl()}${path}` : `${databaseUrl()}/${documentPath(path)}`
  const fullUrl = `${url}${query}`
  const isRead = method === 'GET' || path === ':runQuery' || path === ':runAggregationQuery'
  const cacheKey = `${token}:${fullUrl}:${body ? JSON.stringify(body) : ''}`
  if (isRead) {
    const cached = readCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.data
    if (pendingReads.has(cacheKey)) return pendingReads.get(cacheKey)
  } else {
    readCache.clear()
  }

  const operation = (async () => {
    let response
    for (let attempt = 0; ; attempt += 1) {
      response = await fetch(fullUrl, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      if (response.status !== 429 || attempt >= 2) break
      const retryAfter = Number(response.headers.get('Retry-After'))
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 500 * (2 ** attempt)))
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const code = data?.error?.status || data?.error?.message || `Firestore request failed (${response.status})`
      const messages = {
        PERMISSION_DENIED: 'Firestore security rules denied access. Check your database rules for this user.',
        UNAUTHENTICATED: 'Your sign-in has expired. Please sign in again.',
        NOT_FOUND: 'That record could not be found.',
      }
      throw new Error(messages[code] || code)
    }
    if (isRead) readCache.set(cacheKey, { data, expiresAt: Date.now() + READ_CACHE_MS })
    return data
  })()
  if (isRead) pendingReads.set(cacheKey, operation)
  try {
    return await operation
  } finally {
    if (isRead) pendingReads.delete(cacheKey)
  }
}

export function decodeValue(value) {
  if (!value || typeof value !== 'object') return value
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue)
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {}
    // Firestore rejects an array directly inside another array. Store such
    // children in a small map so the web app can round-trip the original rows.
    if (fields.__lastMinuteArray?.arrayValue) return decodeValue(fields.__lastMinuteArray)
    return decodeFields(fields)
  }
  if ('geoPointValue' in value) return value.geoPointValue
  if ('referenceValue' in value) return value.referenceValue
  return undefined
}

export function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]))
}

export function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('A paper field contains an invalid number. Check question marks and imported values.')
    // Firestore's REST Value represents int64 values as decimal strings.
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => Array.isArray(item)
    ? { mapValue: { fields: { __lastMinuteArray: encodeValue(item) } } }
    : encodeValue(item)) } }
  return { mapValue: { fields: encodeFields(value) } }
}

export function encodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)]))
}

export function parseDocument(document) {
  return { id: document.name.split('/').at(-1), updateTime: document.updateTime, ...decodeFields(document.fields) }
}

export async function getDocument(token, path) {
  return parseDocument(await request(path, { token }))
}

export async function getOptionalDocument(token, path) {
  try {
    return await getDocument(token, path)
  } catch (error) {
    if (error.message === 'That record could not be found.') return null
    throw error
  }
}

export async function listCollectionPage(token, path, { orderBy, descending = false, pageSize = 100, pageToken = '', fields } = {}) {
  const params = new URLSearchParams({ pageSize: String(pageSize) })
  if (orderBy) params.set('orderBy', `${orderBy}${descending ? ' desc' : ''}`)
  if (pageToken) params.set('pageToken', pageToken)
  fields?.forEach((field) => params.append('mask.fieldPaths', field))
  const page = await request(path, { token, query: `?${params}` })
  return { documents: (page.documents || []).map(parseDocument), nextPageToken: page.nextPageToken || '' }
}

export async function listCollection(token, path, { orderBy, descending = false, pageSize = 250 } = {}) {
  const docs = []
  let pageToken = ''
  do {
    const page = await listCollectionPage(token, path, { orderBy, descending, pageSize, pageToken })
    docs.push(...page.documents)
    pageToken = page.nextPageToken
  } while (pageToken)
  return docs
}

export async function queryCollection(token, collection, field, operation, value) {
  const result = await request(':runQuery', {
    token,
    method: 'POST',
    body: {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: operation, value: encodeValue(value) } },
      },
    },
  })
  return result.filter((item) => item.document).map((item) => parseDocument(item.document))
}

export async function countCollection(token, collection) {
  const result = await request(':runAggregationQuery', {
    token,
    method: 'POST',
    body: {
      structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId: collection }] },
        aggregations: [{ count: {}, alias: 'total' }],
      },
    },
  })
  return Number(result[0]?.result?.aggregateFields?.total?.integerValue || 0)
}

export async function queryCollectionGroupPage(token, collection, { orderBy, descending = false, limit = 50, fields = [] } = {}) {
  const structuredQuery = {
    from: [{ collectionId: collection, allDescendants: true }],
    ...(orderBy ? { orderBy: [{ field: { fieldPath: orderBy }, direction: descending ? 'DESCENDING' : 'ASCENDING' }] } : {}),
    limit,
    ...(fields.length ? { select: { fields: fields.map((fieldPath) => ({ fieldPath })) } } : {}),
  }
  const result = await request(':runQuery', { token, method: 'POST', body: { structuredQuery } })
  return result.filter((item) => item.document).map((item) => parseDocument(item.document))
}

export async function patchDocument(token, path, fields) {
  const mask = Object.keys(fields).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&')
  return request(path, { token, method: 'PATCH', query: `?${mask}`, body: { fields: encodeFields(fields) } })
}

export async function setDocument(token, path, fields) {
  const name = `${databaseUrl()}/${documentPath(path)}`
  const response = await fetch(`${databaseUrl()}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ update: { name, fields: encodeFields(fields) } }] }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = result?.error?.status || result?.error?.message || 'Firestore write failed.'
    const detail = result?.error?.message
    throw new Error(code === 'PERMISSION_DENIED' ? 'Firestore security rules denied this write.' : `${code}${detail && detail !== code ? `: ${detail}` : ''}`)
  }
  readCache.clear()
  return result
}

export async function putDocument(token, path, fields) {
  return request(path, { token, method: 'PATCH', body: { fields: encodeFields(fields) } })
}

export async function deleteDocument(token, path) {
  await request(path, { token, method: 'DELETE' })
}

export async function commitWrites(token, writes) {
  const response = await fetch(`${databaseUrl()}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = result?.error?.status || result?.error?.message || 'Firestore update failed.'
    throw new Error(code === 'PERMISSION_DENIED' ? 'Firestore security rules denied this update.' : code)
  }
  readCache.clear()
  return result
}

export function documentName(path) {
  return `${databaseUrl()}/${documentPath(path)}`
}
