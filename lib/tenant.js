import { getDb } from './db'

// -------- Host detection --------
export function getHost(request) {
  const raw = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  return raw.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '')
}

// Hosts that belong to the SaaS platform itself (preview / localhost). Only on
// these hosts do we honour the preview tenant-switcher cookie. On a real
// merchant domain the tenant is ALWAYS derived from the Host header.
export function platformHosts() {
  const set = new Set(['localhost', '127.0.0.1', '0.0.0.0'])
  try {
    set.add(new URL(process.env.NEXT_PUBLIC_BASE_URL).hostname.toLowerCase())
  } catch {}
  ;(process.env.PLATFORM_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .forEach((h) => set.add(h))
  return set
}
export function isPlatformHost(host) {
  return platformHosts().has(host)
}

// -------- Tenant resolution (server-controlled, never trusts client ids) --------
export async function resolveTenant(request) {
  const db = await getDb()
  const host = getHost(request)

  // 1. Custom domain -> tenant
  const domain = await db.collection('domains').findOne({ domain: host, status: 'active' })
  if (domain) {
    const tenant = await db.collection('tenants').findOne({ id: domain.tenant_id })
    if (tenant && tenant.status === 'active') return { tenant, host, via: 'domain' }
    return { tenant: null, host, error: 'TENANT_INACTIVE' }
  }

  // 2. Platform host -> preview cookie / default demo tenant
  if (isPlatformHost(host)) {
    const slug = request.cookies.get('preview_tenant')?.value
    let tenant = slug ? await db.collection('tenants').findOne({ slug, status: 'active' }) : null
    if (!tenant) tenant = await db.collection('tenants').findOne({ is_default_demo: true, status: 'active' })
    if (!tenant) tenant = await db.collection('tenants').findOne({ status: 'active' }, { sort: { created_at: 1 } })
    if (tenant) return { tenant, host, via: 'preview' }
    return { tenant: null, host, error: 'NO_TENANTS' }
  }

  return { tenant: null, host, error: 'UNKNOWN_DOMAIN' }
}

// Strip secrets before sending tenant config to browsers.
export function publicTenant(t) {
  if (!t) return null
  const { _id, payment_settings, qr_settings, ...rest } = t
  return {
    ...rest,
    payment: {
      cod_enabled: payment_settings?.cod_enabled !== false,
      cod_label: payment_settings?.cod_label || 'Pay on delivery / at counter',
      razorpay_enabled: !!payment_settings?.razorpay?.enabled,
      razorpay_key_id: payment_settings?.razorpay?.enabled ? payment_settings.razorpay.key_id : null,
    },
  }
}
