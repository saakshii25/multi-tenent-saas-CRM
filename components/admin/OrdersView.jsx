'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { useTenant } from '@/components/shared/TenantProvider'
import { useOrdersFeed } from './AdminApp'
import { api, fetcher, money, timeAgo, fmtTime, fmtDateTime, MODE_META } from '@/lib/client'
import { PageHeader, StatusBadge, PaymentBadge, ModeChip, SegmentBadge, Empty, canRole, fulfilmentLabel } from './ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Phone, Check, X, ChefHat, PackageCheck, Bike, Loader2, StickyNote, MapPin, Armchair, BedDouble, Store, ArrowRight } from 'lucide-react'

const COLS = [
  { key: 'new', title: 'New orders', statuses: ['ORDER_PLACED'], head: 'text-amber-800 bg-amber-50 border-amber-200' },
  { key: 'kitchen', title: 'In the kitchen', statuses: ['ACCEPTED', 'PREPARING'], head: 'text-blue-800 bg-blue-50 border-blue-200' },
  { key: 'ready', title: 'Ready & on the way', statuses: ['READY', 'OUT_FOR_DELIVERY'], head: 'text-violet-800 bg-violet-50 border-violet-200' },
]
const DONE = ['DELIVERED', 'CANCELLED', 'REJECTED', 'REFUND_PENDING', 'REFUNDED', 'PAYMENT_FAILED']
const MODE_ICON = { DELIVERY: MapPin, PICKUP: Store, DINE_IN: Armchair, ROOM_SERVICE: BedDouble }

function handedLabel(mode) {
  return mode === 'PICKUP' ? 'Picked up' : mode === 'DINE_IN' ? 'Served' : 'Delivered'
}

