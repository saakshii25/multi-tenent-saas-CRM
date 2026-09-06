'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { useTenant } from '@/components/shared/TenantProvider'
import { api, fetcher, money } from '@/lib/client'
import { PageHeader, Empty, Field } from './ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Tag, Loader2 } from 'lucide-react'

const empty = { code: '', type: 'PERCENT', value: '', min_order: '', max_discount: '', usage_limit: '', per_user_limit: '', ends_at: '', is_active: true, description: '' }

function CouponDialog({ coupon, onClose, onSaved }) {
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (coupon === 'new') setForm(empty)
    else if (coupon) setForm({ ...empty, ...coupon, value: String(coupon.value), min_order: coupon.min_order || '', max_discount: coupon.max_discount || '', usage_limit: coupon.usage_limit || '', per_user_limit: coupon.per_user_limit || '', ends_at: coupon.ends_at ? String(coupon.ends_at).slice(0, 10) : '' })
  }, [coupon])
  if (!coupon) return null
  const isNew = coupon === 'new'
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const save = async () => {
    setBusy(true)
    try {
      const body = { code: form.code, type: form.type, value: Number(form.value), min_order: Number(form.min_order) || 0, max_discount: form.max_discount ? Number(form.max_discount) : null, usage_limit: form.usage_limit ? Number(form.usage_limit) : null, per_user_limit: form.per_user_limit ? Number(form.per_user_limit) : null, ends_at: form.ends_at ? new Date(form.ends_at + 'T23:59:59').toISOString() : null, is_active: !!form.is_active, description: form.description }
      isNew ? await api('/admin/coupons', { method: 'POST', body }) : await api(`/admin/coupons/${coupon.id}`, { method: 'PATCH', body })
      toast.success(isNew ? 'Coupon created' : 'Coupon updated')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!coupon} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{isNew ? 'New coupon' : `Edit ${coupon.code}`}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code"><Input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="WELCOME10" data-testid="coupon-code" /></Field>
          <Field label="Type"><Select value={form.type} onValueChange={(v) => set('type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PERCENT">Percentage off</SelectItem><SelectItem value="FIXED">Fixed amount off</SelectItem></SelectContent></Select></Field>
          <Field label={form.type === 'PERCENT' ? 'Percent (%)' : 'Amount'}><Input value={form.value} onChange={(e) => set('value', e.target.value)} inputMode="decimal" data-testid="coupon-value" /></Field>
          <Field label="Minimum order"><Input value={form.min_order} onChange={(e) => set('min_order', e.target.value)} inputMode="decimal" /></Field>
          {form.type === 'PERCENT' && <Field label="Max discount"><Input value={form.max_discount} onChange={(e) => set('max_discount', e.target.value)} inputMode="decimal" /></Field>}
          <Field label="Expires on"><Input type="date" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></Field>
          <Field label="Total usage limit"><Input value={form.usage_limit} onChange={(e) => set('usage_limit', e.target.value)} inputMode="numeric" placeholder="Unlimited" /></Field>
          <Field label="Per customer limit"><Input value={form.per_user_limit} onChange={(e) => set('per_user_limit', e.target.value)} inputMode="numeric" placeholder="Unlimited" /></Field>
          <Field label="Description" className="sm:col-span-2"><Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Shown internally" /></Field>
          <label className="sm:col-span-2 flex items-center justify-between text-sm">Active<Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} /></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !form.code.trim() || !form.value} className="bg-brand text-brand-foreground hover:opacity-90" data-testid="coupon-save">{busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}{isNew ? 'Create' : 'Save'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CouponsView() {
  const { tenant } = useTenant()
  const { data, mutate } = useSWR('/admin/coupons', fetcher)
  const [editing, setEditing] = useState(null)
  const coupons = data?.coupons || []
  const toggle = async (c) => {
    try { await api(`/admin/coupons/${c.id}`, { method: 'PATCH', body: { is_active: !c.is_active } }); mutate() } catch (e) { toast.error(e.message) }
  }
  const del = async (c) => {
    if (!confirm(`Delete coupon ${c.code}?`)) return
    try { await api(`/admin/coupons/${c.id}`, { method: 'DELETE' }); mutate(); toast.success('Coupon deleted') } catch (e) { toast.error(e.message) }
  }
  return (
    <div>
      <PageHeader title="Coupons" subtitle="Validated server-side at checkout." actions={<Button size="sm" onClick={() => setEditing('new')} className="bg-brand text-brand-foreground hover:opacity-90" data-testid="add-coupon"><Plus className="h-4 w-4 mr-1" />New coupon</Button>} />
      <div className="rounded-xl border bg-card divide-y">
        {coupons.length === 0 && <div className="p-6"><Empty title="No coupons yet" subtitle="Create a welcome offer to drive first orders." /></div>}
        {coupons.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3" data-testid={`coupon-${c.code}`}>
            <div className="h-10 w-10 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0"><Tag className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="font-mono font-bold">{c.code} <span className="font-sans font-medium text-sm text-muted-foreground">· {c.type === 'PERCENT' ? `${c.value}% off` : `${money(c.value, tenant.currency)} off`}{c.max_discount ? ` (max ${money(c.max_discount, tenant.currency)})` : ''}</span></div>
              <div className="text-xs text-muted-foreground truncate">{c.min_order ? `Min order ${money(c.min_order, tenant.currency)} · ` : ''}Used {c.used_count || 0}{c.usage_limit ? `/${c.usage_limit}` : ''} times{c.per_user_limit ? ` · ${c.per_user_limit} per customer` : ''}{c.ends_at ? ` · Expires ${new Date(c.ends_at).toLocaleDateString('en-IN')}` : ''}{c.description ? ` · ${c.description}` : ''}</div>
            </div>
            <Switch checked={!!c.is_active} onCheckedChange={() => toggle(c)} />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => del(c)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <CouponDialog coupon={editing} onClose={() => setEditing(null)} onSaved={() => { mutate(); setEditing(null) }} />
    </div>
  )
}
