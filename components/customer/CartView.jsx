'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/components/shared/TenantProvider'
import { useCart, useCustomer, useQuote } from './store'
import { ModeSelector, CouponBox, BillSummary } from './shared'
import { VegDot, Stepper } from './MenuView'
import { Button } from '@/components/ui/button'
import { money, MODE_META } from '@/lib/client'
import { ShoppingBag, Plus, Trash2, AlertCircle, ArrowRight, UtensilsCrossed } from 'lucide-react'

export function EmptyState({ icon: Icon = ShoppingBag, title, subtitle, cta = 'Browse menu', href = '/order' }) {
  return (
    <div className="pt-20 text-center">
      <div className="mx-auto h-16 w-16 rounded-2xl bg-brand-soft flex items-center justify-center"><Icon className="h-7 w-7 text-brand" /></div>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      <Button asChild className="mt-6 bg-brand text-brand-foreground hover:opacity-90"><Link href={href}>{cta}</Link></Button>
    </div>
  )
}

export function CartView() {
  const { tenant } = useTenant()
  const cart = useCart()
  const { customer, openAuth } = useCustomer()
  const router = useRouter()
  const { quote, loading } = useQuote(cart)

  if (!cart.hydrated) return null
  if (!cart.items.length) return <EmptyState title="Your cart is empty" subtitle="Good food is a few taps away." />

  const proceed = () => {
    if (!customer) openAuth(() => router.push('/order/checkout'))
    else router.push('/order/checkout')
  }
  const errors = quote?.errors || []

  return (
    <div className="pt-4 space-y-4">
      <ModeSelector tenant={tenant} mode={cart.mode} onChange={(m) => cart.patch({ mode: m })} />

      <div className="rounded-xl border">
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{cart.count} item{cart.count > 1 ? 's' : ''} · {MODE_META[cart.mode]?.label}</h2>
          <Link href="/order" className="text-xs font-semibold text-brand inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" />Add more</Link>
        </div>
        <div className="divide-y">
          {cart.items.map((it) => (
            <div key={it.key} className="px-4 py-3 flex gap-3" data-testid={`cart-line-${it.product_id}`}>
              {it.image ? <img src={it.image} alt="" className="h-14 w-14 rounded-lg object-cover bg-muted shrink-0" /> : <div className="h-14 w-14 rounded-lg bg-brand-soft flex items-center justify-center shrink-0"><UtensilsCrossed className="h-5 w-5 text-brand opacity-60" /></div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5"><VegDot veg={it.is_veg} /><span className="text-sm font-semibold truncate">{it.name}</span></div>
                {(it.variant_name || it.addon_names?.length > 0) && (
                  <div className="text-xs text-muted-foreground truncate">{[it.variant_name, ...(it.addon_names || [])].filter(Boolean).join(' · ')}</div>
                )}
                {it.notes && <div className="text-xs text-amber-700 italic truncate">“{it.notes}”</div>}
                <div className="mt-2 flex items-center justify-between">
                  <Stepper qty={it.qty} onInc={() => cart.updateQty(it.key, it.qty + 1)} onDec={() => cart.updateQty(it.key, it.qty - 1)} />
                  <div className="text-sm font-semibold">{money(it.unit_price * it.qty, tenant.currency)}</div>
                </div>
              </div>
              <button onClick={() => cart.removeItem(it.key)} aria-label="Remove" className="self-start text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-900">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="flex-1">{e.message}</span>
              {e.product_id && <button className="text-xs font-semibold underline" onClick={() => cart.linesForProduct(e.product_id).forEach((l) => cart.removeItem(l.key))}>Remove</button>}
            </div>
          ))}
        </div>
      )}

      <CouponBox cart={cart} quote={quote} />
      <BillSummary quote={quote} currency={tenant.currency} loading={loading} />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur px-4 py-3 safe-bottom">
        <div className="mx-auto max-w-3xl flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground">To pay</div>
            <div className="text-lg font-bold">{money(quote?.total ?? cart.subtotal, tenant.currency)}</div>
          </div>
          <Button onClick={proceed} disabled={errors.length > 0 || !quote} className="h-12 px-6 bg-brand text-brand-foreground hover:opacity-90 font-bold" data-testid="proceed-checkout">
            {customer ? 'Checkout' : 'Sign in & checkout'} <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
