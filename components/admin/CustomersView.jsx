'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useTenant } from '@/components/shared/TenantProvider'
import { fetcher, money, timeAgo, fmtDateTime, SEGMENT_META } from '@/lib/client'
import { PageHeader, StatCard, SegmentBadge, StatusBadge, ModeChip, Empty } from './ui'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Search, Phone, Mail, MapPin } from 'lucide-react'

const SEGMENTS = ['NEW', 'RETURNING', 'VIP', 'HIGH_VALUE', 'INACTIVE']

function CustomerSheet({ id, onClose }) {
  const { tenant } = useTenant()
  const { data } = useSWR(id ? `/admin/customers/${id}` : null, fetcher)
  const c = data?.customer
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {!c ? <div className="text-sm text-muted-foreground">Loading…</div> : (
          <div>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-brand text-brand-foreground font-bold text-lg flex items-center justify-center">{(c.name || '?')[0]?.toUpperCase()}</div>
                <div><SheetTitle>{c.name || 'Guest'}</SheetTitle><SheetDescription className="flex items-center gap-2"><SegmentBadge segment={c.segment} /><span>Customer since {fmtDateTime(c.created_at)}</span></SheetDescription></div>
              </div>
            </SheetHeader>
            <div className="mt-4 space-y-2 text-sm">
              <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-brand"><Phone className="h-4 w-4" />{c.phone}</a>
              {c.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" />{c.email}</div>}
              {c.addresses?.map((a) => <div key={a.id} className="flex items-start gap-2 text-muted-foreground"><MapPin className="h-4 w-4 mt-0.5" /><span>{a.label}: {[a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', ')}</span></div>)}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[['Orders', c.stats.total_orders], ['Spent', money(c.stats.total_spent, tenant.currency)], ['Avg order', money(c.stats.avg_order_value, tenant.currency)]].map(([l, v]) => <div key={l} className="rounded-lg bg-muted/60 p-3 text-center"><div className="text-lg font-bold">{v}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>)}
            </div>
            <div className="mt-2 text-xs text-muted-foreground flex justify-between"><span>First order: {c.stats.first_order_at ? fmtDateTime(c.stats.first_order_at) : '—'}</span><span>Last order: {c.stats.last_order_at ? timeAgo(c.stats.last_order_at) : '—'}</span></div>
            {c.favorites?.length > 0 && (
              <div className="mt-5"><h4 className="text-sm font-semibold">Favourites</h4><div className="mt-1.5 flex flex-wrap gap-1.5">{c.favorites.map((f) => <span key={f.name} className="rounded-full bg-brand-soft text-brand px-2.5 py-0.5 text-xs font-medium">{f.name} ×{f.qty}</span>)}</div></div>
            )}
            <div className="mt-5">
              <h4 className="text-sm font-semibold">Order history</h4>
              <div className="mt-1.5 divide-y rounded-lg border">
                {(data.orders || []).map((o) => (
                  <div key={o.id} className="px-3 py-2 text-sm">
                    <div className="flex items-center justify-between"><span className="font-semibold">#{o.order_number}</span><div className="flex items-center gap-2"><span className="font-medium">{money(o.total, tenant.currency)}</span><StatusBadge status={o.status} /></div></div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5"><ModeChip mode={o.mode} />{fmtDateTime(o.created_at)} · {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</div>
                  </div>
                ))}
                {!data.orders?.length && <div className="p-3 text-sm text-muted-foreground">No orders yet.</div>}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function CustomersView() {
  const { tenant } = useTenant()
  const [segment, setSegment] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const params = new URLSearchParams()
  if (segment) params.set('segment', segment)
  if (q.trim()) params.set('q', q.trim())
  const { data } = useSWR(`/admin/customers?${params.toString()}`, fetcher, { keepPreviousData: true })
  const m = data?.metrics

  return (
    <div>
      <PageHeader title="Customers" subtitle="CRM built directly from your ordering data." />
      {m && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-6 mb-5">
          <StatCard label="Total customers" value={m.total_customers} />
          <StatCard label="New (30 days)" value={m.new_30d} tone="good" />
          <StatCard label="Returning" value={m.returning} />
          <StatCard label="Repeat rate" value={`${m.repeat_rate}%`} />
          <StatCard label="Avg order value" value={money(m.avg_order_value, tenant.currency)} />
          <StatCard label="Avg lifetime value" value={money(m.avg_ltv, tenant.currency)} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setSegment('')} className={`rounded-full border px-3 h-8 text-xs font-semibold ${!segment ? 'bg-foreground text-background' : 'bg-card hover:bg-muted'}`}>All</button>
        {SEGMENTS.map((s) => <button key={s} onClick={() => setSegment(s)} className={`rounded-full border px-3 h-8 text-xs font-semibold ${segment === s ? 'bg-foreground text-background' : `bg-card hover:bg-muted`}`}>{SEGMENT_META[s].label} {m?.segments?.[s] ? <span className="opacity-60">{m.segments[s]}</span> : null}</button>)}
        <div className="relative ml-auto"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / phone" className="pl-8 h-8 w-56" /></div>
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_120px_90px_110px_110px_120px] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/40"><span>Customer</span><span>Segment</span><span className="text-right">Orders</span><span className="text-right">Spent</span><span className="text-right">Avg order</span><span className="text-right">Last order</span></div>
        <div className="divide-y">
          {(data?.customers || []).map((c) => (
            <button key={c.id} onClick={() => setOpen(c.id)} className="w-full text-left grid md:grid-cols-[1fr_120px_90px_110px_110px_120px] gap-1 md:gap-3 px-4 py-3 hover:bg-muted/40 items-center" data-testid={`customer-${c.id}`}>
              <div className="flex items-center gap-3 min-w-0"><div className="h-9 w-9 rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center shrink-0">{(c.name || '?')[0]?.toUpperCase()}</div><div className="min-w-0"><div className="text-sm font-medium truncate">{c.name || 'Guest'}</div><div className="text-xs text-muted-foreground">{c.phone}</div></div></div>
              <div><SegmentBadge segment={c.segment} /></div>
              <div className="text-sm md:text-right"><span className="md:hidden text-muted-foreground">Orders: </span>{c.stats.total_orders}</div>
              <div className="text-sm font-semibold md:text-right"><span className="md:hidden text-muted-foreground font-normal">Spent: </span>{money(c.stats.total_spent, tenant.currency)}</div>
              <div className="text-sm md:text-right hidden md:block">{money(c.stats.avg_order_value, tenant.currency)}</div>
              <div className="text-xs text-muted-foreground md:text-right">{c.stats.last_order_at ? timeAgo(c.stats.last_order_at) : 'No orders'}</div>
            </button>
          ))}
          {data && !data.customers.length && <div className="p-6"><Empty title="No customers match" /></div>}
        </div>
      </div>
      <CustomerSheet id={open} onClose={() => setOpen(null)} />
    </div>
  )
}
