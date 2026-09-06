'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useTenant } from '@/components/shared/TenantProvider'
import { useCart } from './store'
import { ProductSheet } from './ProductSheet'
import { fetcher, money, MODE_META } from '@/lib/client'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Clock, UtensilsCrossed, Minus, Plus, Star } from 'lucide-react'

export function VegDot({ veg, className = '' }) {
  return (
    <span title={veg ? 'Vegetarian' : 'Non-vegetarian'} className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border ${veg ? 'border-emerald-600' : 'border-rose-600'} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${veg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
    </span>
  )
}

export function Stepper({ qty, onInc, onDec, size = 'sm', className = '' }) {
  const h = size === 'lg' ? 'h-11' : 'h-9'
  return (
    <div className={`inline-flex items-center rounded-lg border border-brand bg-white text-brand font-bold shadow-sm ${h} ${className}`}>
      <button type="button" onClick={onDec} aria-label="Decrease" className="h-full px-2.5 hover:bg-brand-soft rounded-l-lg"><Minus className="h-3.5 w-3.5" /></button>
      <span className="min-w-[1.5rem] text-center text-sm">{qty}</span>
      <button type="button" onClick={onInc} aria-label="Increase" className="h-full px-2.5 hover:bg-brand-soft rounded-r-lg"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  )
}

function ProductRow({ p, qty, currency, onAdd, onInc, onDec }) {
  const hasOptions = (p.variants?.length || 0) + (p.addons?.length || 0) > 0
  const price = p.variants?.length ? Math.min(...p.variants.map((v) => Number(v.price))) : p.base_price
  return (
    <div className={`flex gap-4 py-4 border-b last:border-0 ${!p.is_available ? 'opacity-60' : ''}`} data-testid={`product-${p.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <VegDot veg={p.is_veg} />
          {p.is_featured && <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700"><Star className="h-3 w-3 fill-amber-500 text-amber-500" />Bestseller</span>}
        </div>
        <h3 className="mt-1 font-semibold leading-snug">{p.name}</h3>
        <div className="mt-0.5 text-sm font-medium">{p.variants?.length ? <span className="text-muted-foreground text-xs mr-1">from</span> : null}{money(price, currency)}</div>
        {p.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
        {p.prep_time_min ? <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" />{p.prep_time_min} min</div> : null}
      </div>
      <div className="relative w-28 shrink-0 mb-3">
        {p.image ? (
          <img src={p.image} alt={p.name} loading="lazy" className="h-24 w-28 rounded-xl object-cover bg-muted" />
        ) : (
          <div className="h-24 w-28 rounded-xl bg-brand-soft flex items-center justify-center"><UtensilsCrossed className="h-6 w-6 text-brand opacity-60" /></div>
        )}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-24">
          {!p.is_available ? (
            <div className="rounded-lg bg-white border text-[11px] font-semibold text-center py-2 text-muted-foreground shadow-sm">Unavailable</div>
          ) : qty > 0 ? (
            <Stepper qty={qty} onInc={onInc} onDec={onDec} className="w-full justify-between" />
          ) : (
            <button type="button" onClick={onAdd} className="w-full h-9 rounded-lg bg-white border border-brand text-brand font-bold text-sm shadow-sm hover:bg-brand-soft active:scale-95 transition">
              ADD{hasOptions && <span className="ml-0.5 text-[10px] align-super">+</span>}
            </button>
          )}
          {hasOptions && p.is_available && <div className="mt-1 text-[10px] text-center text-muted-foreground">customisable</div>}
        </div>
      </div>
    </div>
  )
}

export function MenuView() {
  const { tenant } = useTenant()
  const cart = useCart()
  const { data, isLoading } = useSWR('/menu', fetcher, { refreshInterval: 30000 })
  const [q, setQ] = useState('')
  const [active, setActive] = useState(null)
  const [sheetProduct, setSheetProduct] = useState(null)
  const navRef = useRef(null)

  const categories = data?.categories || []
  const products = data?.products || []
  const term = q.trim().toLowerCase()
  const filtered = term ? products.filter((p) => p.name.toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term)) : products
  const sections = useMemo(() => categories.map((c) => ({ ...c, products: filtered.filter((p) => p.category_id === c.id) })).filter((s) => s.products.length), [categories, filtered])
  const featured = useMemo(() => (term ? [] : products.filter((p) => p.is_featured && p.is_available).slice(0, 8)), [products, term])

  useEffect(() => {
    if (!sections.length) return
    const onScroll = () => {
      let current = sections[0].id
      for (const s of sections) {
        const el = document.getElementById(`cat-${s.id}`)
        if (el && el.getBoundingClientRect().top - 140 <= 0) current = s.id
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [sections])

  useEffect(() => {
    if (!active || !navRef.current) return
    const chip = navRef.current.querySelector(`[data-cat="${active}"]`)
    chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [active])

  const scrollTo = (id) => {
    const el = document.getElementById(`cat-${id}`)
    if (!el) return
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 124, behavior: 'smooth' })
  }

  const handleAdd = (p) => {
    if ((p.variants?.length || 0) + (p.addons?.length || 0) > 0) setSheetProduct(p)
    else cart.addItem(p)
  }
  const handleInc = (p) => {
    const lines = cart.linesForProduct(p.id)
    if (!lines.length) return handleAdd(p)
    const last = lines[lines.length - 1]
    cart.updateQty(last.key, last.qty + 1)
  }
  const handleDec = (p) => {
    const lines = cart.linesForProduct(p.id)
    if (!lines.length) return
    const last = lines[lines.length - 1]
    cart.updateQty(last.key, last.qty - 1)
  }

  return (
    <div>
      {/* Hero */}
      <div className="mt-4 relative overflow-hidden rounded-2xl bg-slate-900 text-white h-40 sm:h-52">
        {tenant.hero_image && <img src={tenant.hero_image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-75" />}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/30 to-transparent" />
        <div className="absolute bottom-0 p-4 sm:p-5">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">{tenant.tagline || tenant.business_name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(tenant.ordering_modes || []).map((m) => (
              <span key={m} className="rounded-full bg-white/15 backdrop-blur px-2.5 py-0.5 text-[11px] font-medium">{MODE_META[m]?.label || m}</span>
            ))}
            {tenant.delivery_settings?.eta_min && tenant.ordering_modes?.includes('DELIVERY') ? <span className="rounded-full bg-white/15 backdrop-blur px-2.5 py-0.5 text-[11px] font-medium">~{tenant.delivery_settings.eta_min} min delivery</span> : null}
          </div>
        </div>
      </div>

      {!tenant.is_open && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">We are currently closed and not accepting orders. You can still browse the menu.</div>
      )}

      {/* Search */}
      <div className="mt-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tenant.business_name} menu`} className="pl-9 h-11 rounded-xl bg-muted/60 border-transparent focus-visible:bg-background" data-testid="menu-search" />
      </div>

      {/* Category nav */}
      {sections.length > 0 && (
        <div className="sticky top-14 z-20 -mx-4 px-4 bg-background/95 backdrop-blur border-b">
          <div ref={navRef} className="flex gap-2 overflow-x-auto no-scrollbar py-2.5">
            {sections.map((s) => (
              <button key={s.id} data-cat={s.id} onClick={() => scrollTo(s.id)} className={`shrink-0 rounded-full px-3.5 h-8 text-sm font-medium transition ${active === s.id ? 'bg-brand text-brand-foreground' : 'bg-muted text-foreground hover:bg-muted/70'}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && !data && (
        <div className="mt-6 space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4"><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/4" /><Skeleton className="h-3 w-3/4" /></div><Skeleton className="h-24 w-28 rounded-xl" /></div>
          ))}
        </div>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <section className="mt-5">
          <h2 className="text-base font-bold">Popular right now</h2>
          <div className="mt-3 -mx-4 px-4 flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {featured.map((p) => (
              <button key={p.id} onClick={() => handleAdd(p)} className="shrink-0 w-40 text-left rounded-2xl border overflow-hidden bg-card hover:shadow-md transition" data-testid={`featured-${p.id}`}>
                {p.image ? <img src={p.image} alt={p.name} className="h-28 w-full object-cover" /> : <div className="h-28 bg-brand-soft flex items-center justify-center"><UtensilsCrossed className="h-6 w-6 text-brand opacity-60" /></div>}
                <div className="p-2.5">
                  <div className="flex items-center gap-1.5"><VegDot veg={p.is_veg} /><span className="text-sm font-semibold truncate">{p.name}</span></div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{money(p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : p.base_price, tenant.currency)}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Sections */}
      {sections.map((s) => (
        <section key={s.id} id={`cat-${s.id}`} className="mt-6 scroll-mt-32">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">{s.name}</h2>
            <span className="text-xs text-muted-foreground">{s.products.length} item{s.products.length > 1 ? 's' : ''}</span>
          </div>
          {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
          <div className="mt-1">
            {s.products.map((p) => (
              <ProductRow key={p.id} p={p} currency={tenant.currency} qty={cart.qtyForProduct(p.id)} onAdd={() => handleAdd(p)} onInc={() => handleInc(p)} onDec={() => handleDec(p)} />
            ))}
          </div>
        </section>
      ))}

      {data && !sections.length && (
        <div className="mt-12 text-center text-sm text-muted-foreground">{term ? `No items match “${q}”` : 'The menu is being set up. Please check back soon.'}</div>
      )}

      <ProductSheet product={sheetProduct} open={!!sheetProduct} onClose={() => setSheetProduct(null)} onAdd={(p, opts) => cart.addItem(p, opts)} currency={tenant.currency} />
    </div>
  )
}
