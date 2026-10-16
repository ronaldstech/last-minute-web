const productionRoot = '/rt/last_minute'

const configuredApiBase = import.meta.env.VITE_API_BASE_URL
const defaultApiBase = `${import.meta.env.DEV ? '' : productionRoot}/backend/public`

// Local .env files commonly use /backend/public for development. When building
// for the site's subdirectory, keep that override under the production root.
const apiBase = import.meta.env.PROD && configuredApiBase?.startsWith('/backend/')
  ? `${productionRoot}${configuredApiBase}`
  : configuredApiBase || defaultApiBase

const configuredMarkingUrl = import.meta.env.VITE_MARKING_API_URL
const defaultMarkingUrl = `${import.meta.env.DEV ? '' : productionRoot}/backend/public/marking.php`
const markingUrl = import.meta.env.PROD && configuredMarkingUrl?.startsWith('/backend/')
  ? `${productionRoot}${configuredMarkingUrl}`
  : configuredMarkingUrl || defaultMarkingUrl

export const API_BASE_URL = apiBase.replace(/\/$/, '')
export const MARKING_API_URL = markingUrl
