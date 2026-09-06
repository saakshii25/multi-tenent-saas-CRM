'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useTenant } from '@/components/shared/TenantProvider'
import { useCart, useCustomer, useQuote } from './store'
import { ModeSelector, CouponBox, BillSummary, OrderLineList } from './shared'
import { EmptyState } from './CartView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { api, money, newId, MODE_META } from '@/lib/client'
import { MapPin, Store, Armchair, BedDouble, Wallet, CreditCard, Plus, Loader2, LogIn, Lock } from 'lucide-react'

const MODE_ICON = { DELIVERY: MapPin, PICKUP: Store, DINE_IN: Armchair, ROOM_SERVICE: BedDouble }

function Section({ title, icon: Icon, children, right }) {
  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">{Icon && <Icon className="h-4 w-4 text-brand" />}{title}</h2>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function CheckoutView() {
  const { tenant } = useTenant()
  const cart = useCart()
  const { customer, loading, openAuth } = useCustomer()
  const router = useRouter()
  const { quote, loading: quoting } = useQuote(cart)

  const [contact, setContact] = useState({ name: '', phone: '', email: '' })
  const [addressId, setAddressId] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newAddr, setNewAddr] = useState({ label: 'Home', line1: '', line2: '', city: '', pincode: '', landmark: '' })
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState('COD')
  const [placing, setPlacing] = useState(false)
  const idemRef = useRef(null)

  useEffect(() => {
    const k = `wl_idem:${tenant.slug}`
    let v = sessionStorage.getItem(k)
    if (!v) {
      v = newId()
      sessionStorage.setItem(k, v)
    }
    idemRef.current = v
    api('/events', { method: 'POST', body: { event: 'CHECKOUT_STARTED' } }).catch(() => {})
  }, [tenant.slug])

  useEffect(() => {
    if (!customer) return
    setContact((c) => ({ name: c.name || customer.name || '', phone: c.phone || customer.phone || '', email: c.email || customer.email || '' }))
    if (customer.addresses?.length) setAddressId((id) => id || customer.addresses[0].id)
    else setShowNew(true)
  }, [customer])

  useEffect(() => {
    if (!loading && !customer) openAuth(null)
  }, [loading, customer, openAuth])

  if (!cart.hydrated || loading) return null
  if (!cart.items.length) return <EmptyState title="Nothing to check out" subtitle="Add a few items first." />
  if (!customer) {
    return (
      <div className="pt-16 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-brand-soft flex items-center justify-center"><Lock className="h-6 w-6 text-brand" /></div>
        <h2 className="mt-4 text-lg font-bold">Sign in to place your order</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your cart is saved – we&apos;ll bring you right back here.</p>
        <Button onClick={() => openAuth(null)} className="mt-6 bg-brand text-brand-foreground hover:opacity-90" data-testid="checkout-signin"><LogIn className="h-4 w-4 mr-2" />Continue with phone</Button>
      </div>
    )
  }

  const mode = cart.mode
  const ModeIcon = MODE_ICON[mode] || Store
  const errors = quote?.errors || []
  const couponBad = cart.coupon_code && quote?.coupon && !quote.coupon.ok
  const selectedAddress = showNew ? newAddr : customer.addresses?.find((a) => a.id === addressId)
  const canPlace = quote && !errors.length && !couponBad && !placing && contact.name.trim() && contact.phone.trim().length >= 10 && (mode !== 'DELIVERY' || selectedAddress?.line1?.trim()) && (mode !== 'DINE_IN' || cart.table_number.trim()) && (mode !== 'ROOM_SERVICE' || cart.room_number.trim())

  const place = async () => {
    if (!canPlace) return
    setPlacing(true)
    try {
      const res = await api('/checkout/place', {
        method: 'POST',
        body: {
          items: cart.apiItems,
          mode,
          coupon_code: cart.coupon_code || null,
          idempotency_key: idemRef.current,
          payment_method: payment,
          contact,
          address: mode === 'DELIVERY' ? selectedAddress : null,
          save_address: true,
          table_number: mode === 'DINE_IN' ? cart.table_number : null,
          room_number: mode === 'ROOM_SERVICE' ? cart.room_number : null,
          notes: notes || null,
        },
      })
      sessionStorage.removeItem(`wl_idem:${tenant.slug}`)
      cart.clear()
      toast.success(`Order #${res.order.order_number} placed`)
      router.push(`/order/orders/${res.order.id}?placed=1`)
    } catch (e) {
      toast.error(e.message || 'Could not place the order')
      if (e.code === 'QUOTE_ERROR' || e.code === 'COUPON_INVALID') router.push('/order/cart')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="pt-4 space-y-4">
      <ModeSelector tenant={tenant} mode={mode} onChange={(m) => cart.patch({ mode: m })} />

      <Section title={MODE_META[mode]?.label || 'Order type'} icon={ModeIcon}>
        {mode === 'DELIVERY' && (
          <div className="space-y-3">
            {customer.addresses?.length > 0 && !showNew && (
              <RadioGroup value={addressId} onValueChange={setAddressId} className="gap-2">
                {customer.addresses.map((a) => (
                  <label key={a.id} htmlFor={`addr-${a.id}`} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${addressId === a.id ? 'border-brand bg-brand-soft' : ''}`}>
                    <RadioGroupItem value={a.id} id={`addr-${a.id}`} className="mt-0.5" />
                    <div className="text-sm">
                      <div className="font-semibold">{a.label || 'Address'}</div>
                      <div className="text-muted-foreground">{[a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', ')}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            )}
            {showNew ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Address line 1</Label><Input value={newAddr.line1} onChange={(e) => setNewAddr({ ...newAddr, line1: e.target.value })} placeholder="Flat / house no., building" className="mt-1" data-testid="addr-line1" /></div>
                <div className="sm:col-span-2"><Label>Area / street</Label><Input value={newAddr.line2} onChange={(e) => setNewAddr({ ...newAddr, line2: e.target.value })} className="mt-1" /></div>
                <div><Label>City</Label><Input value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} className="mt-1" /></div>
                <div><Label>Pincode</Label><Input value={newAddr.pincode} onChange={(e) => setNewAddr({ ...newAddr, pincode: e.target.value })} className="mt-1" inputMode="numeric" /></div>
                <div><Label>Landmark</Label><Input value={newAddr.landmark} onChange={(e) => setNewAddr({ ...newAddr, landmark: e.target.value })} className="mt-1" /></div>
                <div><Label>Save as</Label><Input value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} placeholder="Home / Office" className="mt-1" /></div>
                {customer.addresses?.length > 0 && <button type="button" className="text-xs font-semibold text-brand text-left" onClick={() => setShowNew(false)}>Use a saved address</button>}
              </div>
            ) : (
              <button type="button" onClick={() => setShowNew(true)} className="text-sm font-semibold text-brand inline-flex items-center gap-1"><Plus className="h-4 w-4" />Add new address</button>
            )}
            {tenant.delivery_settings?.eta_min ? <p className="text-xs text-muted-foreground">Estimated delivery in ~{tenant.delivery_settings.eta_min} min{tenant.delivery_settings.free_above ? ` · Free delivery above ${money(tenant.delivery_settings.free_above, tenant.currency)}` : ''}</p> : null}
          </div>
        )}
        {mode === 'PICKUP' && (
          <div className="text-sm">
            <div className="font-medium">{tenant.business_name}</div>
            <div className="text-muted-foreground">{tenant.contact?.address}</div>
            {tenant.pickup_settings?.eta_min ? <div className="mt-2 inline-flex rounded-md bg-brand-soft text-brand px-2 py-1 text-xs font-medium">Ready in ~{tenant.pickup_settings.eta_min} min</div> : null}
          </div>
        )}
        {mode === 'DINE_IN' && (
          <div>
            <Label>Table number</Label>
            <Input value={cart.table_number} onChange={(e) => cart.patch({ table_number: e.target.value })} placeholder="e.g. 12" className="mt-1 max-w-[12rem]" data-testid="table-number" />
            <p className="mt-1.5 text-xs text-muted-foreground">Scanned a QR at your table? The number is filled in for you.</p>
          </div>
        )}
        {mode === 'ROOM_SERVICE' && (
          <div>
            <Label>Room number</Label>
            <Input value={cart.room_number} onChange={(e) => cart.patch({ room_number: e.target.value })} placeholder="e.g. 305" className="mt-1 max-w-[12rem]" data-testid="room-number" />
          </div>
        )}
      </Section>

      <Section title="Contact details">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label>Name</Label><Input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className="mt-1" data-testid="contact-name" /></div>
          <div><Label>Phone</Label><Input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className="mt-1" inputMode="tel" /></div>
          <div><Label>Email <span className="text-muted-foreground">(optional)</span></Label><Input value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className="mt-1" inputMode="email" /></div>
        </div>
        <div className="mt-3"><Label>Order notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 300))} placeholder="Anything the kitchen should know?" className="mt-1 min-h-[60px] resize-none" /></div>
      </Section>

      <Section title="Payment" icon={Wallet}>
        <RadioGroup value={payment} onValueChange={setPayment} className="gap-2">
          {tenant.payment?.cod_enabled && (
            <label htmlFor="pay-cod" className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer ${payment === 'COD' ? 'border-brand bg-brand-soft' : ''}`}>
              <RadioGroupItem value="COD" id="pay-cod" />
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm"><div className="font-semibold">{tenant.payment.cod_label}</div><div className="text-xs text-muted-foreground">Cash, card or UPI when you receive the order</div></div>
            </label>
          )}
          <label htmlFor="pay-rzp" className={`flex items-center gap-3 rounded-lg border p-3 ${tenant.payment?.razorpay_enabled ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'} ${payment === 'RAZORPAY' ? 'border-brand bg-brand-soft' : ''}`}>
            <RadioGroupItem value="RAZORPAY" id="pay-rzp" disabled={!tenant.payment?.razorpay_enabled} />
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm flex-1"><div className="font-semibold">Pay online</div><div className="text-xs text-muted-foreground">UPI, cards, netbanking via Razorpay</div></div>
            {!tenant.payment?.razorpay_enabled && <span className="text-[10px] font-semibold uppercase tracking-wide rounded bg-muted px-1.5 py-0.5">Coming soon</span>}
          </label>
        </RadioGroup>
      </Section>

      <Section title={`Your items (${cart.count})`}>
        {quote ? <OrderLineList items={quote.lines} currency={tenant.currency} compact /> : <div className="text-sm text-muted-foreground">Pricing…</div>}
      </Section>

      <CouponBox cart={cart} quote={quote} />
      <BillSummary quote={quote} currency={tenant.currency} loading={quoting} />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur px-4 py-3 safe-bottom">
        <div className="mx-auto max-w-3xl flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground">{MODE_META[mode]?.label} · {payment === 'COD' ? 'Pay later' : 'Pay online'}</div>
            <div className="text-lg font-bold">{money(quote?.total ?? cart.subtotal, tenant.currency)}</div>
          </div>
          <Button onClick={place} disabled={!canPlace} className="h-12 px-6 bg-brand text-brand-foreground hover:opacity-90 font-bold" data-testid="place-order">
            {placing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Place order
          </Button>
        </div>
      </div>
    </div>
  )
}
