import { NextResponse } from 'next/server'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import { HttpError, bad, unauthorized, notFound, forbidden } from './http'
import { getSession, setSessionCookie, clearSessionCookie, signToken, hashPassword, comparePassword } from '../auth'
import { publicTenant, isPlatformHost } from '../tenant'
import { clean, cleanAll, normalizePhone } from '../util'
import { buildQuote, nextOrderNumber, notify, audit, track, transitionOrder, ORDER_MODES } from '../orders'

// ---------- helpers ----------
export async function getCustomer(ctx) {
  const s = getSession(ctx.request, 'customer')
  if (!s || s.role !== 'customer' || s.tenant_id !== ctx.tenant.id) return null
  const c = await ctx.db.collection('customers').findOne({ id: s.sub, tenant_id: ctx.tenant.id })
  return c || null
}
export async function requireCustomer(ctx) {
  const c = await getCustomer(ctx)
  if (!c) throw unauthorized('Please sign in to continue')
  return c
}

const cartItemSchema = z.object({
  product_id: z.string().min(1),
  variant_id: z.string().nullable().optional(),
  addon_ids: z.array(z.string()).optional().default([]),
  qty: z.number().int().min(1).max(50),
  notes: z.string().max(200).optional().nullable(),
})
const quoteSchema = z.object({
  items: z.array(cartItemSchema).max(50),
  mode: z.enum(ORDER_MODES).nullable().optional(),
  coupon_code: z.string().max(40).nullable().optional(),
})
const addressSchema = z.object({
  id: z.string().optional(),
  label: z.string().max(40).optional().default('Home'),
  line1: z.string().min(3).max(160),
  line2: z.string().max(160).optional().default(''),
  city: z.string().max(80).optional().default(''),
  pincode: z.string().max(12).optional().default(''),
  landmark: z.string().max(120).optional().default(''),
})
const placeSchema = quoteSchema.extend({
  mode: z.enum(ORDER_MODES),
  idempotency_key: z.string().min(8).max(80),
  payment_method: z.enum(['COD', 'RAZORPAY']).default('COD'),
  contact: z.object({ name: z.string().min(1).max(80), phone: z.string().min(10).max(20), email: z.string().max(120).optional().default('') }),
  address: addressSchema.nullable().optional(),
  save_address: z.boolean().optional(),
  table_number: z.string().max(20).nullable().optional(),
  room_number: z.string().max(20).nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
})

function parse(schema, body) {
  const r = schema.safeParse(body)
  if (!r.success) {
    const issue = r.error.issues[0]
    throw bad(`${issue.path.join('.') || 'input'}: ${issue.message}`, 'VALIDATION')
  }
  return r.data
}

