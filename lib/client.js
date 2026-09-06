// Browser-side helpers shared by customer, admin and platform apps.

export async function api(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  })
  let data = null
  try {
    data = await res.json()
  } catch {}
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`)
    err.status = res.status
    err.code = data?.code
    err.data = data
    throw err
  }
  return data
}
export const fetcher = (path) => api(path)

export function money(n, currency = 'INR') {
  const v = Number(n) || 0
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v)
  } catch {
    return `₹${v}`
  }
}

export function timeAgo(date) {
  if (!date) return ''
  const diff = (Date.now() - new Date(date).getTime()) / 1000
  if (diff < 45) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
export function fmtDateTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
export function fmtTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

export const MODE_META = {
  DELIVERY: { label: 'Delivery', short: 'Delivery', hint: 'Delivered to your door' },
  PICKUP: { label: 'Pickup', short: 'Pickup', hint: 'Collect from the counter' },
  DINE_IN: { label: 'Dine-in', short: 'Table', hint: 'Served at your table' },
  ROOM_SERVICE: { label: 'Room service', short: 'Room', hint: 'Delivered to your room' },
}

export const STATUS_META = {
  PAYMENT_PENDING: { label: 'Payment pending', badge: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  PAID: { label: 'Paid', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  ORDER_PLACED: { label: 'New', badge: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  ACCEPTED: { label: 'Accepted', badge: 'bg-sky-50 text-sky-800 border-sky-200', dot: 'bg-sky-500' },
  PREPARING: { label: 'Preparing', badge: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
  READY: { label: 'Ready', badge: 'bg-violet-50 text-violet-800 border-violet-200', dot: 'bg-violet-500' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', badge: 'bg-indigo-50 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500' },
  DELIVERED: { label: 'Delivered', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  PAYMENT_FAILED: { label: 'Payment failed', badge: 'bg-rose-50 text-rose-800 border-rose-200', dot: 'bg-rose-500' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-50 text-rose-800 border-rose-200', dot: 'bg-rose-500' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
  REFUND_PENDING: { label: 'Refund pending', badge: 'bg-orange-50 text-orange-800 border-orange-200', dot: 'bg-orange-500' },
  REFUNDED: { label: 'Refunded', badge: 'bg-teal-50 text-teal-800 border-teal-200', dot: 'bg-teal-500' },
}

export const PAYMENT_STATUS_META = {
  PENDING: { label: 'Pay on delivery', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  PAID: { label: 'Paid', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  FAILED: { label: 'Failed', badge: 'bg-rose-50 text-rose-800 border-rose-200' },
  VOID: { label: 'No charge', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  REFUND_PENDING: { label: 'Refund pending', badge: 'bg-orange-50 text-orange-800 border-orange-200' },
  REFUNDED: { label: 'Refunded', badge: 'bg-teal-50 text-teal-800 border-teal-200' },
}

export const SEGMENT_META = {
  NEW: { label: 'New', badge: 'bg-sky-50 text-sky-800 border-sky-200' },
  RETURNING: { label: 'Returning', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  VIP: { label: 'VIP', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  HIGH_VALUE: { label: 'High value', badge: 'bg-violet-50 text-violet-800 border-violet-200' },
  INACTIVE: { label: 'Inactive', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
}

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 31, g: 111, b: 95 }
}
export function readableOn(hex) {
  const { r, g, b } = hexToRgb(hex)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#111111' : '#ffffff'
}
export function applyBrand(tenant) {
  if (typeof document === 'undefined' || !tenant) return
  const root = document.documentElement
  const brand = tenant.primary_color || '#1F6F5F'
  root.style.setProperty('--brand', brand)
  root.style.setProperty('--brand-fg', readableOn(brand))
  root.style.setProperty('--brand-soft', `${brand}14`)
  root.style.setProperty('--brand-secondary', tenant.secondary_color || '#F4EDE4')
}

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}
