export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const clean = (doc) => {
  if (!doc) return doc
  const { _id, ...rest } = doc
  return rest
}
export const cleanAll = (arr = []) => arr.map(clean)

export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  return digits
}

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isHexColor(s) {
  return /^#([0-9a-fA-F]{6})$/.test(String(s || ''))
}

// --- timezone helpers (no external deps) ---
function tzOffsetMs(tz, date = new Date()) {
  try {
    const local = new Date(date.toLocaleString('en-US', { timeZone: tz }))
    const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
    return local - utc
  } catch {
    return 0
  }
}
export function startOfDayTz(tz, date = new Date()) {
  const off = tzOffsetMs(tz, date)
  const shifted = new Date(date.getTime() + off)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - off)
}
export function dayKeyTz(tz, date) {
  const off = tzOffsetMs(tz, date)
  return new Date(date.getTime() + off).toISOString().slice(0, 10)
}
export function daysAgo(n, from = new Date()) {
  return new Date(from.getTime() - n * 24 * 60 * 60 * 1000)
}
