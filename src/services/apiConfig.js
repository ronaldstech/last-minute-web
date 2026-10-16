const productionRoot = '/rt/last_minute'
const defaultApiBase = `${import.meta.env.DEV ? '' : productionRoot}/backend/public`

// Vercel can set this to the Hostinger backend URL, for example:
// https://apexspacemw.com/rt/last_minute/backend/public
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || defaultApiBase).replace(/\/$/, '')
export const MARKING_API_URL = import.meta.env.VITE_MARKING_API_URL || `${API_BASE_URL}/marking.php`
