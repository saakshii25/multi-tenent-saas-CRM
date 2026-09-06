'use client'

import { useState } from 'react'
import { useTenant } from './TenantProvider'
import { api } from '@/lib/client'
import { Globe, ChevronDown, Check, ExternalLink, ShieldCheck } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'

// Shown only on the platform preview host. On a merchant's real domain the
// tenant is fixed by the Host header and this bar never renders.
export function PreviewBar() {
  const { tenant, preview, domains } = useTenant()
  const [busy, setBusy] = useState(false)
  if (!preview?.enabled) return null
  const primary = domains.find((d) => d.is_primary)?.domain || domains[0]?.domain

  async function switchTo(slug) {
    if (slug === tenant.slug) return
    setBusy(true)
    try {
      await api('/preview/switch', { method: 'POST', body: { slug } })
      const path = window.location.pathname.startsWith('/admin') ? '/admin' : window.location.pathname.startsWith('/order') ? '/order' : '/'
      window.location.href = path
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="print:hidden bg-slate-900 text-slate-200 text-xs">
      <div className="mx-auto max-w-6xl px-3 h-9 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">
            <span className="font-semibold text-white">Platform preview</span>
            <span className="hidden sm:inline text-slate-400"> · in production this tenant is served on </span>
            {primary && <span className="hidden sm:inline font-mono text-emerald-300">{primary}{window.location.pathname.startsWith('/admin') ? '/admin' : '/order'}</span>}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href="/platform" className="hidden md:inline-flex items-center gap-1 text-slate-300 hover:text-white">
            Platform console <ExternalLink className="h-3 w-3" />
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/15 px-2.5 py-1 font-medium text-white">
                <Globe className="h-3.5 w-3.5" />
                {tenant.business_name}
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Switch tenant (preview only)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(preview.tenants || []).map((t) => (
                <DropdownMenuItem key={t.slug} onClick={() => switchTo(t.slug)} className="gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.primary_color }} />
                  <span className="flex-1">{t.business_name}</span>
                  <span className="text-[10px] text-muted-foreground">{t.business_type}</span>
                  {t.slug === tenant.slug && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
