'use client'

import { createContext, useContext, useEffect } from 'react'
import useSWR from 'swr'
import { fetcher, applyBrand } from '@/lib/client'
import { Store, AlertTriangle } from 'lucide-react'

const TenantCtx = createContext(null)

export function TenantProvider({ children }) {
  const { data, error, isLoading, mutate } = useSWR('/tenant', fetcher, { revalidateOnFocus: false, dedupingInterval: 15000 })
  const tenant = data?.tenant

  useEffect(() => {
    if (tenant) {
      applyBrand(tenant)
      document.title = tenant.business_name
    }
  }, [tenant])

  if (isLoading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-10 w-10 rounded-2xl bg-muted animate-pulse" />
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    )
  }
  if (error || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
            {error?.status === 404 ? <Store className="h-6 w-6 text-muted-foreground" /> : <AlertTriangle className="h-6 w-6 text-muted-foreground" />}
          </div>
          <h1 className="text-xl font-semibold">{error?.status === 404 ? 'No business is set up on this domain' : 'Something went wrong'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error?.status === 404
              ? `The domain ${error?.data?.host || ''} is not connected to any business yet. If you are the owner, add and verify this domain in the platform console.`
              : 'We could not load this page. Please try again in a moment.'}
          </p>
        </div>
      </div>
    )
  }
  return <TenantCtx.Provider value={{ tenant, domains: data.domains || [], preview: data.preview || { enabled: false }, refresh: mutate }}>{children}</TenantCtx.Provider>
}

export function useTenant() {
  return useContext(TenantCtx)
}

export function TenantLogo({ tenant, size = 'md', className = '' }) {
  const dims = size === 'lg' ? 'h-14 w-14 text-xl' : size === 'sm' ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-base'
  if (tenant?.logo) return <img src={tenant.logo} alt={tenant.business_name} className={`${dims} rounded-xl object-cover ${className}`} />
  const initials = (tenant?.business_name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <div className={`${dims} rounded-xl bg-brand text-brand-foreground font-bold flex items-center justify-center ${className}`}>
      {initials}
    </div>
  )
}
