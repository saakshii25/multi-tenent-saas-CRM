'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { api, fetcher, money, timeAgo, fmtDateTime, MODE_META } from '@/lib/client'
import { PageHeader, StatCard, Field } from '@/components/admin/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Layers, Building2, Globe, Activity, LogOut, Plus, CheckCircle2, Clock, Loader2, ExternalLink, ShieldCheck, Copy, RefreshCw, Star, Ban, Play } from 'lucide-react'

const TYPES = ['HOTEL', 'RESTAURANT', 'CAFE', 'BAKERY', 'QSR', 'CLOUD_KITCHEN', 'FOOD_COURT']
const COLORS = ['#1F6F5F', '#1E3A5F', '#7C2D12', '#B45309', '#4C1D95', '#065F46', '#0F172A', '#BE123C']

function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { const r = await api('/platform/auth/login', { method: 'POST', body: { email, password } }); onLogin(r.user) } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400"><Layers className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-wider">Platform console</span></div>
        <div><h1 className="text-lg font-bold">Super admin sign in</h1><p className="text-sm text-slate-400">Internal access only.</p></div>
        <div><Label className="text-slate-300">Email</Label><Input data-testid="platform-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-11 bg-slate-950 border-slate-700 text-white" /></div>
        <div><Label className="text-slate-300">Password</Label><Input data-testid="platform-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-11 bg-slate-950 border-slate-700 text-white" /></div>
        <Button type="submit" disabled={busy} className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold" data-testid="platform-login">{busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Sign in</Button>
        <button type="button" onClick={() => { setEmail('admin@platform.demo'); setPassword('super123') }} className="w-full text-left rounded-lg border border-dashed border-slate-700 p-3 text-xs text-slate-400 hover:bg-slate-800"><span className="font-semibold text-slate-200">Demo:</span> admin@platform.demo / super123</button>
      </form>
    </div>
  )
}

function Overview() {
  const { data } = useSWR('/platform/overview', fetcher, { refreshInterval: 20000 })
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>
  return (
    <div>
      <PageHeader title="Platform overview" subtitle="Everything across all tenants." />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        <StatCard label="Tenants" value={data.tenants} />
        <StatCard label="Active tenants" value={data.active_tenants} tone="good" />
        <StatCard label="Active domains" value={data.domains} />
        <StatCard label="Customers" value={data.customers} />
        <StatCard label="Orders · 30d" value={data.orders_30d} />
        <StatCard label="GMV · 30d" value={money(data.gmv_30d)} tone="good" />
      </div>
      <div className="mt-6 rounded-xl border bg-card">
        <div className="p-4 font-semibold flex items-center gap-2"><Activity className="h-4 w-4" />Recent platform activity</div>
        <div className="divide-y border-t">
          {data.recent_activity.map((a) => <div key={a.id} className="px-4 py-2.5 text-sm flex items-center gap-3"><span className="font-mono text-xs rounded bg-muted px-1.5 py-0.5">{a.action}</span><span className="text-muted-foreground text-xs flex-1 truncate">{a.entity} · {a.actor_role}</span><span className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</span></div>)}
        </div>
      </div>
    </div>
  )
}

