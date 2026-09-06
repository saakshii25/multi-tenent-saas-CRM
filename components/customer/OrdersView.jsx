'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { useTenant } from '@/components/shared/TenantProvider'
import { useCustomer } from './store'
import { EmptyState } from './CartView'
import { OrderLineList } from './shared'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { api, fetcher, money, fmtDateTime, fmtTime, STATUS_META, MODE_META, PAYMENT_STATUS_META } from '@/lib/client'
import { ReceiptText, Check, ChefHat, PackageCheck, Bike, PartyPopper, XCircle, Phone, LogIn, Clock, MapPin, Armchair, BedDouble, Store } from 'lucide-react'

const ACTIVE = ['ORDER_PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']

function flowFor(mode) {
  const steps = [
    { key: 'ORDER_PLACED', label: 'Order placed', icon: ReceiptText },
    { key: 'ACCEPTED', label: 'Accepted', icon: Check },
    { key: 'PREPARING', label: 'Preparing', icon: ChefHat },
    { key: 'READY', label: mode === 'DELIVERY' ? 'Packed' : mode === 'PICKUP' ? 'Ready for pickup' : 'Ready', icon: PackageCheck },
  ]
  if (mode === 'DELIVERY') steps.push({ key: 'OUT_FOR_DELIVERY', label: 'On the way', icon: Bike })
  steps.push({ key: 'DELIVERED', label: mode === 'PICKUP' ? 'Picked up' : mode === 'DINE_IN' ? 'Served' : 'Delivered', icon: PartyPopper })
  return steps
}

