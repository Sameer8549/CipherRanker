const CATALYST_API_BASE = 'https://cipherranker-50043309761.development.catalystappsail.in'

export const API_BASE = String(
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? CATALYST_API_BASE : '')
).replace(/\/$/, '')

export const apiUrl = path => `${API_BASE}${path}`
