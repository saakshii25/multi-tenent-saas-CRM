'use client'

import { useState } from 'react'
import { money, MODE_META } from '@/lib/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tag, X, Check, Loader2 } from 'lucide-react'

export function ModeSelector({ tenant, mode, onChange }) {
  const modes = tenant.ordering_modes || []
  if (modes.length <= 1) return null
  return (
    <div className="grid gap-1 p-1 rounded-xl bg-muted" style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}>
      {modes.map((m) => (
        <button key={m} type="button" onClick={() => onChange(m)} data-testid={`mode-${m}`} className={`h-9 rounded-lg text-xs sm:text-sm font-semibold transition ${mode === m ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {MODE_META[m]?.label || m}
        </button>
      ))}
    </div>
  )
}

export function CouponBox({ cart, quote }) {
  const [code, setCode] = useState('')
  const applied = cart.coupon_code
  const result = quote?.coupon
  if (applied) {
    const ok = result?.ok
    return (
      <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <Tag className={`h-4 w-4 shrink-0 ${ok ? 'text-emerald-700' : 'text-rose-700'}`} />
          <div className="min-w-0">
            <div className={`text-sm font-semibold ${ok ? 'text-emerald-900' : 'text-rose-900'}`}>{applied}</div>
            <div className={`text-xs ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{result ? (ok ? `You save ${money(result.discount)}` : result.error) : 'Checking…'}</div>
          </div>
        </div>
        <button type="button" onClick={() => cart.patch({ coupon_code: '' })} className="h-8 w-8 rounded-full hover:bg-black/5 flex items-center justify-center" aria-label="Remove coupon"><X className="h-4 w-4" /></button>
      </div>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (code.trim()) cart.patch({ coupon_code: code.trim().toUpperCase() })
        setCode('')
      }}
      className="flex gap-2"
    >
      <div className="relative flex-1">
        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Coupon code" className="pl-9 h-11 uppercase" data-testid="coupon-input" />
      </div>
      <Button type="submit" variant="outline" className="h-11" disabled={!code.trim()} data-testid="coupon-apply">Apply</Button>
    </form>
  )
}

export function BillSummary({ quote, currency, loading }) {
  if (!quote) return null
  const row = (label, value, cls = '') => (
    <div className={`flex items-center justify-between text-sm ${cls}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
  return (
    <div className="rounded-xl border p-4 space-y-2" data-testid="bill-summary">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Bill details</h3>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {row('Item total', money(quote.subtotal, currency))}
      {quote.discount > 0 && row(`Coupon discount${quote.coupon?.code ? ` (${quote.coupon.code})` : ''}`, `- ${money(quote.discount, currency)}`, 'text-emerald-700 [&>span]:text-emerald-700')}
      {quote.tax_inclusive ? row(`${quote.tax_label}`, 'Included') : quote.tax_rate > 0 && row(`${quote.tax_label} (${quote.tax_rate}%)`, money(quote.tax, currency))}
      {quote.mode === 'DELIVERY' && row('Delivery fee', quote.delivery_fee ? money(quote.delivery_fee, currency) : <span className="text-emerald-700 font-medium">Free</span>)}
      {quote.packaging_fee > 0 && row('Packaging', money(quote.packaging_fee, currency))}
      <div className="border-t pt-2 flex items-center justify-between font-bold">
        <span>To pay</span>
        <span data-testid="bill-total">{money(quote.total, currency)}</span>
      </div>
    </div>
  )
}

export function OrderLineList({ items, currency, compact = false }) {
  return (
    <div className="divide-y">
      {items.map((it, i) => (
        <div key={i} className={`flex items-start justify-between gap-3 ${compact ? 'py-2' : 'py-2.5'}`}>
          <div className="min-w-0 flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-xs font-semibold text-muted-foreground w-6">{it.qty}×</span>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{it.name}{it.variant_name ? <span className="text-muted-foreground"> · {it.variant_name}</span> : null}</div>
              {it.addons?.length > 0 && <div className="text-xs text-muted-foreground truncate">+ {it.addons.map((a) => a.name).join(', ')}</div>}
              {it.notes && <div className="text-xs text-amber-700 italic truncate">“{it.notes}”</div>}
            </div>
          </div>
          <div className="text-sm font-medium shrink-0">{money(it.line_total, currency)}</div>
        </div>
      ))}
    </div>
  )
}

export function CheckIcon() {
  return <Check className="h-3.5 w-3.5" />
}
