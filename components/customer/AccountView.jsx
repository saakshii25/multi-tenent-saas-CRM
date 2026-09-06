'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTenant } from '@/components/shared/TenantProvider'
import { useCustomer } from './store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/client'
import { LogIn, LogOut, MapPin, Trash2, ReceiptText, ChevronRight } from 'lucide-react'

export function AccountView() {
  const { tenant } = useTenant()
  const { customer, loading, openAuth, logout, refresh } = useCustomer()
  const [form, setForm] = useState({ name: '', email: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (customer) setForm({ name: customer.name || '', email: customer.email || '' })
  }, [customer])

  if (loading) return null
  if (!customer) {
    return (
      <div className="pt-16 text-center">
        <h2 className="text-lg font-bold">You&apos;re not signed in</h2>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to manage your profile and addresses.</p>
        <Button onClick={() => openAuth(null)} className="mt-6 bg-brand text-brand-foreground hover:opacity-90"><LogIn className="h-4 w-4 mr-2" />Continue with phone</Button>
      </div>
    )
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await api('/auth/me', { method: 'PATCH', body: form })
      refresh({ customer: r.customer }, false)
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }
  const removeAddress = async (id) => {
    try {
      const r = await api(`/auth/addresses/${id}`, { method: 'DELETE' })
      refresh({ customer: { ...customer, addresses: r.addresses } }, false)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="pt-4 space-y-4">
      <div className="rounded-xl border p-4 flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-brand text-brand-foreground font-bold text-lg flex items-center justify-center">{(customer.name || '?')[0]?.toUpperCase()}</div>
        <div className="min-w-0"><div className="font-semibold truncate">{customer.name || 'Guest'}</div><div className="text-sm text-muted-foreground">+{customer.phone}</div></div>
      </div>

      <Link href="/order/orders" className="flex items-center justify-between rounded-xl border p-4 hover:bg-muted/40">
        <span className="flex items-center gap-3 text-sm font-semibold"><ReceiptText className="h-4 w-4 text-brand" />Your orders</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      <form onSubmit={save} className="rounded-xl border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Profile</h3>
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
        <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" inputMode="email" /></div>
        <Button type="submit" disabled={saving} size="sm" className="bg-brand text-brand-foreground hover:opacity-90">Save</Button>
      </form>

      <div className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-brand" />Saved addresses</h3>
        {customer.addresses?.length ? (
          <div className="mt-2 divide-y">
            {customer.addresses.map((a) => (
              <div key={a.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                <div><div className="font-medium">{a.label}</div><div className="text-muted-foreground">{[a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', ')}</div></div>
                <button onClick={() => removeAddress(a.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete address"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Addresses you use at checkout are saved here.</p>
        )}
      </div>

      <Button variant="outline" onClick={async () => { await logout(); toast.success('Signed out') }} className="w-full"><LogOut className="h-4 w-4 mr-2" />Sign out</Button>
      <p className="text-center text-xs text-muted-foreground">Signed in to {tenant.business_name}</p>
    </div>
  )
}