function CreateTenantDialog({ open, onClose, onCreated }) {
  const [f, setF] = useState({ business_name: '', slug: '', business_type: 'RESTAURANT', primary_color: '#1F6F5F', tagline: '', owner_name: '', owner_email: '', owner_password: '', domain: '', plan: 'STARTER' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const create = async () => {
    setBusy(true)
    try { const r = await api('/platform/tenants', { method: 'POST', body: { ...f, slug: f.slug || undefined, domain: f.domain || undefined } }); toast.success(`${r.tenant.business_name} created`); onCreated(r) } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create tenant</DialogTitle><DialogDescription>Provisions a business, its owner login and (optionally) its primary domain.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name"><Input value={f.business_name} onChange={(e) => set('business_name', e.target.value)} data-testid="tenant-name" /></Field>
          <Field label="Slug (optional)"><Input value={f.slug} onChange={(e) => set('slug', e.target.value)} placeholder="auto from name" /></Field>
          <Field label="Business type"><Select value={f.business_type} onValueChange={(v) => set('business_type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Plan"><Select value={f.plan} onValueChange={(v) => set('plan', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['STARTER', 'GROWTH', 'ENTERPRISE'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Brand colour" className="sm:col-span-2"><div className="flex flex-wrap gap-2">{COLORS.map((c) => <button key={c} type="button" onClick={() => set('primary_color', c)} className={`h-8 w-8 rounded-full border-2 ${f.primary_color === c ? 'border-foreground' : 'border-transparent'}`} style={{ background: c }} />)}<Input value={f.primary_color} onChange={(e) => set('primary_color', e.target.value)} className="w-28 h-8" /></div></Field>
          <Field label="Tagline" className="sm:col-span-2"><Input value={f.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>
          <Field label="Owner name"><Input value={f.owner_name} onChange={(e) => set('owner_name', e.target.value)} data-testid="owner-name" /></Field>
          <Field label="Owner email"><Input type="email" value={f.owner_email} onChange={(e) => set('owner_email', e.target.value)} data-testid="owner-email" /></Field>
          <Field label="Owner password"><Input value={f.owner_password} onChange={(e) => set('owner_password', e.target.value)} data-testid="owner-password" /></Field>
          <Field label="Primary domain (optional)" hint="e.g. cafexyz.com – verified via DNS TXT record"><Input value={f.domain} onChange={(e) => set('domain', e.target.value)} placeholder="cafexyz.com" data-testid="tenant-domain" /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={create} disabled={busy || !f.business_name || !f.owner_name || !f.owner_email || f.owner_password.length < 6} className="bg-emerald-600 hover:bg-emerald-500 text-white" data-testid="tenant-create">{busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Create tenant</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Tenants() {
  const { data, mutate } = useSWR('/platform/tenants', fetcher)
  const [open, setOpen] = useState(false)
  const tenants = data?.tenants || []
  const patch = async (t, body) => {
    try { await api(`/platform/tenants/${t.id}`, { method: 'PATCH', body }); mutate(); toast.success('Tenant updated') } catch (e) { toast.error(e.message) }
  }
  const preview = async (t) => {
    try { await api('/preview/switch', { method: 'POST', body: { slug: t.slug } }); window.open('/order', '_blank') } catch (e) { toast.error(e.message) }
  }
  return (
    <div>
      <PageHeader title="Tenants" subtitle={`${tenants.length} businesses on the platform`} actions={<Button size="sm" onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white" data-testid="new-tenant"><Plus className="h-4 w-4 mr-1" />New tenant</Button>} />
      <div className="grid gap-3">
        {tenants.map((t) => (
          <div key={t.id} className="rounded-xl border bg-card p-4" data-testid={`tenant-${t.slug}`}>
            <div className="flex flex-wrap items-start gap-4">
              <div className="h-11 w-11 rounded-xl text-white font-bold flex items-center justify-center shrink-0" style={{ background: t.primary_color }}>{t.business_name.split(' ').slice(0, 2).map((w) => w[0]).join('')}</div>
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap"><span className="font-bold">{t.business_name}</span><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{t.business_type.replace('_', ' ')}</span><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{t.status.toUpperCase()}</span>{t.is_default_demo && <span className="rounded bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[10px] font-semibold">DEFAULT PREVIEW</span>}</div>
                <div className="mt-1 text-xs text-muted-foreground">slug <span className="font-mono">{t.slug}</span> · {t.plan} · {t.subscription_status} · modes: {(t.ordering_modes || []).map((m) => MODE_META[m]?.label).join(', ')}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.domains.map((d) => <span key={d.id} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-mono ${d.verified ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{d.verified ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{d.domain}{d.is_primary && <Star className="h-3 w-3 fill-current" />}</span>)}
                  {!t.domains.length && <span className="text-xs text-muted-foreground">No domain attached</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><div className="text-lg font-bold">{t.stats.orders}</div><div className="text-[11px] text-muted-foreground">Orders</div></div>
                <div><div className="text-lg font-bold">{money(t.stats.gmv, t.currency)}</div><div className="text-[11px] text-muted-foreground">GMV</div></div>
                <div><div className="text-lg font-bold">{t.stats.customers}</div><div className="text-[11px] text-muted-foreground">Customers</div></div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
              <Button size="sm" variant="outline" onClick={() => preview(t)}><Play className="h-3.5 w-3.5 mr-1" />Preview storefront</Button>
              <Select value={t.plan} onValueChange={(v) => patch(t, { plan: v })}><SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger><SelectContent>{['STARTER', 'GROWTH', 'ENTERPRISE'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
              {!t.is_default_demo && <Button size="sm" variant="ghost" onClick={() => patch(t, { is_default_demo: true })}>Make default preview</Button>}
              <div className="flex-1" />
              <Button size="sm" variant={t.status === 'active' ? 'ghost' : 'default'} onClick={() => patch(t, { status: t.status === 'active' ? 'disabled' : 'active' })} className={t.status === 'active' ? 'text-destructive' : ''}><Ban className="h-3.5 w-3.5 mr-1" />{t.status === 'active' ? 'Deactivate' : 'Activate'}</Button>
            </div>
          </div>
        ))}
      </div>
      <CreateTenantDialog open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); mutate() }} />
    </div>
  )
}

function Domains() {
  const { data, mutate } = useSWR('/platform/domains', fetcher)
  const { data: td } = useSWR('/platform/tenants', fetcher)
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ tenant_id: '', domain: '', is_primary: false })
  const [busy, setBusy] = useState(null)
  const tenants = td?.tenants || []
  const nameOf = (id) => tenants.find((t) => t.id === id)?.business_name || '—'
  const add = async () => {
    setBusy('add')
    try { await api('/platform/domains', { method: 'POST', body: f }); toast.success('Domain added – add the TXT record to verify'); setOpen(false); setF({ tenant_id: '', domain: '', is_primary: false }); mutate() } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }
  const verify = async (d, force = false) => {
    setBusy(d.id)
    try { const r = await api(`/platform/domains/${d.id}/verify`, { method: 'POST', body: { force } }); r.verified ? toast.success(`${d.domain} verified and active`) : toast.error(r.detail || 'Verification failed'); mutate() } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }
  const patch = async (d, body) => { try { await api(`/platform/domains/${d.id}`, { method: 'PATCH', body }); mutate() } catch (e) { toast.error(e.message) } }
  const del = async (d) => { if (!confirm(`Remove ${d.domain}?`)) return; try { await api(`/platform/domains/${d.id}`, { method: 'DELETE' }); mutate() } catch (e) { toast.error(e.message) } }
  return (
    <div>
      <PageHeader title="Domains" subtitle="Each tenant is served on its own domain. Requests are matched on the Host header." actions={<Button size="sm" onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white" data-testid="add-domain"><Plus className="h-4 w-4 mr-1" />Add domain</Button>} />
      <div className="rounded-xl border bg-card divide-y">
        {(data?.domains || []).map((d) => (
          <div key={d.id} className="px-4 py-3" data-testid={`domain-${d.domain}`}>
            <div className="flex flex-wrap items-center gap-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-[200px]"><div className="font-mono text-sm font-semibold">{d.domain}{d.is_primary && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-sans font-semibold">PRIMARY</span>}</div><div className="text-xs text-muted-foreground">{nameOf(d.tenant_id)} · added {timeAgo(d.created_at)}</div></div>
              {d.verified ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Verified · SSL {d.ssl_status}</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Clock className="h-3.5 w-3.5" />Pending</span>}
              <div className="flex items-center gap-1">
                {!d.verified && <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => verify(d)}>{busy === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}Check DNS</Button>}
                {!d.verified && <Button size="sm" variant="ghost" disabled={busy === d.id} onClick={() => verify(d, true)} title="Mark verified manually"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Force verify</Button>}
                {!d.is_primary && <Button size="sm" variant="ghost" onClick={() => patch(d, { is_primary: true })}><Star className="h-3.5 w-3.5 mr-1" />Primary</Button>}
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(d)}>Remove</Button>
              </div>
            </div>
            {!d.verified && (
              <div className="mt-2 rounded-lg bg-muted/60 p-3 text-xs">
                <div className="font-semibold mb-1">DNS setup (Cloudflare)</div>
                <div className="grid gap-1 font-mono">
                  <div>TXT&nbsp;&nbsp;_saas-verify.{d.domain}&nbsp;&nbsp;→&nbsp;&nbsp;{d.verification_token} <button onClick={() => { navigator.clipboard?.writeText(d.verification_token); toast.success('Copied') }} className="inline-flex align-middle ml-1 text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button></div>
                  <div>CNAME&nbsp;{d.domain}&nbsp;&nbsp;→&nbsp;&nbsp;{typeof window !== 'undefined' ? window.location.hostname : 'platform host'} (proxied)</div>
                </div>
                {d.last_check_detail && <div className="mt-1 text-amber-700">Last check: {d.last_check_detail}</div>}
              </div>
            )}
          </div>
        ))}
        {data && !data.domains.length && <div className="p-6 text-sm text-muted-foreground">No domains yet.</div>}
      </div>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Attach a domain</DialogTitle><DialogDescription>The domain resolves to the tenant only after verification.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Field label="Tenant"><Select value={f.tenant_id} onValueChange={(v) => setF({ ...f, tenant_id: v })}><SelectTrigger><SelectValue placeholder="Choose tenant" /></SelectTrigger><SelectContent>{tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.business_name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Domain"><Input value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} placeholder="orders.cafexyz.com" data-testid="domain-input" /></Field>
            <label className="flex items-center justify-between text-sm">Set as primary<Switch checked={f.is_primary} onCheckedChange={(v) => setF({ ...f, is_primary: v })} /></label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add} disabled={busy === 'add' || !f.tenant_id || !f.domain} className="bg-emerald-600 hover:bg-emerald-500 text-white" data-testid="domain-save">Add domain</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const NAV = [
  { key: '', href: '/platform', label: 'Overview', icon: Layers },
  { key: 'tenants', href: '/platform/tenants', label: 'Tenants', icon: Building2 },
  { key: 'domains', href: '/platform/domains', label: 'Domains', icon: Globe },
]

export default function PlatformApp() {
  const pathname = usePathname()
  const { data, isLoading, mutate } = useSWR('/platform/auth/me', fetcher, { revalidateOnFocus: false })
  const user = data?.user
  const seg = pathname.replace(/^\/platform\/?/, '').split('/')[0] || ''
  useEffect(() => { document.title = 'Platform console' }, [])

  if (isLoading && !data) return <div className="min-h-screen bg-slate-950" />
  if (data && data.user === null && !isLoading && data.error) return null
  if (!user) return <Login onLogin={(u) => mutate({ user: u }, false)} />

  const logout = async () => { await api('/platform/auth/logout', { method: 'POST' }); mutate({ user: null }, false) }
  const view = seg === 'tenants' ? <Tenants /> : seg === 'domains' ? <Domains /> : <Overview />

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2 text-emerald-400 font-bold"><Layers className="h-5 w-5" />Platform</div>
          <nav className="flex items-center gap-1 ml-4">
            {NAV.map((n) => <Link key={n.key} href={n.href} className={`inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-sm font-medium ${seg === n.key ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white'}`}><n.icon className="h-4 w-4" />{n.label}</Link>)}
          </nav>
          <div className="flex-1" />
          <Link href="/" className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white"><ExternalLink className="h-3.5 w-3.5" />Preview site</Link>
          <span className="hidden sm:inline text-xs text-slate-400">{user.email}</span>
          <button onClick={logout} className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white"><LogOut className="h-3.5 w-3.5" />Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{view}</main>
    </div>
  )
}