export function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, badge: 'bg-muted text-foreground' }
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${m.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot || 'bg-current'}`} />{m.label}</span>
}

export function OrdersView() {
  const { tenant } = useTenant()
  const { customer, loading, openAuth } = useCustomer()
  const { data, isLoading } = useSWR(customer ? '/orders' : null, fetcher, { refreshInterval: 10000 })

  if (loading) return null
  if (!customer) {
    return (
      <div className="pt-16 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-brand-soft flex items-center justify-center"><ReceiptText className="h-6 w-6 text-brand" /></div>
        <h2 className="mt-4 text-lg font-bold">Sign in to see your orders</h2>
        <Button onClick={() => openAuth(null)} className="mt-6 bg-brand text-brand-foreground hover:opacity-90"><LogIn className="h-4 w-4 mr-2" />Continue with phone</Button>
      </div>
    )
  }
  const orders = data?.orders || []
  if (!isLoading && !orders.length) return <EmptyState icon={ReceiptText} title="No orders yet" subtitle="Your order history will appear here." />
  return (
    <div className="pt-4 space-y-3">
      {orders.map((o) => (
        <Link key={o.id} href={`/order/orders/${o.id}`} className="block rounded-xl border p-4 hover:bg-muted/40 transition" data-testid={`order-card-${o.order_number}`}>
          <div className="flex items-center justify-between">
            <div className="font-semibold">Order #{o.order_number}</div>
            <StatusBadge status={o.status} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{fmtDateTime(o.created_at)} · {MODE_META[o.mode]?.label}</div>
          <div className="mt-2 text-sm text-muted-foreground truncate">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{o.items.reduce((s, i) => s + i.qty, 0)} items</span>
            <span className="font-semibold">{money(o.total, tenant.currency)}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

export function OrderTrackingView({ id }) {
  const { tenant } = useTenant()
  const { customer, loading, openAuth } = useCustomer()
  const [celebrate, setCelebrate] = useState(false)
  const { data, error, mutate } = useSWR(customer ? `/orders/${id}` : null, fetcher, {
    refreshInterval: (d) => (d?.order && ACTIVE.includes(d.order.status) ? 5000 : 0),
  })
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('placed')) setCelebrate(true)
  }, [])

  if (loading) return null
  if (!customer) {
    return (
      <div className="pt-16 text-center">
        <h2 className="text-lg font-bold">Sign in to track this order</h2>
        <Button onClick={() => openAuth(null)} className="mt-6 bg-brand text-brand-foreground hover:opacity-90"><LogIn className="h-4 w-4 mr-2" />Continue with phone</Button>
      </div>
    )
  }
  if (error) return <EmptyState icon={XCircle} title="Order not found" subtitle="This order does not belong to your account." cta="Your orders" href="/order/orders" />
  const o = data?.order
  if (!o) return <div className="pt-10 text-center text-sm text-muted-foreground">Loading your order…</div>

  const steps = flowFor(o.mode)
  const failed = ['REJECTED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'PAYMENT_FAILED'].includes(o.status)
  const currentIdx = steps.findIndex((s) => s.key === o.status)
  const at = (key) => o.status_history?.find((h) => h.status === key)?.at
  const pm = PAYMENT_STATUS_META[o.payment_status] || { label: o.payment_status, badge: 'bg-muted' }
  const eta = o.mode === 'DELIVERY' ? tenant.delivery_settings?.eta_min : tenant.pickup_settings?.eta_min

  const cancel = async () => {
    try {
      const r = await api(`/orders/${o.id}/cancel`, { method: 'POST', body: { reason: 'Cancelled by customer' } })
      mutate({ order: r.order }, false)
      toast.success('Order cancelled')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const headline = failed
    ? o.status === 'CANCELLED' ? 'Order cancelled' : o.status === 'REJECTED' ? 'Order rejected' : STATUS_META[o.status]?.label
    : o.status === 'ORDER_PLACED' ? `Waiting for ${tenant.business_name} to accept`
    : o.status === 'DELIVERED' ? (o.mode === 'PICKUP' ? 'Picked up. Enjoy!' : o.mode === 'DINE_IN' ? 'Served. Enjoy your meal!' : 'Delivered. Enjoy!')
    : steps[currentIdx]?.label

  return (
    <div className="pt-4 space-y-4">
      {celebrate && !failed && (
        <div className="rounded-xl bg-brand text-brand-foreground p-4 flex items-center gap-3">
          <PartyPopper className="h-6 w-6" />
          <div><div className="font-bold">Thanks, {o.customer?.name?.split(' ')[0] || 'there'}! Your order is in.</div><div className="text-xs opacity-90">We&apos;ll update this page as your order moves along.</div></div>
        </div>
      )}

      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Order #{o.order_number} · {fmtDateTime(o.created_at)}</div>
            <h2 className="mt-1 text-lg font-bold leading-tight" data-testid="order-headline">{headline}</h2>
            {!failed && o.status !== 'DELIVERED' && eta ? <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" />Estimated ~{eta} min</div> : null}
          </div>
          <StatusBadge status={o.status} />
        </div>

        {failed ? (
          <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-900">
            <div className="font-semibold">{o.status === 'REJECTED' ? `Reason: ${o.rejection_reason || 'Not specified'}` : o.cancel_reason || 'This order was cancelled.'}</div>
            <div className="mt-1 text-xs">
              {o.payment_status === 'REFUND_PENDING' && `A refund of ${money(o.total, tenant.currency)} has been initiated and will reach you in 5–7 working days.`}
              {o.payment_status === 'REFUNDED' && `${money(o.total, tenant.currency)} has been refunded.`}
              {o.payment_status === 'VOID' && 'You have not been charged.'}
            </div>
          </div>
        ) : (
          <ol className="mt-5 relative">
            {steps.map((s, i) => {
              const done = i <= currentIdx
              const current = i === currentIdx
              const Icon = s.icon
              return (
                <li key={s.key} className="flex gap-3 pb-5 last:pb-0 relative">
                  {i < steps.length - 1 && <span className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${i < currentIdx ? 'bg-brand' : 'bg-border'}`} />}
                  <span className={`relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'} ${current && o.status !== 'DELIVERED' ? 'ring-4 ring-brand-soft' : ''}`}><Icon className="h-4 w-4" /></span>
                  <div className="pt-1 flex-1 flex items-baseline justify-between gap-2">
                    <span className={`text-sm ${done ? 'font-semibold' : 'text-muted-foreground'}`}>{s.label}</span>
                    {at(s.key) && <span className="text-xs text-muted-foreground">{fmtTime(at(s.key))}</span>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        {o.status === 'ORDER_PLACED' && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="mt-4 text-destructive border-destructive/30 hover:bg-destructive/5" data-testid="cancel-order">Cancel order</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Cancel this order?</AlertDialogTitle><AlertDialogDescription>You can cancel while the restaurant hasn&apos;t accepted the order yet.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Keep order</AlertDialogCancel><AlertDialogAction onClick={cancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Cancel order</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {o.mode === 'DELIVERY' && <MapPin className="h-4 w-4 text-brand" />}{o.mode === 'PICKUP' && <Store className="h-4 w-4 text-brand" />}{o.mode === 'DINE_IN' && <Armchair className="h-4 w-4 text-brand" />}{o.mode === 'ROOM_SERVICE' && <BedDouble className="h-4 w-4 text-brand" />}
          {MODE_META[o.mode]?.label}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {o.mode === 'DELIVERY' && [o.address?.line1, o.address?.line2, o.address?.city, o.address?.pincode].filter(Boolean).join(', ')}
          {o.mode === 'PICKUP' && tenant.contact?.address}
          {o.mode === 'DINE_IN' && `Table ${o.table_number}`}
          {o.mode === 'ROOM_SERVICE' && `Room ${o.room_number}`}
        </div>
        {o.notes && <div className="mt-2 text-xs italic text-amber-700">“{o.notes}”</div>}
      </div>

      <div className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Items</h3>
        <OrderLineList items={o.items} currency={tenant.currency} />
        <div className="mt-2 border-t pt-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Item total</span><span>{money(o.subtotal, tenant.currency)}</span></div>
          {o.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount {o.coupon_code && `(${o.coupon_code})`}</span><span>- {money(o.discount, tenant.currency)}</span></div>}
          {o.tax > 0 && <div className="flex justify-between text-muted-foreground"><span>{o.tax_label || 'Tax'}</span><span>{money(o.tax, tenant.currency)}</span></div>}
          {o.delivery_fee > 0 && <div className="flex justify-between text-muted-foreground"><span>Delivery fee</span><span>{money(o.delivery_fee, tenant.currency)}</span></div>}
          {o.packaging_fee > 0 && <div className="flex justify-between text-muted-foreground"><span>Packaging</span><span>{money(o.packaging_fee, tenant.currency)}</span></div>}
          <div className="flex justify-between font-bold pt-1"><span>Total</span><span>{money(o.total, tenant.currency)}</span></div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{o.payment_method === 'COD' ? tenant.payment?.cod_label : 'Paid online'}</span>
          <span className={`rounded-full border px-2 py-0.5 font-semibold ${pm.badge}`}>{pm.label}</span>
        </div>
      </div>

      {tenant.contact?.phone && (
        <a href={`tel:${tenant.contact.phone.replace(/\s/g, '')}`} className="flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold hover:bg-muted/40"><Phone className="h-4 w-4" />Need help? Call {tenant.business_name}</a>
      )}
    </div>
  )
}
