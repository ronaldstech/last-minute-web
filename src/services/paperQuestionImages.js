import { API_BASE_URL } from './apiConfig.js'

const MAX_BYTES = 10 * 1024 * 1024
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

async function optimizeImage(file) {
  if (file.size <= 2 * 1024 * 1024 || typeof createImageBitmap !== 'function') return file
  let bitmap
  try { bitmap = await createImageBitmap(file) } catch { return file }
  try {
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.9, 0.82, 0.74]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
      if (!blob) break
      if (blob.size <= 2 * 1024 * 1024 || quality === 0.74) return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp', lastModified: Date.now() })
      if (blob.size >= file.size) break
    }
    return file
  } finally { bitmap.close() }
}

function uploadRequest(url, { headers, body, onProgress }) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', url)
    request.timeout = 120_000
    Object.entries(headers || {}).forEach(([name, value]) => request.setRequestHeader(name, value))
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100)) }
    request.onload = () => {
      let result = {}
      try { result = JSON.parse(request.responseText || '{}') } catch { /* handled as a server error below */ }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(result.message || result.error?.message || `Image upload failed (${request.status}).`))
        return
      }
      resolve(result)
    }
    request.onerror = () => reject(new Error('Could not reach image storage. Check your connection and try again.'))
    request.ontimeout = () => reject(new Error('Image upload timed out after 2 minutes. Check your connection and retry.'))
    request.onabort = () => reject(new Error('Image upload was cancelled.'))
    request.send(body)
  })
}

export async function uploadPaperQuestionImage(session, file, onProgress) {
  if (!file) throw new Error('Choose an image to upload.')
  if (!allowedTypes.has(file.type)) throw new Error('Use a JPEG, PNG, WebP, or GIF image.')
  if (file.size > MAX_BYTES) throw new Error('Images must be 10 MB or smaller.')
  const uploadFile = await optimizeImage(file)
  const form = new FormData()
  form.append('image', uploadFile)
  const token = session.authProvider === 'php-mysql' ? session.token : ''
  if (!token) throw new Error('Image uploads require an administrator session from the PHP backend. Sign in with your PHP account and try again.')
  const result = await uploadRequest(`${API_BASE_URL}/admin/paper-question-images`, { headers: { Authorization: `Bearer ${token}` }, body: form, onProgress })
  if (!result.url) throw new Error('Image storage did not return an image URL.')
  return `${API_BASE_URL}${result.url}`
}
