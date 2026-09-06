'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { useCustomer } from './store'
import { useTenant } from '@/components/shared/TenantProvider'
import { api } from '@/lib/client'
import { Loader2, MessageSquareText, ArrowLeft } from 'lucide-react'

export function AuthSheet() {
  const { authReq, closeAuth, refresh } = useCustomer()
  const { tenant } = useTenant()
  const [step, setStep] = useState('phone')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [devOtp, setDevOtp] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (authReq) {
      setStep('phone')
      setCode('')
      setDevOtp(null)
    }
  }, [authReq])

  const request = async (e) => {
    e?.preventDefault()
    setBusy(true)
    try {
      const r = await api('/auth/otp/request', { method: 'POST', body: { phone } })
      setDevOtp(r.dev_otp || null)
      setStep('otp')
      setCode('')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const verify = async (c) => {
    const value = c || code
    if (value.length !== 6) return
    setBusy(true)
    try {
      const r = await api('/auth/otp/verify', { method: 'POST', body: { phone, code: value, name } })
      await refresh({ customer: r.customer }, false)
      toast.success(`Welcome${r.customer?.name ? `, ${r.customer.name.split(' ')[0]}` : ''}!`)
      const cb = authReq?.onSuccess
      closeAuth()
      if (cb) cb(r.customer)
    } catch (err) {
      toast.error(err.message)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={!!authReq} onOpenChange={(o) => !o && closeAuth()}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md pb-8">
          <DrawerHeader className="text-left">
            {step === 'otp' && (
              <button type="button" onClick={() => setStep('phone')} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft className="h-3.5 w-3.5" />Change number</button>
            )}
            <DrawerTitle>{step === 'phone' ? `Sign in to ${tenant.business_name}` : 'Enter the 6-digit code'}</DrawerTitle>
            <DrawerDescription>{step === 'phone' ? 'We’ll send a one-time code to your phone. No passwords.' : `Sent to +${phone.replace(/\D/g, '')}`}</DrawerDescription>
          </DrawerHeader>

          {step === 'phone' ? (
            <form onSubmit={request} className="px-4 space-y-4">
              <div>
                <Label htmlFor="auth-phone">Phone number</Label>
                <Input id="auth-phone" data-testid="auth-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoFocus placeholder="98765 43210" className="mt-1 h-12 text-base" />
              </div>
              <div>
                <Label htmlFor="auth-name">Your name <span className="text-muted-foreground">(first time only)</span></Label>
                <Input id="auth-name" data-testid="auth-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarav" className="mt-1 h-12 text-base" />
              </div>
              <Button type="submit" disabled={busy || phone.replace(/\D/g, '').length < 10} className="w-full h-12 bg-brand text-brand-foreground hover:opacity-90 font-bold" data-testid="auth-send">
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Send code
              </Button>
            </form>
          ) : (
            <div className="px-4 space-y-4">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={(v) => verify(v)} autoFocus data-testid="auth-otp">
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-11 text-lg" />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {devOtp && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                  <MessageSquareText className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    SMS delivery isn&apos;t connected in this environment, so here is your code: <span className="font-mono font-bold text-sm" data-testid="dev-otp">{devOtp}</span>
                    <button type="button" className="ml-2 underline font-semibold" onClick={() => { setCode(devOtp); verify(devOtp) }}>Use it</button>
                  </div>
                </div>
              )}
              <Button onClick={() => verify()} disabled={busy || code.length !== 6} className="w-full h-12 bg-brand text-brand-foreground hover:opacity-90 font-bold" data-testid="auth-verify">
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Verify & continue
              </Button>
              <button type="button" onClick={request} disabled={busy} className="w-full text-xs text-muted-foreground underline">Resend code</button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
