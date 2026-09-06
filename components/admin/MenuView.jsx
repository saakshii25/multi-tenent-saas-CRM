'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { useTenant } from '@/components/shared/TenantProvider'
import { api, fetcher, money } from '@/lib/client'
import { PageHeader, Empty, Field } from './ui'
import { VegDot } from '@/components/customer/MenuView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Star, Search, ChevronUp, ChevronDown, Loader2, UtensilsCrossed, X } from 'lucide-react'

const emptyProduct = (category_id) => ({ name: '', description: '', category_id: category_id || '', base_price: '', is_veg: true, prep_time_min: 15, is_available: true, is_featured: false, image: '', variants: [], addons: [] })

function OptionsEditor({ label, items, onChange, hint }) {
  const update = (i, patch) => onChange(items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  return (
    <div>
      <div className="flex items-center justify-between"><label className="text-xs font-medium text-muted-foreground">{label}</label><button type="button" onClick={() => onChange([...items, { name: '', price: '' }])} className="text-xs font-semibold text-brand inline-flex items-center gap-1"><Plus className="h-3 w-3" />Add</button></div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      <div className="mt-1.5 space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2"><Input value={it.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Name" className="h-9" /><Input value={it.price} onChange={(e) => update(i, { price: e.target.value })} placeholder="Price" inputMode="decimal" className="h-9 w-28" /><button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button></div>
        ))}
      </div>
    </div>
  )
}

