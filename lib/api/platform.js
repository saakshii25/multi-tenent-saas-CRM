import { NextResponse } from 'next/server'
import { v4 as uuid } from 'uuid'
import dns from 'dns/promises'
import { z } from 'zod'
import { bad, unauthorized, notFound } from './http'
import { getSession, setSessionCookie, clearSessionCookie, signToken, comparePassword, hashPassword } from '../auth'
import { clean, cleanAll, round2, slugify, isHexColor, daysAgo } from '../util'
import { REVENUE_STATUSES, ORDER_MODES, audit } from '../orders'
import { seedAll } from '../seed'

export const BUSINESS_TYPES = ['HOTEL', 'RESTAURANT', 'CAFE', 'BAKERY', 'QSR', 'CLOUD_KITCHEN', 'FOOD_COURT']

async function requireSuper(ctx) {
  const s = getSession(ctx.request, 'platform')
  if (!s || s.role !== 'super_admin') throw unauthorized('Please sign in to the platform console')
  const user = await ctx.db.collection('users').findOne({ id: s.sub, role: 'super_admin', status: 'active' })
  if (!user) throw unauthorized('Session is no longer valid')
  return user
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role })

function normalizeDomain(input) {
  let d = String(input || '').trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '')
  if (!/^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,63}$/.test(d) && !/^[a-z0-9-]+\.local$/.test(d)) return null
  return d
}

const tenantSchema = z.object({
  business_name: z.string().min(2).max(80),
  slug: z.string().max(60).optional(),
  business_type: z.enum(BUSINESS_TYPES),
  primary_color: z.string().optional().default('#1F6F5F'),
  secondary_color: z.string().optional().default('#F4EDE4'),
  tagline: z.string().max(120).optional().default(''),
  owner_name: z.string().min(1).max(80),
  owner_email: z.string().email(),
  owner_password: z.string().min(6).max(100),
  domain: z.string().optional(),
  ordering_modes: z.array(z.enum(ORDER_MODES)).optional(),
  plan: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']).optional().default('STARTER'),
  currency: z.string().max(5).optional().default('INR'),
  timezone: z.string().max(60).optional().default('Asia/Kolkata'),
})

const defaultModes = { HOTEL: ['ROOM_SERVICE', 'DINE_IN', 'PICKUP'], RESTAURANT: ['DELIVERY', 'PICKUP', 'DINE_IN'], CAFE: ['PICKUP', 'DINE_IN', 'DELIVERY'], BAKERY: ['PICKUP', 'DELIVERY'], QSR: ['PICKUP', 'DELIVERY', 'DINE_IN'], CLOUD_KITCHEN: ['DELIVERY', 'PICKUP'], FOOD_COURT: ['PICKUP', 'DINE_IN'] }

