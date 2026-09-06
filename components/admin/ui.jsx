'use client'

import { STATUS_META, MODE_META, SEGMENT_META, PAYMENT_STATUS_META } from '@/lib/client'

export const ROLE_TRANSITIONS = {
  owner: '*',
  manager: '*',
  kitchen: ['ACCEPTED', 'REJECTED', 'PREPARING', 'READY'],
  delivery: ['OUT_FOR_DELIVERY', 'DELIVERED'],
}
export const canRole = (role, to) => {
  const r = ROLE_TRANSITIONS[role]
  return r === '*' || (Array.isArray(r) && r.includes(to))
}
export const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', kitchen: 'Kitchen staff', delivery: 'Delivery staff' }

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'default' }) {
  const tones = { default: 'text-foreground', good: 'text-emerald-700', bad: 'text-rose-700', warn: 'text-amber-700' }
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className={`mt-2 text-2xl font-bold tracking-tight ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

export function StatusBadge({ status, className = '' }) {
  const m = STATUS_META[status] || { label: status, badge: 'bg-muted text-foreground border-border', dot: 'bg-current' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${m.badge} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  )
}
export function PaymentBadge({ status, method }) {
  const m = PAYMENT_STATUS_META[status] || { label: status, badge: 'bg-muted' }
  const label = status === 'PENDING' && method === 'COD' ? 'Pay on delivery' : m.label
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${m.badge}`}>{label}</span>
}
export function ModeChip({ mode, extra }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
      {MODE_META[mode]?.label || mode}{extra ? ` · ${extra}` : ''}
    </span>
  )
}
export function SegmentBadge({ segment }) {
  const m = SEGMENT_META[segment] || { label: segment, badge: 'bg-muted' }
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${m.badge}`}>{m.label}</span>
}

export function Empty({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <div className="font-semibold">{title}</div>
      {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

export function fulfilmentLabel(order) {
  if (order.mode === 'DINE_IN') return `Table ${order.table_number || '?'}`
  if (order.mode === 'ROOM_SERVICE') return `Room ${order.room_number || '?'}`
  if (order.mode === 'DELIVERY') return [order.address?.line1, order.address?.line2, order.address?.city].filter(Boolean).join(', ')
  return 'Pickup at counter'
}

export function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.value = 0.06
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.frequency.setValueAtTime(1175, ctx.currentTime + 0.12)
    o.stop(ctx.currentTime + 0.28)
  } catch {}
}