export function registerCustomerRoutes(r) {
  // ----- Tenant config for the current host -----
  r.get('/tenant', async (ctx) => {
    const preview = ctx.tenantVia === 'preview'
    const domains = await ctx.db.collection('domains').find({ tenant_id: ctx.tenant.id }, { projection: { _id: 0, domain: 1, is_primary: 1, verified: 1, status: 1 } }).toArray()
    let tenants = []
    if (preview) {
      tenants = await ctx.db.collection('tenants').find({ status: 'active' }, { projection: { _id: 0, slug: 1, business_name: 1, business_type: 1, primary_color: 1 } }).sort({ created_at: 1 }).toArray()
    }
    return { tenant: publicTenant(ctx.tenant), domains, preview: { enabled: preview, host: ctx.host, tenants } }
  })

  r.post('/preview/switch', async (ctx) => {
    if (!isPlatformHost(ctx.host)) throw forbidden('Tenant switching is only available on the platform preview host')
    const t = await ctx.db.collection('tenants').findOne({ slug: ctx.body?.slug, status: 'active' })
    if (!t) throw notFound('Tenant not found')
    const res = NextResponse.json({ ok: true, tenant: publicTenant(t) })
    res.cookies.set('preview_tenant', t.slug, { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' })
    clearSessionCookie(res, 'customer')
    clearSessionCookie(res, 'staff')
    return res
  })

  // ----- Menu -----
  r.get('/menu', async (ctx) => {
    const [categories, products] = await Promise.all([
      ctx.db.collection('categories').find({ tenant_id: ctx.tenant.id, is_active: true }).sort({ sort_order: 1, name: 1 }).toArray(),
      ctx.db.collection('products').find({ tenant_id: ctx.tenant.id, deleted_at: null }).sort({ sort_order: 1, name: 1 }).toArray(),
    ])
    return { categories: cleanAll(categories), products: cleanAll(products) }
  })

  r.get('/products/:id', async (ctx) => {
    const p = await ctx.db.collection('products').findOne({ tenant_id: ctx.tenant.id, id: ctx.params.id, deleted_at: null })
    if (!p) throw notFound('Product not found')
    return { product: clean(p) }
  })

  // ----- Analytics events from the browser -----
  r.post('/events', async (ctx) => {
    const event = String(ctx.body?.event || '').slice(0, 40)
    if (!event) throw bad('event required')
    await track(ctx.db, ctx.tenant.id, event, { ...(ctx.body?.props || {}), ua: ctx.request.headers.get('user-agent')?.slice(0, 120) })
    return { ok: true }
  })

  // ----- Customer auth (phone + OTP) -----
  r.post('/auth/otp/request', async (ctx) => {
    const phone = normalizePhone(ctx.body?.phone)
    if (!phone) throw bad('Enter a valid phone number')
    const code = String(Math.floor(100000 + Math.random() * 900000))
    await ctx.db.collection('otp_codes').deleteMany({ tenant_id: ctx.tenant.id, phone })
    await ctx.db.collection('otp_codes').insertOne({
      id: uuid(), tenant_id: ctx.tenant.id, phone, code_hash: await hashPassword(code),
      expires_at: new Date(Date.now() + 5 * 60 * 1000), attempts: 0, created_at: new Date(),
    })
    // NOTE: SMS/WhatsApp provider not configured. While OTP_DEV_MODE is on the
    // code is returned so the flow can be exercised end-to-end.
    const dev = process.env.OTP_DEV_MODE !== 'false'
    return { ok: true, expires_in: 300, ...(dev ? { dev_otp: code } : {}) }
  })

  r.post('/auth/otp/verify', async (ctx) => {
    const phone = normalizePhone(ctx.body?.phone)
    const code = String(ctx.body?.code || '').trim()
    if (!phone || code.length !== 6) throw bad('Enter the 6-digit code')
    const rec = await ctx.db.collection('otp_codes').findOne({ tenant_id: ctx.tenant.id, phone })
    if (!rec || rec.expires_at < new Date()) throw bad('Code expired. Please request a new one.', 'OTP_EXPIRED')
    if (rec.attempts >= 5) throw new HttpError(429, 'Too many attempts. Please request a new code.', 'OTP_LOCKED')
    if (!(await comparePassword(code, rec.code_hash))) {
      await ctx.db.collection('otp_codes').updateOne({ id: rec.id }, { $inc: { attempts: 1 } })
      throw bad('Incorrect code', 'OTP_INVALID')
    }
    await ctx.db.collection('otp_codes').deleteOne({ id: rec.id })

    const customers = ctx.db.collection('customers')
    let customer = await customers.findOne({ tenant_id: ctx.tenant.id, phone })
    const name = String(ctx.body?.name || '').trim().slice(0, 80)
    if (!customer) {
      customer = { id: uuid(), tenant_id: ctx.tenant.id, phone, name, email: '', addresses: [], created_at: new Date(), last_login_at: new Date() }
      await customers.insertOne(customer)
      await track(ctx.db, ctx.tenant.id, 'CUSTOMER_SIGNUP', { customer_id: customer.id })
    } else {
      const set = { last_login_at: new Date() }
      if (name && !customer.name) set.name = name
      await customers.updateOne({ id: customer.id }, { $set: set })
      customer = { ...customer, ...set }
    }
    await track(ctx.db, ctx.tenant.id, 'LOGIN_COMPLETED', { customer_id: customer.id })
    const token = signToken({ sub: customer.id, tenant_id: ctx.tenant.id, role: 'customer' })
    const res = NextResponse.json({ customer: clean(customer) })
    setSessionCookie(res, 'customer', token)
    return res
  })

  r.get('/auth/me', async (ctx) => {
    const c = await getCustomer(ctx)
    return { customer: c ? clean(c) : null }
  })
  r.post('/auth/logout', async () => {
    const res = NextResponse.json({ ok: true })
    clearSessionCookie(res, 'customer')
    return res
  })
  r.patch('/auth/me', async (ctx) => {
    const c = await requireCustomer(ctx)
    const set = {}
    if (typeof ctx.body?.name === 'string') set.name = ctx.body.name.trim().slice(0, 80)
    if (typeof ctx.body?.email === 'string') set.email = ctx.body.email.trim().slice(0, 120)
    await ctx.db.collection('customers').updateOne({ id: c.id, tenant_id: ctx.tenant.id }, { $set: set })
    return { customer: clean({ ...c, ...set }) }
  })
  r.post('/auth/addresses', async (ctx) => {
    const c = await requireCustomer(ctx)
    const a = parse(addressSchema, ctx.body)
    const address = { ...a, id: uuid() }
    await ctx.db.collection('customers').updateOne({ id: c.id, tenant_id: ctx.tenant.id }, { $push: { addresses: address } })
    return { address, addresses: [...(c.addresses || []), address] }
  })
  r.del('/auth/addresses/:id', async (ctx) => {
    const c = await requireCustomer(ctx)
    await ctx.db.collection('customers').updateOne({ id: c.id, tenant_id: ctx.tenant.id }, { $pull: { addresses: { id: ctx.params.id } } })
    return { addresses: (c.addresses || []).filter((x) => x.id !== ctx.params.id) }
  })

  // ----- Checkout -----
  r.post('/checkout/quote', async (ctx) => {
    const data = parse(quoteSchema, ctx.body || {})
    const customer = await getCustomer(ctx)
    const q = await buildQuote(ctx.db, ctx.tenant, data, customer)
    const { coupon_doc, ...rest } = q
    return rest
  })

  r.post('/checkout/place', async (ctx) => {
    const customer = await requireCustomer(ctx)
    const data = parse(placeSchema, ctx.body || {})
    const orders = ctx.db.collection('orders')

    // Idempotency: same key -> same order, never a duplicate.
    const existing = await orders.findOne({ tenant_id: ctx.tenant.id, idempotency_key: data.idempotency_key })
    if (existing) return { order: clean(existing), duplicate: true }

    if (!data.items.length) throw bad('Your cart is empty')
    if (ctx.tenant.is_open === false) throw bad(`${ctx.tenant.business_name} is not accepting orders right now`, 'CLOSED')

    const q = await buildQuote(ctx.db, ctx.tenant, data, customer)
    if (q.errors.length) throw bad(q.errors[0].message, 'QUOTE_ERROR')
    if (data.coupon_code && q.coupon && !q.coupon.ok) throw bad(q.coupon.error, 'COUPON_INVALID')

    // Payment method validation (tenant-aware)
    const ps = ctx.tenant.payment_settings || {}
    if (data.payment_method === 'RAZORPAY') {
      if (!ps.razorpay?.enabled) throw bad('Online payment is not enabled for this business yet', 'PAYMENT_UNAVAILABLE')
      throw new HttpError(501, 'Online payment is being set up. Please choose another payment method.', 'PAYMENT_NOT_READY')
    }
    if (ps.cod_enabled === false) throw bad('Pay-later is not available for this business', 'PAYMENT_UNAVAILABLE')

    // Mode-specific fields
    let address = null
    if (data.mode === 'DELIVERY') {
      if (!data.address?.line1) throw bad('Please add a delivery address')
      address = { ...data.address, id: data.address.id || uuid() }
    }
    if (data.mode === 'DINE_IN' && !data.table_number) throw bad('Please enter your table number')
    if (data.mode === 'ROOM_SERVICE' && !data.room_number) throw bad('Please enter your room number')

    const phone = normalizePhone(data.contact.phone) || customer.phone
    const now = new Date()
    const order_number = await nextOrderNumber(ctx.db, ctx.tenant.id)
    const order = {
      id: uuid(),
      tenant_id: ctx.tenant.id,
      order_number,
      customer_id: customer.id,
      customer: { name: data.contact.name.trim(), phone, email: data.contact.email || customer.email || '' },
      mode: data.mode,
      address,
      table_number: data.mode === 'DINE_IN' ? data.table_number : null,
      room_number: data.mode === 'ROOM_SERVICE' ? data.room_number : null,
      notes: data.notes || null,
      items: q.lines,
      subtotal: q.subtotal,
      discount: q.discount,
      coupon_code: q.coupon?.ok ? q.coupon.code : null,
      tax: q.tax,
      tax_label: q.tax_label,
      delivery_fee: q.delivery_fee,
      packaging_fee: q.packaging_fee,
      total: q.total,
      currency: q.currency,
      payment_method: 'COD',
      payment_status: 'PENDING',
      status: 'ORDER_PLACED',
      status_history: [{ status: 'ORDER_PLACED', at: now, by: customer.id, role: 'customer', note: null }],
      rejection_reason: null,
      delivery_assignee_id: null,
      internal_notes: [],
      source: data.table_number || data.room_number ? 'QR' : 'WEB',
      idempotency_key: data.idempotency_key,
      created_at: now,
      updated_at: now,
    }
    try {
      await orders.insertOne(order)
    } catch (e) {
      if (e?.code === 11000) {
        const dup = await orders.findOne({ tenant_id: ctx.tenant.id, idempotency_key: data.idempotency_key })
        if (dup) return { order: clean(dup), duplicate: true }
      }
      throw e
    }

    // Side effects (best-effort, never block the order)
    const side = []
    if (q.coupon_doc) {
      side.push(ctx.db.collection('coupon_usage').insertOne({ id: uuid(), tenant_id: ctx.tenant.id, coupon_id: q.coupon_doc.id, customer_id: customer.id, order_id: order.id, discount: q.discount, created_at: now }))
      side.push(ctx.db.collection('coupons').updateOne({ id: q.coupon_doc.id }, { $inc: { used_count: 1 } }))
      side.push(track(ctx.db, ctx.tenant.id, 'COUPON_USED', { code: q.coupon_doc.code, order_id: order.id }))
    }
    const custSet = {}
    if (!customer.name && data.contact.name) custSet.name = data.contact.name.trim()
    if (!customer.email && data.contact.email) custSet.email = data.contact.email
    const custUpdate = { $set: { ...custSet, last_order_at: now } }
    if (address && data.save_address !== false && !(customer.addresses || []).some((x) => x.id === address.id)) custUpdate.$push = { addresses: address }
    side.push(ctx.db.collection('customers').updateOne({ id: customer.id, tenant_id: ctx.tenant.id }, custUpdate))
    side.push(notify(ctx.db, ctx.tenant.id, { audience: 'admin', type: 'NEW_ORDER', title: `New order #${order_number}`, body: `${order.items.map((i) => `${i.qty}x ${i.name}`).join(', ')} · ₹${order.total}`, order_id: order.id }))
    side.push(notify(ctx.db, ctx.tenant.id, { audience: 'customer', customer_id: customer.id, type: 'ORDER_PLACED', title: 'Order placed', body: `We have received your order #${order_number}.`, order_id: order.id }))
    side.push(audit(ctx.db, ctx.tenant.id, { actor_id: customer.id, actor_role: 'customer', action: 'ORDER_CREATED', entity: 'order', entity_id: order.id, meta: { total: order.total, mode: order.mode } }))
    side.push(track(ctx.db, ctx.tenant.id, 'ORDER_CREATED', { order_id: order.id, total: order.total, mode: order.mode, source: order.source }))
    await Promise.allSettled(side)

    return { order: clean(order) }
  })

  // ----- Customer orders -----
  r.get('/orders', async (ctx) => {
    const c = await requireCustomer(ctx)
    const list = await ctx.db.collection('orders').find({ tenant_id: ctx.tenant.id, customer_id: c.id }).sort({ created_at: -1 }).limit(50).toArray()
    return { orders: cleanAll(list) }
  })
  r.get('/orders/:id', async (ctx) => {
    const c = await requireCustomer(ctx)
    const o = await ctx.db.collection('orders').findOne({ tenant_id: ctx.tenant.id, id: ctx.params.id, customer_id: c.id })
    if (!o) throw notFound('Order not found')
    return { order: clean(o) }
  })
  r.post('/orders/:id/cancel', async (ctx) => {
    const c = await requireCustomer(ctx)
    const o = await ctx.db.collection('orders').findOne({ tenant_id: ctx.tenant.id, id: ctx.params.id, customer_id: c.id })
    if (!o) throw notFound('Order not found')
    if (o.status !== 'ORDER_PLACED') throw bad('This order can no longer be cancelled. Please contact the restaurant.', 'CANNOT_CANCEL')
    const updated = await transitionOrder(ctx.db, ctx.tenant, o, 'CANCELLED', { actor_id: c.id, role: 'customer', reason: ctx.body?.reason || 'Cancelled by customer' })
    return { order: clean(updated) }
  })
  r.get('/notifications', async (ctx) => {
    const c = await requireCustomer(ctx)
    const list = await ctx.db.collection('notifications').find({ tenant_id: ctx.tenant.id, audience: 'customer', customer_id: c.id }).sort({ created_at: -1 }).limit(30).toArray()
    return { notifications: cleanAll(list) }
  })
}