export function registerPlatformRoutes(r) {
  const meta = { platform: true }

  r.post('/platform/auth/login', async (ctx) => {
    const email = String(ctx.body?.email || '').trim().toLowerCase()
    const user = await ctx.db.collection('users').findOne({ email, role: 'super_admin', status: 'active' })
    if (!user || !(await comparePassword(ctx.body?.password || '', user.password_hash))) throw unauthorized('Incorrect email or password')
    const res = NextResponse.json({ user: publicUser(user) })
    setSessionCookie(res, 'platform', signToken({ sub: user.id, role: 'super_admin' }, '12h'))
    return res
  }, meta)
  r.get('/platform/auth/me', async (ctx) => {
    try { return { user: publicUser(await requireSuper(ctx)) } } catch { return { user: null } }
  }, meta)
  r.post('/platform/auth/logout', async () => {
    const res = NextResponse.json({ ok: true })
    clearSessionCookie(res, 'platform')
    return res
  }, meta)

  r.get('/platform/overview', async (ctx) => {
    await requireSuper(ctx)
    const db = ctx.db
    const [tenants, active, domains, customers, orders30, gmvRows, recentEvents] = await Promise.all([
      db.collection('tenants').countDocuments(),
      db.collection('tenants').countDocuments({ status: 'active' }),
      db.collection('domains').countDocuments({ status: 'active' }),
      db.collection('customers').countDocuments(),
      db.collection('orders').countDocuments({ created_at: { $gte: daysAgo(30) } }),
      db.collection('orders').aggregate([{ $match: { status: { $in: REVENUE_STATUSES }, created_at: { $gte: daysAgo(30) } } }, { $group: { _id: null, gmv: { $sum: '$total' } } }]).toArray(),
      db.collection('audit_logs').find({}).sort({ created_at: -1 }).limit(15).toArray(),
    ])
    return { tenants, active_tenants: active, domains, customers, orders_30d: orders30, gmv_30d: round2(gmvRows[0]?.gmv || 0), recent_activity: cleanAll(recentEvents) }
  }, meta)

  r.get('/platform/tenants', async (ctx) => {
    await requireSuper(ctx)
    const [tenants, domains, stats, custs] = await Promise.all([
      ctx.db.collection('tenants').find({}).sort({ created_at: 1 }).toArray(),
      ctx.db.collection('domains').find({}).toArray(),
      ctx.db.collection('orders').aggregate([{ $match: { status: { $in: REVENUE_STATUSES } } }, { $group: { _id: '$tenant_id', orders: { $sum: 1 }, gmv: { $sum: '$total' }, last_order_at: { $max: '$created_at' } } }]).toArray(),
      ctx.db.collection('customers').aggregate([{ $group: { _id: '$tenant_id', n: { $sum: 1 } } }]).toArray(),
    ])
    const sm = new Map(stats.map((s) => [s._id, s]))
    const cm = new Map(custs.map((c) => [c._id, c.n]))
    return {
      tenants: tenants.map((t) => {
        const { _id, payment_settings, ...rest } = t
        const s = sm.get(t.id)
        return { ...rest, domains: cleanAll(domains.filter((d) => d.tenant_id === t.id)), stats: { orders: s?.orders || 0, gmv: round2(s?.gmv || 0), customers: cm.get(t.id) || 0, last_order_at: s?.last_order_at || null }, payments: { cod: payment_settings?.cod_enabled !== false, razorpay: !!payment_settings?.razorpay?.enabled } }
      }),
      business_types: BUSINESS_TYPES,
    }
  }, meta)

  r.post('/platform/tenants', async (ctx) => {
    const admin = await requireSuper(ctx)
    const p = tenantSchema.safeParse(ctx.body)
    if (!p.success) throw bad(`${p.error.issues[0].path.join('.')}: ${p.error.issues[0].message}`)
    const d = p.data
    if (!isHexColor(d.primary_color) || !isHexColor(d.secondary_color)) throw bad('Colours must be hex like #1F6F5F')
    let slug = slugify(d.slug || d.business_name)
    if (!slug) throw bad('Invalid slug')
    if (await ctx.db.collection('tenants').findOne({ slug })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`
    let domain = null
    if (d.domain) {
      domain = normalizeDomain(d.domain)
      if (!domain) throw bad('Enter a valid domain like cafexyz.com')
      if (await ctx.db.collection('domains').findOne({ domain })) throw bad('This domain is already attached to another tenant')
    }
    const now = new Date()
    const tenant = {
      id: uuid(), slug, is_default_demo: false, business_name: d.business_name, business_type: d.business_type, tagline: d.tagline, description: '',
      logo: null, hero_image: null, primary_color: d.primary_color, secondary_color: d.secondary_color, currency: d.currency, timezone: d.timezone,
      contact: { phone: '', email: d.owner_email, address: '' }, opening_hours: '', is_open: true,
      ordering_modes: d.ordering_modes?.length ? d.ordering_modes : defaultModes[d.business_type],
      delivery_settings: { fee: 40, free_above: 0, min_order: 0, radius_km: 5, eta_min: 40 }, pickup_settings: { eta_min: 20 },
      tax_settings: { rate_percent: 5, inclusive: false, label: 'GST' }, packaging_fee: 0,
      payment_settings: { cod_enabled: true, cod_label: 'Pay on delivery / at counter', razorpay: { enabled: false, key_id: '', key_secret: '', webhook_secret: '' } },
      notification_settings: { email: true, in_app: true },
      plan: d.plan, subscription_status: 'TRIAL', subscription_start: now, subscription_end: new Date(now.getTime() + 14 * 86400000), trial_status: 'ACTIVE', billing_provider: null,
      status: 'active', created_at: now, updated_at: now,
    }
    await ctx.db.collection('tenants').insertOne(tenant)
    const owner = { id: uuid(), tenant_id: tenant.id, email: d.owner_email.toLowerCase(), name: d.owner_name, role: 'owner', password_hash: await hashPassword(d.owner_password), status: 'active', created_at: now }
    await ctx.db.collection('users').insertOne(owner)
    let domainDoc = null
    if (domain) {
      domainDoc = { id: uuid(), tenant_id: tenant.id, domain, is_primary: true, verified: false, status: 'pending', ssl_status: 'pending', verification_token: `saas-verify=${uuid()}`, created_at: now }
      await ctx.db.collection('domains').insertOne(domainDoc)
    }
    await ctx.db.collection('categories').insertOne({ id: uuid(), tenant_id: tenant.id, name: 'Popular', description: '', image: null, sort_order: 1, is_active: true, created_at: now })
    await audit(ctx.db, tenant.id, { actor_id: admin.id, actor_role: 'super_admin', action: 'TENANT_CREATED', entity: 'tenant', entity_id: tenant.id, meta: { slug, domain } })
    const { _id, payment_settings, ...rest } = tenant
    return { tenant: rest, owner: publicUser(owner), domain: domainDoc ? clean(domainDoc) : null }
  }, meta)

  r.patch('/platform/tenants/:id', async (ctx) => {
    const admin = await requireSuper(ctx)
    const b = ctx.body || {}
    const set = { updated_at: new Date() }
    if (b.status && ['active', 'disabled'].includes(b.status)) set.status = b.status
    if (b.plan && ['STARTER', 'GROWTH', 'ENTERPRISE'].includes(b.plan)) set.plan = b.plan
    if (b.subscription_status && ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED'].includes(b.subscription_status)) set.subscription_status = b.subscription_status
    if (b.business_type && BUSINESS_TYPES.includes(b.business_type)) set.business_type = b.business_type
    if (typeof b.business_name === 'string' && b.business_name.trim()) set.business_name = b.business_name.trim().slice(0, 80)
    if (typeof b.is_default_demo === 'boolean') {
      if (b.is_default_demo) await ctx.db.collection('tenants').updateMany({}, { $set: { is_default_demo: false } })
      set.is_default_demo = b.is_default_demo
    }
    const res = await ctx.db.collection('tenants').findOneAndUpdate({ id: ctx.params.id }, { $set: set }, { returnDocument: 'after' })
    if (!res) throw notFound('Tenant not found')
    await audit(ctx.db, res.id, { actor_id: admin.id, actor_role: 'super_admin', action: 'TENANT_UPDATED', entity: 'tenant', entity_id: res.id, meta: { fields: Object.keys(set) } })
    const { _id, payment_settings, ...rest } = res
    return { tenant: rest }
  }, meta)

  // ---------- Domains ----------
  r.get('/platform/domains', async (ctx) => {
    await requireSuper(ctx)
    const list = await ctx.db.collection('domains').find({}).sort({ created_at: -1 }).toArray()
    return { domains: cleanAll(list) }
  }, meta)
  r.post('/platform/domains', async (ctx) => {
    const admin = await requireSuper(ctx)
    const domain = normalizeDomain(ctx.body?.domain)
    if (!domain) throw bad('Enter a valid domain like cafexyz.com')
    const tenant = await ctx.db.collection('tenants').findOne({ id: ctx.body?.tenant_id })
    if (!tenant) throw bad('Tenant not found')
    if (await ctx.db.collection('domains').findOne({ domain })) throw bad('This domain is already attached to a tenant')
    const doc = { id: uuid(), tenant_id: tenant.id, domain, is_primary: !!ctx.body?.is_primary, verified: false, status: 'pending', ssl_status: 'pending', verification_token: `saas-verify=${uuid()}`, created_at: new Date() }
    if (doc.is_primary) await ctx.db.collection('domains').updateMany({ tenant_id: tenant.id }, { $set: { is_primary: false } })
    await ctx.db.collection('domains').insertOne(doc)
    await audit(ctx.db, tenant.id, { actor_id: admin.id, actor_role: 'super_admin', action: 'DOMAIN_ADDED', entity: 'domain', entity_id: doc.id, meta: { domain } })
    return { domain: clean(doc) }
  }, meta)
  r.post('/platform/domains/:id/verify', async (ctx) => {
    const admin = await requireSuper(ctx)
    const d = await ctx.db.collection('domains').findOne({ id: ctx.params.id })
    if (!d) throw notFound('Domain not found')
    let verified = false
    let method = 'dns_txt'
    let detail = ''
    if (ctx.body?.force) {
      verified = true
      method = 'manual'
    } else {
      for (const host of [`_saas-verify.${d.domain}`, d.domain]) {
        try {
          const records = await dns.resolveTxt(host)
          const flat = records.map((r) => r.join(''))
          if (flat.some((t) => t.includes(d.verification_token))) { verified = true; break }
          detail = `TXT records found on ${host} but none matched`
        } catch (e) {
          detail = `No TXT record found (${e.code || 'lookup failed'})`
        }
      }
    }
    const set = verified ? { verified: true, status: 'active', ssl_status: 'active', verified_at: new Date(), verification_method: method } : { last_check_at: new Date(), last_check_detail: detail }
    const res = await ctx.db.collection('domains').findOneAndUpdate({ id: d.id }, { $set: set }, { returnDocument: 'after' })
    if (verified) await audit(ctx.db, d.tenant_id, { actor_id: admin.id, actor_role: 'super_admin', action: 'DOMAIN_VERIFIED', entity: 'domain', entity_id: d.id, meta: { method } })
    return { domain: clean(res), verified, detail }
  }, meta)
  r.patch('/platform/domains/:id', async (ctx) => {
    await requireSuper(ctx)
    const d = await ctx.db.collection('domains').findOne({ id: ctx.params.id })
    if (!d) throw notFound('Domain not found')
    const set = {}
    if (ctx.body?.is_primary === true) {
      await ctx.db.collection('domains').updateMany({ tenant_id: d.tenant_id }, { $set: { is_primary: false } })
      set.is_primary = true
    }
    if (ctx.body?.status && ['active', 'pending', 'disabled'].includes(ctx.body.status)) set.status = ctx.body.status
    const res = await ctx.db.collection('domains').findOneAndUpdate({ id: d.id }, { $set: set }, { returnDocument: 'after' })
    return { domain: clean(res) }
  }, meta)
  r.del('/platform/domains/:id', async (ctx) => {
    await requireSuper(ctx)
    const res = await ctx.db.collection('domains').deleteOne({ id: ctx.params.id })
    if (!res.deletedCount) throw notFound('Domain not found')
    return { ok: true }
  }, meta)

  r.get('/platform/audit-logs', async (ctx) => {
    await requireSuper(ctx)
    const list = await ctx.db.collection('audit_logs').find({}).sort({ created_at: -1 }).limit(100).toArray()
    return { logs: cleanAll(list) }
  }, meta)

  // Dev convenience: wipe and reseed demo data (super admin only).
  r.post('/platform/seed/reset', async (ctx) => {
    await requireSuper(ctx)
    const cols = ['tenants', 'domains', 'users', 'customers', 'otp_codes', 'categories', 'products', 'orders', 'payments', 'refunds', 'coupons', 'coupon_usage', 'notifications', 'audit_logs', 'analytics_events', 'counters', 'delivery_assignments']
    await Promise.all(cols.map((c) => ctx.db.collection(c).deleteMany({})))
    const result = await seedAll(ctx.db)
    const res = NextResponse.json({ ok: true, ...result })
    clearSessionCookie(res, 'platform')
    clearSessionCookie(res, 'staff')
    clearSessionCookie(res, 'customer')
    return res
  }, meta)
}