function NextActions({ order, role, busy, onAct, onReject, size = 'default' }) {
  const can = (to) => canRole(role, to)
  const btn = (label, to, icon, variant = 'default', extra) => (
    <Button key={to} size={size === 'sm' ? 'sm' : 'default'} variant={variant} disabled={busy} onClick={(e) => { e.stopPropagation(); onAct(order, to, extra) }} className={`${variant === 'default' ? 'bg-brand text-brand-foreground hover:opacity-90' : ''} font-semibold`} data-testid={`act-${to}-${order.order_number}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : icon}{label}
    </Button>
  )
  const s = order.status
  const out = []
  if (s === 'ORDER_PLACED') {
    if (can('REJECTED')) out.push(<Button key="rej" size={size === 'sm' ? 'sm' : 'default'} variant="outline" disabled={busy} onClick={(e) => { e.stopPropagation(); onReject(order) }} className="text-destructive border-destructive/30 hover:bg-destructive/5 font-semibold" data-testid={`act-REJECT-${order.order_number}`}><X className="h-4 w-4 mr-1" />Reject</Button>)
    if (can('ACCEPTED')) out.push(btn('Accept', 'ACCEPTED', <Check className="h-4 w-4 mr-1" />))
  } else if (s === 'ACCEPTED' && can('PREPARING')) out.push(btn('Start preparing', 'PREPARING', <ChefHat className="h-4 w-4 mr-1" />))
  else if (s === 'PREPARING' && can('READY')) out.push(btn('Mark ready', 'READY', <PackageCheck className="h-4 w-4 mr-1" />))
  else if (s === 'READY') {
    if (order.mode === 'DELIVERY' && can('OUT_FOR_DELIVERY')) out.push(btn('Out for delivery', 'OUT_FOR_DELIVERY', <Bike className="h-4 w-4 mr-1" />))
    if (order.mode !== 'DELIVERY' && can('DELIVERED')) out.push(btn(handedLabel(order.mode), 'DELIVERED', <Check className="h-4 w-4 mr-1" />))
  } else if (s === 'OUT_FOR_DELIVERY' && can('DELIVERED')) out.push(btn('Delivered', 'DELIVERED', <Check className="h-4 w-4 mr-1" />))
  else if (s === 'REFUND_PENDING' && can('REFUNDED')) out.push(btn('Mark refunded', 'REFUNDED', null, 'outline'))
  if (!out.length) return null
  return <div className="flex items-center gap-2 flex-wrap">{out}</div>
}

function OrderCard({ order, role, currency, busy, onAct, onReject, onOpen, fresh }) {
  const Icon = MODE_ICON[order.mode] || Store
  return (
    <div onClick={() => onOpen(order.id)} className={`rounded-xl border bg-card p-3.5 cursor-pointer hover:shadow-md transition ${fresh ? 'ring-2 ring-amber-400 new-order-pulse' : ''}`} data-testid={`order-${order.order_number}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2"><span className="font-bold">#{order.order_number}</span><StatusBadge status={order.status} /></div>
          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{MODE_META[order.mode]?.label}{order.table_number ? ` · Table ${order.table_number}` : ''}{order.room_number ? ` · Room ${order.room_number}` : ''} · {timeAgo(order.created_at)}</div>
        </div>
        <div className="text-right"><div className="font-bold">{money(order.total, currency)}</div><PaymentBadge status={order.payment_status} method={order.payment_method} /></div>
      </div>
      <div className="mt-2.5 text-sm space-y-0.5">
        {order.items.map((it, i) => (
          <div key={i} className="flex gap-2"><span className="font-semibold w-6 shrink-0">{it.qty}×</span><span className="flex-1 min-w-0"><span className="font-medium">{it.name}</span>{it.variant_name ? <span className="text-muted-foreground"> · {it.variant_name}</span> : null}{it.addons?.length ? <span className="text-muted-foreground text-xs"> (+{it.addons.map((a) => a.name).join(', ')})</span> : null}{it.notes ? <div className="text-xs text-amber-700 italic">“{it.notes}”</div> : null}</span></div>
        ))}
      </div>
      {order.notes && <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-900 flex gap-1.5"><StickyNote className="h-3.5 w-3.5 mt-0.5 shrink-0" />{order.notes}</div>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground truncate">{order.customer?.name || 'Guest'} · {order.customer?.phone}{order.delivery_assignee_name ? ` · ${order.delivery_assignee_name}` : ''}</div>
        <NextActions order={order} role={role} busy={busy} onAct={onAct} onReject={onReject} size="sm" />
      </div>
    </div>
  )
}

function RejectDialog({ order, reasons, onClose, onConfirm }) {
  const [reason, setReason] = useState(reasons[0] || 'Other')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setReason(reasons[0] || 'Other'); setNote('') }, [order, reasons])
  if (!order) return null
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Reject order #{order.order_number}?</DialogTitle><DialogDescription>The customer will be notified immediately{order.payment_status === 'PAID' ? ' and a refund will be initiated' : ''}.</DialogDescription></DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="gap-1.5">
          {reasons.map((r) => (
            <label key={r} htmlFor={`rr-${r}`} className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm cursor-pointer ${reason === r ? 'border-foreground' : ''}`}><RadioGroupItem value={r} id={`rr-${r}`} />{r}</label>
          ))}
        </RadioGroup>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the customer" className="min-h-[60px] resize-none" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Keep order</Button>
          <Button variant="destructive" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(order, reason, note); setBusy(false) }} data-testid="confirm-reject">{busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Reject order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OrderDetail({ id, user, onClose, onAct, onReject, refreshFeed }) {
  const { tenant } = useTenant()
  const { data, mutate } = useSWR(id ? `/admin/orders/${id}` : null, fetcher, { refreshInterval: 5000 })
  const { data: staffData } = useSWR(user.role !== 'delivery' ? '/admin/staff' : null, fetcher)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const o = data?.order
  const riders = (staffData?.staff || []).filter((s) => s.role === 'delivery' && s.status === 'active')

  const addNote = async () => {
    if (!note.trim()) return
    setBusy(true)
    try { const r = await api(`/admin/orders/${id}/notes`, { method: 'POST', body: { note } }); mutate({ ...data, order: r.order }, false); setNote('') } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const assign = async (staff_user_id) => {
    try { const r = await api(`/admin/orders/${id}/assign`, { method: 'PATCH', body: { staff_user_id } }); mutate({ ...data, order: r.order }, false); refreshFeed(); toast.success('Rider assigned') } catch (e) { toast.error(e.message) }
  }
  const cancel = async () => {
    if (!confirm('Cancel this order? The customer will be notified.')) return
    await onAct(o, 'CANCELLED', { reason: 'Cancelled by restaurant' })
    mutate()
  }

  return (
    <Sheet open={!!id} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        {!o ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : (
          <div>
            <SheetHeader className="p-5 border-b text-left">
              <div className="flex items-center gap-2"><SheetTitle>Order #{o.order_number}</SheetTitle><StatusBadge status={o.status} /></div>
              <SheetDescription>{fmtDateTime(o.created_at)} · {MODE_META[o.mode]?.label} · {o.source === 'QR' ? 'QR order' : 'Web order'}</SheetDescription>
              <div className="pt-2"><NextActions order={o} role={user.role} busy={false} onAct={async (ord, to, extra) => { await onAct(ord, to, extra); mutate() }} onReject={onReject} /></div>
            </SheetHeader>

            <div className="p-5 space-y-5">
              <section className="rounded-xl border p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{o.customer?.name || 'Guest'}</div>
                    <a href={`tel:${o.customer?.phone}`} className="text-sm text-brand inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{o.customer?.phone}</a>
                    {o.customer?.email && <div className="text-xs text-muted-foreground">{o.customer.email}</div>}
                  </div>
                  {data.customer && <div className="text-right"><SegmentBadge segment={data.customer.segment} /><div className="mt-1 text-xs text-muted-foreground">{data.customer.stats?.total_orders || 0} orders · {money(data.customer.stats?.total_spent || 0, tenant.currency)}</div></div>}
                </div>
                <div className="mt-3 text-sm flex items-start gap-2"><ModeChip mode={o.mode} /><span className="text-muted-foreground">{fulfilmentLabel(o)}{o.address?.landmark ? ` (${o.address.landmark})` : ''}</span></div>
                {o.notes && <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-900">Customer note: {o.notes}</div>}
              </section>

              <section>
                <h4 className="text-sm font-semibold mb-1">Items</h4>
                <div className="divide-y">
                  {o.items.map((it, i) => (
                    <div key={i} className="py-2 flex justify-between gap-3 text-sm"><div><span className="font-semibold">{it.qty}×</span> {it.name}{it.variant_name ? ` · ${it.variant_name}` : ''}{it.addons?.length ? <div className="text-xs text-muted-foreground">+ {it.addons.map((a) => a.name).join(', ')}</div> : null}{it.notes ? <div className="text-xs text-amber-700 italic">“{it.notes}”</div> : null}</div><div className="font-medium">{money(it.line_total, tenant.currency)}</div></div>
                  ))}
                </div>
                <div className="mt-2 border-t pt-2 text-sm space-y-1">
                  <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(o.subtotal, tenant.currency)}</span></div>
                  {o.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount {o.coupon_code ? `(${o.coupon_code})` : ''}</span><span>- {money(o.discount, tenant.currency)}</span></div>}
                  {o.tax > 0 && <div className="flex justify-between text-muted-foreground"><span>{o.tax_label || 'Tax'}</span><span>{money(o.tax, tenant.currency)}</span></div>}
                  {o.delivery_fee > 0 && <div className="flex justify-between text-muted-foreground"><span>Delivery</span><span>{money(o.delivery_fee, tenant.currency)}</span></div>}
                  {o.packaging_fee > 0 && <div className="flex justify-between text-muted-foreground"><span>Packaging</span><span>{money(o.packaging_fee, tenant.currency)}</span></div>}
                  <div className="flex justify-between font-bold"><span>Total</span><span>{money(o.total, tenant.currency)}</span></div>
                  <div className="flex justify-between items-center pt-1"><span className="text-muted-foreground">Payment</span><span className="flex items-center gap-2"><span className="text-xs">{o.payment_method === 'COD' ? 'Pay on delivery / counter' : o.payment_method}</span><PaymentBadge status={o.payment_status} method={o.payment_method} /></span></div>
                </div>
              </section>

              {o.mode === 'DELIVERY' && ['owner', 'manager'].includes(user.role) && (
                <section>
                  <h4 className="text-sm font-semibold mb-1">Delivery assignment</h4>
                  {riders.length ? (
                    <Select value={o.delivery_assignee_id || ''} onValueChange={assign}>
                      <SelectTrigger><SelectValue placeholder="Assign a rider" /></SelectTrigger>
                      <SelectContent>{riders.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <p className="text-xs text-muted-foreground">Add delivery staff under Settings → Staff to assign riders.</p>}
                </section>
              )}

              <section>
                <h4 className="text-sm font-semibold mb-1">Timeline</h4>
                <ol className="space-y-2">
                  {(o.status_history || []).map((h, i) => (
                    <li key={i} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><StatusBadge status={h.status} /><span className="text-xs text-muted-foreground">{h.role}{h.note ? ` · ${h.note}` : ''}</span></span><span className="text-xs text-muted-foreground">{fmtTime(h.at)}</span></li>
                  ))}
                </ol>
                {o.rejection_reason && <div className="mt-2 text-xs text-rose-700">Rejected: {o.rejection_reason}</div>}
                {data.refunds?.length > 0 && <div className="mt-2 text-xs text-orange-700">Refund {data.refunds[0].status.toLowerCase()} · {money(data.refunds[0].amount, tenant.currency)}</div>}
              </section>

              <section>
                <h4 className="text-sm font-semibold mb-1">Internal notes</h4>
                <div className="space-y-1.5">
                  {(o.internal_notes || []).map((n) => <div key={n.id} className="rounded-md bg-muted px-2.5 py-1.5 text-xs"><span className="font-semibold">{n.by}</span> <span className="text-muted-foreground">{fmtTime(n.at)}</span><div>{n.note}</div></div>)}
                </div>
                <div className="mt-2 flex gap-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note visible to staff only" onKeyDown={(e) => e.key === 'Enter' && addNote()} /><Button variant="outline" disabled={busy || !note.trim()} onClick={addNote}>Add</Button></div>
              </section>

              {['owner', 'manager'].includes(user.role) && ['ORDER_PLACED', 'ACCEPTED', 'PREPARING'].includes(o.status) && (
                <Button variant="ghost" size="sm" onClick={cancel} className="text-destructive">Cancel order</Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function OrdersView({ user }) {
  const { tenant } = useTenant()
  const feed = useOrdersFeed()
  const [q, setQ] = useState('')
  const [mobileCol, setMobileCol] = useState('new')
  const [detailId, setDetailId] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [seen, setSeen] = useState(() => new Set())

  useEffect(() => {
    const t = setTimeout(() => setSeen(new Set(feed.orders.map((o) => o.id))), 6000)
    return () => clearTimeout(t)
  }, [feed.orders])

  const term = q.trim().toLowerCase()
  const orders = feed.orders.filter((o) => !term || String(o.order_number).includes(term) || (o.customer?.name || '').toLowerCase().includes(term) || (o.customer?.phone || '').includes(term))
  const done = orders.filter((o) => DONE.includes(o.status))

  const act = async (order, status, extra = {}) => {
    setBusyId(order.id)
    try {
      await api(`/admin/orders/${order.id}/status`, { method: 'PATCH', body: { status, ...extra } })
      toast.success(`Order #${order.order_number} → ${status.replace(/_/g, ' ').toLowerCase()}`)
      await feed.refresh()
    } catch (e) {
      toast.error(e.message)
      feed.refresh()
    } finally {
      setBusyId(null)
    }
  }
  const confirmReject = async (order, reason, note) => {
    await act(order, 'REJECTED', { reason, note })
    setRejecting(null)
  }

  return (
    <div>
      <PageHeader
        title="Live orders"
        subtitle="Updates automatically every few seconds."
        actions={<div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search # / name / phone" className="pl-8 h-9 w-56" /></div>}
      />

      <div className="lg:hidden grid grid-cols-3 gap-1 p-1 rounded-xl bg-muted mb-4">
        {COLS.map((c) => {
          const n = orders.filter((o) => c.statuses.includes(o.status)).length
          return <button key={c.key} onClick={() => setMobileCol(c.key)} className={`h-9 rounded-lg text-xs font-semibold ${mobileCol === c.key ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{c.title.split(' ')[0]} {n ? <span className="ml-1 rounded-full bg-foreground/10 px-1.5">{n}</span> : null}</button>
        })}
      </div>

      {feed.loading ? <div className="text-sm text-muted-foreground">Loading orders…</div> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLS.map((c) => {
            const list = orders.filter((o) => c.statuses.includes(o.status))
            return (
              <div key={c.key} className={`${mobileCol === c.key ? '' : 'hidden lg:block'}`}>
                <div className={`hidden lg:flex items-center justify-between rounded-lg border px-3 h-9 text-sm font-semibold ${c.head}`}><span>{c.title}</span><span>{list.length}</span></div>
                <div className="lg:mt-3 space-y-3">
                  {list.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing here right now</div>}
                  {list.map((o) => <OrderCard key={o.id} order={o} role={user.role} currency={tenant.currency} busy={busyId === o.id} onAct={act} onReject={setRejecting} onOpen={setDetailId} fresh={o.status === 'ORDER_PLACED' && seen.size > 0 && !seen.has(o.id)} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Completed & cancelled · last 24h ({done.length})</h3>
        <div className="rounded-xl border bg-card divide-y">
          {done.length === 0 && <div className="p-4 text-sm text-muted-foreground">No completed orders yet today.</div>}
          {done.map((o) => (
            <button key={o.id} onClick={() => setDetailId(o.id)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
              <span className="w-16 text-sm font-semibold">#{o.order_number}</span>
              <span className="flex-1 min-w-0 text-sm truncate">{o.customer?.name || 'Guest'} <span className="text-muted-foreground">· {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span></span>
              <ModeChip mode={o.mode} />
              <span className="text-sm font-semibold w-20 text-right">{money(o.total, tenant.currency)}</span>
              <StatusBadge status={o.status} />
              <span className="text-xs text-muted-foreground w-16 text-right hidden sm:inline">{timeAgo(o.updated_at)}</span>
            </button>
          ))}
        </div>
      </div>

      <RejectDialog order={rejecting} reasons={feed.rejectionReasons} onClose={() => setRejecting(null)} onConfirm={confirmReject} />
      <OrderDetail id={detailId} user={user} onClose={() => setDetailId(null)} onAct={act} onReject={setRejecting} refreshFeed={feed.refresh} />
    </div>
  )
}
