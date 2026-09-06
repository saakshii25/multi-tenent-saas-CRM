'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useTenant, TenantLogo } from '@/components/shared/TenantProvider'
import { PreviewBar } from '@/components/shared/PreviewBar'
import { api } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ShieldCheck } from 'lucide-react'

export function LoginView({ onLogin }) {
  const { tenant, preview } = useTenant()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const demoEmail = `owner@${tenant.slug.replace(/-/g, '')}.demo`

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await api('/admin/auth/login', { method: 'POST', body: { email, password } })
      onLogin(r.user)
      toast.success(`Welcome back, ${r.user.name.split(' ')[0]}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <PreviewBar />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-6">
            <TenantLogo tenant={tenant} />
            <div><div className="font-bold leading-tight">{tenant.business_name}</div><div className="text-xs text-muted-foreground">Merchant admin</div></div>
          </div>
          <form onSubmit={submit} className="rounded-2xl border bg-white p-6 space-y-4 shadow-sm">
            <div><h1 className="text-lg font-bold">Sign in</h1><p className="text-sm text-muted-foreground">Staff access for {tenant.business_name}</p></div>
            <div><Label htmlFor="email">Email</Label><Input id="email" data-testid="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className="mt-1 h-11" /></div>
            <div><Label htmlFor="password">Password</Label><Input id="password" data-testid="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="mt-1 h-11" /></div>
            <Button type="submit" disabled={busy} className="w-full h-11 bg-brand text-brand-foreground hover:opacity-90 font-semibold" data-testid="admin-login">{busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Sign in</Button>
            {preview?.enabled && (
              <button type="button" onClick={() => { setEmail(demoEmail); setPassword('admin123') }} className="w-full rounded-lg border border-dashed p-3 text-left text-xs text-muted-foreground hover:bg-muted/50">
                <div className="flex items-center gap-1.5 font-semibold text-foreground"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />Demo credentials (click to fill)</div>
                <div className="mt-1 font-mono">{demoEmail} / admin123</div>
                {tenant.slug === 'white-mug' && <div className="font-mono">kitchen@whitemug.demo / kitchen123</div>}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