function ProductDialog({ product, categories, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState(emptyProduct())
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (product === 'new') setForm(emptyProduct(categories[0]?.id))
    else if (product) setForm({ ...emptyProduct(), ...product, image: product.image || '', variants: (product.variants || []).map((v) => ({ ...v })), addons: (product.addons || []).map((a) => ({ ...a })) })
  }, [product, categories])
  if (!product) return null
  const isNew = product === 'new'
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setBusy(true)
    try {
      const body = {
        name: form.name, description: form.description, category_id: form.category_id, base_price: Number(form.base_price) || 0, is_veg: !!form.is_veg,
        prep_time_min: Number(form.prep_time_min) || 0, is_available: !!form.is_available, is_featured: !!form.is_featured, image: form.image?.trim() || null,
        variants: form.variants.filter((v) => v.name.trim()).map((v) => ({ ...(v.id ? { id: v.id } : {}), name: v.name.trim(), price: Number(v.price) || 0 })),
        addons: form.addons.filter((a) => a.name.trim()).map((a) => ({ ...(a.id ? { id: a.id } : {}), name: a.name.trim(), price: Number(a.price) || 0 })),
      }
      const r = isNew ? await api('/admin/products', { method: 'POST', body }) : await api(`/admin/products/${product.id}`, { method: 'PATCH', body })
      toast.success(isNew ? 'Product added' : 'Product updated')
      onSaved(r.product)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!confirm(`Delete "${product.name}" from the menu?`)) return
    setBusy(true)
    try { await api(`/admin/products/${product.id}`, { method: 'DELETE' }); toast.success('Product deleted'); onDeleted(product.id) } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? 'Add product' : `Edit ${product.name}`}</DialogTitle><DialogDescription>Changes go live on the customer menu immediately.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input value={form.name} onChange={(e) => set('name', e.target.value)} data-testid="product-name" /></Field>
          <Field label="Category">
            <Select value={form.category_id} onValueChange={(v) => set('category_id', v)}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={form.variants.length ? 'Base price (overridden by options)' : 'Price'}><Input value={form.base_price} onChange={(e) => set('base_price', e.target.value)} inputMode="decimal" data-testid="product-price" /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} className="min-h-[64px] resize-none" /></Field>
          <Field label="Image URL" className="sm:col-span-2" hint="Paste a direct image link. Uploads to storage come next.">
            <div className="flex gap-3"><Input value={form.image} onChange={(e) => set('image', e.target.value)} placeholder="https://…" />{form.image ? <img src={form.image} alt="" className="h-10 w-10 rounded-lg object-cover border" /> : null}</div>
          </Field>
          <Field label="Preparation time (min)"><Input value={form.prep_time_min} onChange={(e) => set('prep_time_min', e.target.value)} inputMode="numeric" /></Field>
          <div className="grid grid-cols-3 gap-2 items-end">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Veg<Switch checked={form.is_veg} onCheckedChange={(v) => set('is_veg', v)} /></label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Available<Switch checked={form.is_available} onCheckedChange={(v) => set('is_available', v)} /></label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Featured<Switch checked={form.is_featured} onCheckedChange={(v) => set('is_featured', v)} /></label>
          </div>
          <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
            <OptionsEditor label="Variants (sizes / portions)" hint="Customer must pick one. Price replaces base price." items={form.variants} onChange={(v) => set('variants', v)} />
            <OptionsEditor label="Add-ons" hint="Optional extras added on top." items={form.addons} onChange={(v) => set('addons', v)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {!isNew ? <Button variant="ghost" onClick={del} disabled={busy} className="text-destructive"><Trash2 className="h-4 w-4 mr-1.5" />Delete</Button> : <span />}
          <div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !form.name.trim() || !form.category_id} className="bg-brand text-brand-foreground hover:opacity-90" data-testid="product-save">{busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}{isNew ? 'Add product' : 'Save changes'}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CategoryDialog({ category, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState({ name: '', description: '', is_active: true })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (category === 'new') setForm({ name: '', description: '', is_active: true }); else if (category) setForm({ name: category.name, description: category.description || '', is_active: category.is_active !== false }) }, [category])
  if (!category) return null
  const isNew = category === 'new'
  const save = async () => {
    setBusy(true)
    try { const r = isNew ? await api('/admin/categories', { method: 'POST', body: form }) : await api(`/admin/categories/${category.id}`, { method: 'PATCH', body: form }); toast.success(isNew ? 'Category added' : 'Category updated'); onSaved(r.category) } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const del = async () => {
    if (!confirm(`Delete category "${category.name}"?`)) return
    try { await api(`/admin/categories/${category.id}`, { method: 'DELETE' }); toast.success('Category deleted'); onDeleted(category.id) } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open={!!category} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isNew ? 'Add category' : 'Edit category'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="category-name" /></Field>
          <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <label className="flex items-center justify-between text-sm">Visible to customers<Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></label>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {!isNew ? <Button variant="ghost" onClick={del} className="text-destructive"><Trash2 className="h-4 w-4 mr-1.5" />Delete</Button> : <span />}
          <div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !form.name.trim()} className="bg-brand text-brand-foreground hover:opacity-90" data-testid="category-save">{isNew ? 'Add' : 'Save'}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MenuView({ user }) {
  const { tenant } = useTenant()
  const { data: cd, mutate: mc } = useSWR('/admin/categories', fetcher)
  const { data: pd, mutate: mp } = useSWR('/admin/products', fetcher)
  const [catId, setCatId] = useState('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const [editingCat, setEditingCat] = useState(null)
  const canManage = ['owner', 'manager'].includes(user.role)
  const categories = cd?.categories || []
  const products = pd?.products || []
  const term = q.trim().toLowerCase()
  const list = useMemo(() => products.filter((p) => (catId === 'all' || p.category_id === catId) && (!term || p.name.toLowerCase().includes(term))), [products, catId, term])

  const toggle = async (p, field) => {
    const value = !p[field]
    mp({ products: products.map((x) => (x.id === p.id ? { ...x, [field]: value } : x)) }, false)
    try {
      if (field === 'is_available') await api(`/admin/products/${p.id}/availability`, { method: 'PATCH', body: { is_available: value } })
      else await api(`/admin/products/${p.id}`, { method: 'PATCH', body: { [field]: value } })
      toast.success(field === 'is_available' ? (value ? `${p.name} is available` : `${p.name} marked unavailable`) : value ? 'Featured' : 'Unfeatured')
    } catch (e) { toast.error(e.message); mp() }
  }
  const move = async (i, dir) => {
    const ids = categories.map((c) => c.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    mc({ categories: ids.map((id, idx) => ({ ...categories.find((c) => c.id === id), sort_order: idx + 1 })) }, false)
    try { await api('/admin/categories/reorder', { method: 'POST', body: { ids } }) } catch (e) { toast.error(e.message); mc() }
  }

  return (
    <div>
      <PageHeader title="Menu" subtitle={`${products.length} products across ${categories.length} categories`} actions={canManage && <><Button variant="outline" size="sm" onClick={() => setEditingCat('new')} data-testid="add-category"><Plus className="h-4 w-4 mr-1" />Category</Button><Button size="sm" onClick={() => setEditing('new')} className="bg-brand text-brand-foreground hover:opacity-90" data-testid="add-product"><Plus className="h-4 w-4 mr-1" />Product</Button></>} />

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border bg-card p-2 h-fit">
          <button onClick={() => setCatId('all')} className={`w-full text-left rounded-lg px-3 h-9 text-sm font-medium ${catId === 'all' ? 'bg-muted' : 'hover:bg-muted/60'}`}>All items <span className="text-muted-foreground">({products.length})</span></button>
          {categories.map((c, i) => (
            <div key={c.id} className={`group flex items-center rounded-lg ${catId === c.id ? 'bg-muted' : 'hover:bg-muted/60'}`}>
              <button onClick={() => setCatId(c.id)} className={`flex-1 text-left px-3 h-9 text-sm font-medium truncate ${c.is_active === false ? 'text-muted-foreground line-through' : ''}`}>{c.name} <span className="text-muted-foreground">({products.filter((p) => p.category_id === c.id).length})</span></button>
              {canManage && (
                <div className="hidden group-hover:flex items-center pr-1">
                  <button onClick={() => move(i, -1)} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => move(i, 1)} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground"><ChevronDown className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setEditingCat(c)} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </div>
          ))}
        </aside>

        <div>
          <div className="relative mb-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="pl-9" /></div>
          <div className="rounded-xl border bg-card divide-y">
            {list.length === 0 && <div className="p-6"><Empty title="No products" subtitle={canManage ? 'Add your first product to get started.' : ''} /></div>}
            {list.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 px-3 py-2.5 ${!p.is_available ? 'bg-muted/40' : ''}`} data-testid={`admin-product-${p.id}`}>
                {p.image ? <img src={p.image} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" /> : <div className="h-12 w-12 rounded-lg bg-brand-soft flex items-center justify-center shrink-0"><UtensilsCrossed className="h-5 w-5 text-brand opacity-60" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><VegDot veg={p.is_veg} /><span className="font-medium truncate">{p.name}</span>{p.is_featured && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}</div>
                  <div className="text-xs text-muted-foreground truncate">{categories.find((c) => c.id === p.category_id)?.name || 'Uncategorised'} · {p.variants?.length ? `${p.variants.length} options` : money(p.base_price, tenant.currency)}{p.addons?.length ? ` · ${p.addons.length} add-ons` : ''} · {p.prep_time_min} min</div>
                </div>
                <div className="hidden sm:block text-sm font-semibold w-20 text-right">{money(p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : p.base_price, tenant.currency)}</div>
                {canManage && <button onClick={() => toggle(p, 'is_featured')} title="Toggle featured" className={`h-8 w-8 rounded-md flex items-center justify-center ${p.is_featured ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground'}`}><Star className={`h-4 w-4 ${p.is_featured ? 'fill-amber-400' : ''}`} /></button>}
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><span className="hidden sm:inline">{p.is_available ? 'Available' : 'Sold out'}</span><Switch checked={!!p.is_available} onCheckedChange={() => toggle(p, 'is_available')} data-testid={`avail-${p.id}`} /></label>
                {canManage && <Button variant="ghost" size="icon" onClick={() => setEditing(p)} className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ProductDialog product={editing} categories={categories} onClose={() => setEditing(null)} onSaved={(p) => { mp(); setEditing(null) }} onDeleted={() => { mp(); setEditing(null) }} />
      <CategoryDialog category={editingCat} onClose={() => setEditingCat(null)} onSaved={() => { mc(); setEditingCat(null) }} onDeleted={() => { mc(); setEditingCat(null); setCatId('all') }} />
    </div>
  )
}
