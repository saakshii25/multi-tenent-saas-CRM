'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useTenant } from '@/components/shared/TenantProvider'
import { useOrdersFeed } from './AdminApp'
import { RejectDialog } from './OrdersView'
import { api, MODE_META } from '@/lib/client'
import { canBump } from './ui'
import { Maximize2, Minimize2, Volume2, VolumeX, X, Check, ChefHat, PackageCheck, Bike, Loader2, MapPin, Armchair, BedDouble, Store, StickyNote, ArrowLeft } from 'lucide-react'

const ACTIVE = ['ORDER_PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']
const BAND = { ORDER_PLACED: 'bg-amber-400', ACCEPTED: 'bg-sky-400', PREPARING: 'bg-blue-500', READY: 'bg-violet-500', OUT_FOR_DELIVERY: 'bg-indigo-500' }
const LABEL = { ORDER_PLACED: 'NEW', ACCEPTED: 'ACCEPTED', PREPARING: 'COOKING', READY: 'READY', OUT_FOR_DELIVERY: 'ON THE WAY' }
const MODE_ICON = { DELIVERY: MapPin, PICKUP: Store, DINE_IN: Armchair, ROOM_SERVICE: BedDouble }
const FILTERS = [
  { key: 'all', label: 'All', statuses: ACTIVE },
  { key: 'new', label: 'New', statuses: ['ORDER_PLACED'] },
  { key: 'cooking', label: 'Cooking', statuses: ['ACCEPTED', 'PREPARING'] },
  { key: 'ready', label: 'Ready', statuses: ['READY', 'OUT_FOR_DELIVERY'] },
]

function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}
function elapsed(from, now) {
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000))
  const m = Math.floor(s / 60)
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function nextStep(order, role) {
  const s = order.status
  const ok = (to) => canBump(role, to, order)
  if (s === 'ORDER_PLACED') return ok('ACCEPTED') ? { to: 'ACCEPTED', label: 'Accept', icon: Check } : null
  if (s === 'ACCEPTED') return ok('PREPARING') ? { to: 'PREPARING', label: 'Start cooking', icon: ChefHat } : null
  if (s === 'PREPARING') return ok('READY') ? { to: 'READY', label: 'Ready', icon: PackageCheck } : null
  if (s === 'READY') {
    if (order.mode === 'DELIVERY') return ok('OUT_FOR_DELIVERY') ? { to: 'OUT_FOR_DELIVERY', label: 'Out for delivery', icon: Bike } : { waiting: 'Waiting for rider' }
    const label = order.mode === 'PICKUP' ? 'Picked up' : order.mode === 'DINE_IN' ? 'Served' : 'Delivered to room'
    return ok('DELIVERED') ? { to: 'DELIVERED', label, icon: Check } : { waiting: 'Awaiting handover' }
  }
  if (s === 'OUT_FOR_DELIVERY') return ok('DELIVERED') ? { to: 'DELIVERED', label: 'Delivered', icon: Check } : { waiting: 'With rider' }
  return null
}

function Ticket({ order, role, now, busy, onBump, onReject }) {
  const mins = (now - new Date(order.created_at).getTime()) / 60000
  const urgency = mins >= 20 ? 'text-rose-400' : mins >= 10 ? 'text-amber-300' : 'text-emerald-300'
  const step = nextStep(order, role)
  const Icon = MODE_ICON[order.mode] || Store
  const where = order.table_number ? `Table ${order.table_number}` : order.room_number ? `Room ${order.room_number}` : MODE_META[order.mode]?.label
  return (
    <div className={`flex flex-col rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg ${order.status === 'ORDER_PLACED' ? 'ring-2 ring-amber-400/70' : ''}`} data-testid={`kds-${order.order_number}`}>
      <div className={`h-2 ${BAND[order.status] || 'bg-slate-600'}`} />
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-3xl font-black tracking-tight text-white">#{order.order_number}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-300"><Icon className="h-4 w-4" />{where}<span className="text-slate-500">·</span><span className="truncate max-w-[120px]">{order.customer?.name || 'Guest'}</span></div>
        </div>
        <div className="text-right">
          <div className={`font-mono text-2xl font-bold tabular-nums ${urgency}`}>{elapsed(order.created_at, now)}</div>
          <div className="text-[10px] font-bold tracking-widest text-slate-400">{LABEL[order.status]}</div>
        </div>
      </div>
      <div className="px-4 pb-3 flex-1">
        <ul className="divide-y divide-slate-800">
          {order.items.map((it, i) => (
            <li key={i} className="py-2 flex gap-3">
              <span className="text-2xl font-black text-white w-9 shrink-0 leading-tight">{it.qty}</span>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-white leading-tight">{it.name}</div>
                {(it.variant_name || it.addons?.length) ? <div className="text-sm text-slate-300">{[it.variant_name, ...(it.addons || []).map((a) => `+ ${a.name}`)].filter(Boolean).join(' · ')}</div> : null}
                {it.notes && <div className="mt-0.5 inline-block rounded bg-amber-400/15 px-1.5 py-0.5 text-sm font-medium text-amber-300">“{it.notes}”</div>}
              </div>
            </li>
          ))}
        </ul>
        {order.notes && <div className="mt-2 flex gap-2 rounded-lg bg-amber-400/15 border border-amber-400/30 px-3 py-2 text-sm text-amber-200"><StickyNote className="h-4 w-4 mt-0.5 shrink-0" />{order.notes}</div>}
      </div>
      <div className="p-3 pt-0 flex gap-2">
        {order.status === 'ORDER_PLACED' && canBump(role, 'REJECTED', order) && (
          <button onClick={() => onReject(order)} disabled={busy} className="h-14 w-14 shrink-0 rounded-xl bg-slate-800 text-rose-300 hover:bg-rose-500/20 flex items-center justify-center" aria-label="Reject" data-testid={`kds-reject-${order.order_number}`}><X className="h-6 w-6" /></button>
        )}
        {step?.to ? (
          <button onClick={() => onBump(order, step.to)} disabled={busy} className="flex-1 h-14 rounded-xl bg-white text-slate-950 text-lg font-black tracking-wide hover:bg-emerald-300 active:scale-[0.98] transition flex items-center justify-center gap-2" data-testid={`kds-bump-${order.order_number}`}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <step.icon className="h-5 w-5" />}{step.label.toUpperCase()}
          </button>
        ) : (
          <div className="flex-1 h-14 rounded-xl border border-dashed border-slate-700 text-slate-400 text-sm font-semibold flex items-center justify-center">{step?.waiting || 'No action'}</div>
        )}
      </div>
    </div>
  )
}

