'use client'

import Link from 'next/link'
import { TenantProvider, useTenant, TenantLogo } from '@/components/shared/TenantProvider'
import { PreviewBar } from '@/components/shared/PreviewBar'
import { Button } from '@/components/ui/button'
import { MODE_META } from '@/lib/client'
import { ArrowRight, Clock, MapPin, Phone, LayoutDashboard, Globe, Layers, Lock } from 'lucide-react'

function Landing() {
  const { tenant, domains, preview } = useTenant()
  const primary = domains.find((d) => d.is_primary)?.domain || domains[0]?.domain

  return (
    <div className="min-h-screen bg-background">
      <PreviewBar />
      <header className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TenantLogo tenant={tenant} />
          <div>
            <div className="font-bold leading-tight">{tenant.business_name}</div>
            <div className="text-xs text-muted-foreground">{tenant.business_type.replace('_', ' ')}</div>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin"><LayoutDashboard className="h-4 w-4 mr-1.5" />Admin</Link>
          </Button>
          <Button asChild size="sm" className="bg-brand text-brand-foreground hover:opacity-90">
            <Link href="/order">Order now <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-4 pb-10">
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white min-h-[420px] flex items-end">
          {tenant.hero_image && <img src={tenant.hero_image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-transparent" />
          <div className="relative p-6 sm:p-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-medium mb-4">
              <span className={`h-2 w-2 rounded-full ${tenant.is_open ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {tenant.is_open ? 'Accepting orders' : 'Currently closed'} · {tenant.opening_hours}
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">{tenant.tagline || tenant.business_name}</h1>
            {tenant.description && <p className="mt-3 text-white/80 text-sm sm:text-base max-w-xl">{tenant.description}</p>}
            <div className="mt-6 flex flex-wrap gap-2">
              {(tenant.ordering_modes || []).map((m) => (
                <span key={m} className="rounded-full border border-white/25 px-3 py-1 text-xs font-medium">{MODE_META[m]?.label || m}</span>
              ))}
            </div>
            <div className="mt-8">
              <Button asChild size="lg" className="bg-brand text-brand-foreground hover:opacity-90 h-12 px-6 text-base">
                <Link href="/order">Browse the menu <ArrowRight className="h-4 w-4 ml-2" /></Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border p-4 flex gap-3">
            <Clock className="h-5 w-5 text-brand mt-0.5" />
            <div><div className="text-sm font-semibold">Hours</div><div className="text-sm text-muted-foreground">{tenant.opening_hours || '—'}</div></div>
          </div>
          <div className="rounded-2xl border p-4 flex gap-3">
            <MapPin className="h-5 w-5 text-brand mt-0.5" />
            <div><div className="text-sm font-semibold">Find us</div><div className="text-sm text-muted-foreground">{tenant.contact?.address || '—'}</div></div>
          </div>
          <div className="rounded-2xl border p-4 flex gap-3">
            <Phone className="h-5 w-5 text-brand mt-0.5" />
            <div><div className="text-sm font-semibold">Call</div><div className="text-sm text-muted-foreground">{tenant.contact?.phone || '—'}</div></div>
          </div>
        </div>
      </section>

      {preview?.enabled && (
        <section className="border-t bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3"><Layers className="h-4 w-4" /> How this works</div>
            <h2 className="text-2xl font-bold tracking-tight">One platform. Every business on its own domain.</h2>
            <p className="mt-2 text-muted-foreground max-w-2xl text-sm">
              You are viewing the shared ordering engine through the platform preview host. In production the tenant is resolved from the request&apos;s Host header, so customers only ever see the merchant&apos;s own domain.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border bg-white p-5">
                <Globe className="h-5 w-5 text-brand" />
                <div className="mt-3 font-semibold">Customer storefront</div>
                <code className="mt-1 block text-sm text-emerald-700">{primary || 'merchant.com'}/order</code>
                <p className="mt-2 text-xs text-muted-foreground">Menu, cart, checkout, order tracking – branded for {tenant.business_name}.</p>
                <Button asChild variant="outline" size="sm" className="mt-3"><Link href="/order">Open storefront</Link></Button>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <LayoutDashboard className="h-5 w-5 text-brand" />
                <div className="mt-3 font-semibold">Merchant admin</div>
                <code className="mt-1 block text-sm text-emerald-700">{primary || 'merchant.com'}/admin</code>
                <p className="mt-2 text-xs text-muted-foreground">Live orders, menu, customers, reports. Demo login: <span className="font-mono">owner@{tenant.slug.replace('-', '')}.demo</span> / <span className="font-mono">admin123</span></p>
                <Button asChild variant="outline" size="sm" className="mt-3"><Link href="/admin">Open admin</Link></Button>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <Lock className="h-5 w-5 text-brand" />
                <div className="mt-3 font-semibold">Platform console</div>
                <code className="mt-1 block text-sm text-emerald-700">{preview.host}/platform</code>
                <p className="mt-2 text-xs text-muted-foreground">Create tenants, attach & verify domains, see platform-wide metrics. Login: <span className="font-mono">admin@platform.demo</span> / <span className="font-mono">super123</span></p>
                <Button asChild variant="outline" size="sm" className="mt-3"><Link href="/platform">Open console</Link></Button>
              </div>
            </div>
          </div>
        </section>
      )}

      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
        <span>© {new Date().getFullYear()} {tenant.business_name}</span>
        <span>{tenant.contact?.email}</span>
      </footer>
    </div>
  )
}

function App() {
  return (
    <TenantProvider>
      <Landing />
    </TenantProvider>
  )
}

export default App
