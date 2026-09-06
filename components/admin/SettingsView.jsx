'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { useTenant } from '@/components/shared/TenantProvider'
import { api, fetcher, MODE_META } from '@/lib/client'
import { PageHeader, Field, ROLE_LABEL } from './ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Loader2, Plus, Globe, CheckCircle2, Clock } from 'lucide-react'

function SaveBar({ busy, onSave }) {
  return <div className="flex justify-end"><Button onClick={onSave} disabled={busy} className="bg-brand text-brand-foreground hover:opacity-90" data-testid="settings-save">{busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save changes</Button></div>
}

function StaffTab({ user }) {
  const { data, mutate } = useSWR('/admin/staff', fetcher)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'kitchen' })
  const [busy, setBusy] = useState(false)
  const add = async () => {
    setBusy(true)
    try { await api('/admin/staff', { method: 'POST', body: form }); toast.success('Staff member added'); setOpen(false); setForm({ name: '', email: '', password: '', role: 'kitchen' }); mutate() } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const setStatus = async (s, status) => {
    try { await api(`/admin/staff/${s.id}`, { method: 'PATCH', body: { status } }); mutate() } catch (e) { toast.error(e.message) }
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><p className="text-sm text-muted-foreground">Staff can only access this business. Roles limit what they can do.</p>{user.role === 'owner' && <Button size="sm" onClick={() => setOpen(true)} className="bg-brand text-brand-foreground hover:opacity-90"><Plus className="h-4 w-4 mr-1" />Add staff</Button>}</div>
      <div className="rounded-xl border bg-card divide-y">
        {(data?.staff || []).map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="h-9 w-9 rounded-full bg-muted font-bold flex items-center justify-center">{s.name[0]}</div>
            <div className="flex-1 min-w-0"><div className="text-sm font-medium">{s.name}{s.id === user.id ? <span className="text-xs text-muted-foreground"> (you)</span> : null}</div><div className="text-xs text-muted-foreground">{s.email} · {ROLE_LABEL[s.role]}</div></div>
            <span className={`text-xs font-semibold ${s.status === 'active' ? 'text-emerald-700' : 'text-muted-foreground'}`}>{s.status}</span>
            {user.role === 'owner' && s.id !== user.id && <Button variant="outline" size="sm" onClick={() => setStatus(s, s.status === 'active' ? 'disabled' : 'active')}>{s.status === 'active' ? 'Disable' : 'Enable'}</Button>}
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add staff member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Temporary password"><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <Field label="Role"><Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['manager', 'kitchen', 'delivery', 'owner'].map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent></Select></Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add} disabled={busy || !form.name || !form.email || form.password.length < 6} className="bg-brand text-brand-foreground hover:opacity-90">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function SettingsView({ user }) {
  const { refresh } = useTenant()
  const { data, mutate } = useSWR('/admin/settings', fetcher, { revalidateOnFocus: false })
  const [s, setS] = useState(null)
  const [rz, setRz] = useState({ key_id: '', key_secret: '', webhook_secret: '', enabled: false })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (data?.settings) {
      setS(data.settings)
      setRz({ key_id: data.settings.payment_settings.razorpay.key_id || '', key_secret: '', webhook_secret: '', enabled: !!data.settings.payment_settings.razorpay.enabled })
    }
  }, [data])
  if (!s) return <div className="text-sm text-muted-foreground">Loading settings…</div>
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }))
  const setIn = (k, sub, v) => setS((x) => ({ ...x, [k]: { ...(x[k] || {}), [sub]: v } }))

  const save = async (fields) => {
    setBusy(true)
    try {
      const body = {}
      for (const f of fields) body[f] = s[f]
      if (fields.includes('payment_settings')) body.payment_settings = { cod_enabled: s.payment_settings.cod_enabled, cod_label: s.payment_settings.cod_label, razorpay: { enabled: rz.enabled, key_id: rz.key_id, key_secret: rz.key_secret, webhook_secret: rz.webhook_secret } }
      const r = await api('/admin/settings', { method: 'PATCH', body })
      mutate({ ...data, settings: r.settings }, false)
      refresh()
      toast.success('Settings saved')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Branding, ordering rules, payments and staff for this business." />
      <Tabs defaultValue="brand">
        <TabsList className="flex-wrap h-auto"><TabsTrigger value="brand">Brand</TabsTrigger><TabsTrigger value="ordering">Ordering</TabsTrigger><TabsTrigger value="payments">Payments</TabsTrigger><TabsTrigger value="staff">Staff</TabsTrigger><TabsTrigger value="domains">Domains</TabsTrigger></TabsList>

        <TabsContent value="brand" className="mt-4 space-y-4">
          <div className="rounded-xl border bg-card p-4 grid gap-4 sm:grid-cols-2">
            <Field label="Business name"><Input value={s.business_name} onChange={(e) => set('business_name', e.target.value)} data-testid="settings-name" /></Field>
            <Field label="Tagline"><Input value={s.tagline || ''} onChange={(e) => set('tagline', e.target.value)} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={s.description || ''} onChange={(e) => set('description', e.target.value)} className="min-h-[64px] resize-none" /></Field>
            <Field label="Primary colour"><div className="flex gap-2"><input type="color" value={s.primary_color} onChange={(e) => set('primary_color', e.target.value.toUpperCase())} className="h-10 w-12 rounded-md border p-1" /><Input value={s.primary_color} onChange={(e) => set('primary_color', e.target.value)} /></div></Field>
            <Field label="Secondary colour"><div className="flex gap-2"><input type="color" value={s.secondary_color} onChange={(e) => set('secondary_color', e.target.value.toUpperCase())} className="h-10 w-12 rounded-md border p-1" /><Input value={s.secondary_color} onChange={(e) => set('secondary_color', e.target.value)} /></div></Field>
            <Field label="Logo URL"><Input value={s.logo || ''} onChange={(e) => set('logo', e.target.value || null)} placeholder="https://…" /></Field>
            <Field label="Hero image URL"><Input value={s.hero_image || ''} onChange={(e) => set('hero_image', e.target.value || null)} placeholder="https://…" /></Field>
            <Field label="Phone"><Input value={s.contact?.phone || ''} onChange={(e) => setIn('contact', 'phone', e.target.value)} /></Field>
            <Field label="Email"><Input value={s.contact?.email || ''} onChange={(e) => setIn('contact', 'email', e.target.value)} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={s.contact?.address || ''} onChange={(e) => setIn('contact', 'address', e.target.value)} /></Field>
          </div>
          <SaveBar busy={busy} onSave={() => save(['business_name', 'tagline', 'description', 'primary_color', 'secondary_color', 'logo', 'hero_image', 'contact'])} />
        </TabsContent>

        <TabsContent value="ordering" className="mt-4 space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <label className="flex items-center justify-between"><div><div className="text-sm font-semibold">Accepting orders</div><div className="text-xs text-muted-foreground">Turn off to pause ordering (menu stays visible).</div></div><Switch checked={s.is_open !== false} onCheckedChange={(v) => set('is_open', v)} data-testid="settings-open" /></label>
            <Field label="Opening hours (display)"><Input value={s.opening_hours || ''} onChange={(e) => set('opening_hours', e.target.value)} /></Field>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Ordering modes</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(data.order_modes || []).map((m) => {
                  const on = (s.ordering_modes || []).includes(m)
                  return <label key={m} className={`flex items-center justify-between rounded-lg border p-3 ${on ? 'border-brand bg-brand-soft' : ''}`}><div><div className="text-sm font-medium">{MODE_META[m].label}</div><div className="text-xs text-muted-foreground">{MODE_META[m].hint}</div></div><Switch checked={on} onCheckedChange={(v) => set('ordering_modes', v ? [...s.ordering_modes, m] : s.ordering_modes.filter((x) => x !== m))} /></label>
                })}
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4 grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3 text-sm font-semibold">Delivery</div>
            <Field label="Delivery fee"><Input value={s.delivery_settings?.fee ?? ''} onChange={(e) => setIn('delivery_settings', 'fee', e.target.value)} inputMode="decimal" /></Field>
            <Field label="Free delivery above"><Input value={s.delivery_settings?.free_above ?? ''} onChange={(e) => setIn('delivery_settings', 'free_above', e.target.value)} inputMode="decimal" /></Field>
            <Field label="Minimum order"><Input value={s.delivery_settings?.min_order ?? ''} onChange={(e) => setIn('delivery_settings', 'min_order', e.target.value)} inputMode="decimal" /></Field>
            <Field label="Delivery ETA (min)"><Input value={s.delivery_settings?.eta_min ?? ''} onChange={(e) => setIn('delivery_settings', 'eta_min', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Pickup ETA (min)"><Input value={s.pickup_settings?.eta_min ?? ''} onChange={(e) => setIn('pickup_settings', 'eta_min', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Packaging fee (delivery & pickup)"><Input value={s.packaging_fee ?? ''} onChange={(e) => set('packaging_fee', e.target.value)} inputMode="decimal" /></Field>
          </div>
          <div className="rounded-xl border bg-card p-4 grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3 text-sm font-semibold">Tax</div>
            <Field label="Tax label"><Input value={s.tax_settings?.label || ''} onChange={(e) => setIn('tax_settings', 'label', e.target.value)} /></Field>
            <Field label="Rate (%)"><Input value={s.tax_settings?.rate_percent ?? ''} onChange={(e) => setIn('tax_settings', 'rate_percent', e.target.value)} inputMode="decimal" /></Field>
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm">Prices include tax<Switch checked={!!s.tax_settings?.inclusive} onCheckedChange={(v) => setIn('tax_settings', 'inclusive', v)} /></label>
          </div>
          <SaveBar busy={busy} onSave={() => save(['is_open', 'opening_hours', 'ordering_modes', 'delivery_settings', 'pickup_settings', 'packaging_fee', 'tax_settings'])} />
        </TabsContent>

        <TabsContent value="payments" className="mt-4 space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <label className="flex items-center justify-between"><div><div className="text-sm font-semibold">Pay on delivery / at counter</div><div className="text-xs text-muted-foreground">Cash, card or UPI collected by you.</div></div><Switch checked={s.payment_settings.cod_enabled} onCheckedChange={(v) => setIn('payment_settings', 'cod_enabled', v)} /></label>
            <Field label="Label shown to customers"><Input value={s.payment_settings.cod_label} onChange={(e) => setIn('payment_settings', 'cod_label', e.target.value)} /></Field>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between"><div><div className="text-sm font-semibold">Razorpay (online payments)</div><div className="text-xs text-muted-foreground">Each business connects its own Razorpay account. Keys are stored server-side only.</div></div><Switch checked={rz.enabled} onCheckedChange={(v) => setRz({ ...rz, enabled: v })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Key ID"><Input value={rz.key_id} onChange={(e) => setRz({ ...rz, key_id: e.target.value })} placeholder="rzp_test_…" /></Field>
              <Field label="Key secret" hint={s.payment_settings.razorpay.key_secret_set ? 'A secret is saved. Leave blank to keep it.' : ''}><Input type="password" value={rz.key_secret} onChange={(e) => setRz({ ...rz, key_secret: e.target.value })} placeholder={s.payment_settings.razorpay.key_secret_set ? '••••••••' : ''} /></Field>
              <Field label="Webhook secret" hint={s.payment_settings.razorpay.webhook_secret_set ? 'Saved.' : ''}><Input type="password" value={rz.webhook_secret} onChange={(e) => setRz({ ...rz, webhook_secret: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">Online checkout activates once the Razorpay integration is switched on for the platform. Keys can be saved now.</p>
          </div>
          <SaveBar busy={busy} onSave={() => save(['payment_settings'])} />
        </TabsContent>

        <TabsContent value="staff" className="mt-4"><StaffTab user={user} /></TabsContent>

        <TabsContent value="domains" className="mt-4">
          <div className="rounded-xl border bg-card divide-y">
            {(data.domains || []).map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1"><div className="font-mono text-sm">{d.domain}{d.is_primary && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold">PRIMARY</span>}</div><div className="text-xs text-muted-foreground">Customers order at {d.domain}/order · admin at {d.domain}/admin</div></div>
                {d.verified ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Active</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Clock className="h-3.5 w-3.5" />Pending verification</span>}
              </div>
            ))}
            {!data.domains?.length && <div className="p-4 text-sm text-muted-foreground">No domains attached yet.</div>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Domains are attached and verified by the platform team. Point your DNS to the platform via Cloudflare and we take care of SSL and routing.</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