export function KitchenDisplay({ user }) {
  const { tenant } = useTenant()
  const feed = useOrdersFeed()
  const now = useNow()
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [fs, setFs] = useState(false)

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  const toggleFs = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.()
  }

  const active = useMemo(() => feed.orders.filter((o) => ACTIVE.includes(o.status)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)), [feed.orders])
  const statuses = FILTERS.find((f) => f.key === filter)?.statuses || ACTIVE
  const tickets = active.filter((o) => statuses.includes(o.status))
  const done = feed.orders.filter((o) => ['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status)).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 8)
  const counts = { new: active.filter((o) => o.status === 'ORDER_PLACED').length, cooking: active.filter((o) => ['ACCEPTED', 'PREPARING'].includes(o.status)).length, ready: active.filter((o) => ['READY', 'OUT_FOR_DELIVERY'].includes(o.status)).length }

  const bump = async (order, status, extra = {}) => {
    setBusyId(order.id)
    try {
      await api(`/admin/orders/${order.id}/status`, { method: 'PATCH', body: { status, ...extra } })
      await feed.refresh()
    } catch (e) {
      toast.error(e.message)
      feed.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="h-14 shrink-0 border-b border-slate-800 px-3 sm:px-4 flex items-center gap-3">
        <Link href="/admin/orders" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white" data-testid="kds-exit"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Exit</span></Link>
        <div className="font-bold truncate">{tenant.business_name} <span className="text-slate-500 font-medium hidden sm:inline">· Kitchen display</span></div>
        <div className="ml-2 flex items-center gap-1 rounded-lg bg-slate-900 p-0.5">
          {FILTERS.map((f) => {
            const n = f.key === 'new' ? counts.new : f.key === 'cooking' ? counts.cooking : f.key === 'ready' ? counts.ready : active.length
            return <button key={f.key} onClick={() => setFilter(f.key)} className={`h-8 px-2.5 rounded-md text-xs font-bold ${filter === f.key ? 'bg-white text-slate-950' : 'text-slate-300 hover:text-white'}`} data-testid={`kds-filter-${f.key}`}>{f.label} <span className={filter === f.key ? 'opacity-60' : 'text-slate-500'}>{n}</span></button>
          })}
        </div>
        <div className="flex-1" />
        <div className={`hidden md:flex items-center gap-1.5 text-xs ${feed.error ? 'text-rose-400' : 'text-emerald-400'}`}><span className={`h-2 w-2 rounded-full ${feed.error ? 'bg-rose-500' : 'bg-emerald-400 animate-pulse'}`} />{feed.error ? 'Reconnecting' : 'Live'}</div>
        <div className="font-mono text-sm text-slate-300 tabular-nums hidden sm:block">{new Date(now).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        <button onClick={() => feed.setMuted(!feed.muted)} className="h-9 w-9 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-300" title="Sound">{feed.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
        <button onClick={toggleFs} className="h-9 w-9 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-300" title="Fullscreen" data-testid="kds-fullscreen">{fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
      </header>

      <main className="flex-1 p-3 sm:p-4">
        {feed.loading ? <div className="text-slate-400">Loading tickets…</div> : tickets.length === 0 ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center">
            <div className="text-6xl">🍽️</div>
            <div className="mt-4 text-2xl font-bold">All caught up</div>
            <div className="text-slate-400">New tickets appear here automatically with a sound.</div>
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {tickets.map((o) => <Ticket key={o.id} order={o} role={user.role} now={now} busy={busyId === o.id} onBump={bump} onReject={setRejecting} />)}
          </div>
        )}
      </main>

      {done.length > 0 && (
        <footer className="shrink-0 border-t border-slate-800 px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 shrink-0">RECENT</span>
          {done.map((o) => <span key={o.id} className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${o.status === 'DELIVERED' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>#{o.order_number} {o.status === 'DELIVERED' ? '✓' : '✕'}</span>)}
        </footer>
      )}

      <RejectDialog order={rejecting} reasons={feed.rejectionReasons} onClose={() => setRejecting(null)} onConfirm={async (order, reason, note) => { await bump(order, 'REJECTED', { reason, note }); setRejecting(null) }} />
    </div>
  )
}
