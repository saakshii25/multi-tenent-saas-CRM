import { NextResponse } from 'next/server'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import { HttpError, bad, unauthorized, forbidden, notFound } from './http'
import { getSession, setSessionCookie, clearSessionCookie, signToken, comparePassword, hashPassword, STAFF_ROLES, MANAGEMENT_ROLES } from '../auth'
import { clean, cleanAll, round2, isHexColor, startOfDayTz, dayKeyTz, daysAgo } from '../util'
import { ACTIVE_STATUSES, REVENUE_STATUSES, TRANSITIONS, REJECTION_REASONS, ORDER_MODES, transitionOrder, audit, notify } from '../orders'

// ---------- auth helpers ----------
export async function requireStaff(ctx, roles = STAFF_ROLES) {
  const s = getSession(ctx.request, 'staff')
  if (!s || s.tenant_id !== ctx.tenant.id || !STAFF_ROLES.includes(s.role)) throw unauthorized('Please sign in to the admin console')
  const user = await ctx.db.collection('users').findOne({ id: s.sub, tenant_id: ctx.tenant.id, status: 'active' })
  if (!user || !STAFF_ROLES.includes(user.role)) throw unauthorized('Session is no longer valid')
  if (!roles.includes(user.role)) throw forbidden()
  return user
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, tenant_id: u.tenant_id })

function parse(schema, body) {
  const r = schema.safeParse(body)
  if (!r.success) {
    const issue = r.error.issues[0]
    throw bad(`${issue.path.join('.') || 'input'}: ${issue.message}`, 'VALIDATION')
  }
  return r.data
}

const num = z.coerce.number().min(0)
const optionSchema = z.object({ id: z.string().optional(), name: z.string().min(1).max(60), price: num.max(100000) })
const productSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  category_id: z.string().min(1),
  base_price: num.max(100000),
  is_veg: z.boolean().optional().default(true),
  prep_time_min: z.coerce.number().int().min(0).max(240).optional().default(15),
  is_available: z.boolean().optional().default(true),
  is_featured: z.boolean().optional().default(false),
  image: z.string().max(600).nullable().optional(),
  sort_order: z.coerce.number().int().optional().default(0),
  tax_rate: z.coerce.number().min(0).max(100).nullable().optional(),
  variants: z.array(optionSchema).max(20).optional().default([]),
  addons: z.array(optionSchema).max(30).optional().default([]),
})
const categorySchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional().default(''),
  image: z.string().max(600).nullable().optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.coerce.number().int().optional(),
})
const couponSchema = z.object({
  code: z.string().min(2).max(30).transform((s) => s.trim().toUpperCase()),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.coerce.number().positive(),
  min_order: num.optional().default(0),
  max_discount: z.coerce.number().min(0).nullable().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  usage_limit: z.coerce.number().int().min(0).nullable().optional(),
  per_user_limit: z.coerce.number().int().min(0).nullable().optional(),
  is_active: z.boolean().optional().default(true),
  description: z.string().max(200).optional().default(''),
})

function segmentFor(stats) {
  if (!stats || !stats.total_orders) return 'NEW'
  const days = (Date.now() - new Date(stats.last_order_at).getTime()) / 86400000
  if (days > 30) return 'INACTIVE'
  if (stats.total_orders === 1) return 'NEW'
  if (stats.total_spent >= 5000 || stats.total_orders >= 10) return 'VIP'
  if (stats.total_spent / stats.total_orders >= 800) return 'HIGH_VALUE'
  return 'RETURNING'
}

async function customerStats(db, tenantId, customerId = null) {
  const match = { tenant_id: tenantId, status: { $in: REVENUE_STATUSES }, customer_id: { $ne: null } }
  if (customerId) match.customer_id = customerId
  const rows = await db.collection('orders').aggregate([
    { $match: match },
    { $group: { _id: '$customer_id', total_orders: { $sum: 1 }, total_spent: { $sum: '$total' }, last_order_at: { $max: '$created_at' }, first_order_at: { $min: '$created_at' } } },
  ]).toArray()
  const map = new Map()
  for (const r of rows) map.set(r._id, { total_orders: r.total_orders, total_spent: round2(r.total_spent), last_order_at: r.last_order_at, first_order_at: r.first_order_at, avg_order_value: round2(r.total_spent / r.total_orders) })
  return map
}

function maskSettings(t) {
  const { _id, payment_settings, ...rest } = t
  const rz = payment_settings?.razorpay || {}
  return {
    ...rest,
    payment_settings: {
      cod_enabled: payment_settings?.cod_enabled !== false,
      cod_label: payment_settings?.cod_label || '',
      razorpay: { enabled: !!rz.enabled, key_id: rz.key_id || '', key_secret_set: !!rz.key_secret, webhook_secret_set: !!rz.webhook_secret },
    },
  }
}

export function registerAdminRoutes(r) {
  // ---------- Auth ----------
  r.post('/admin/auth/login', async (ctx) => {
    const email = String(ctx.body?.email || '').trim().toLowerCase()
    const password = String(ctx.body?.password || '')
    if (!email || !password) throw bad('Email and password are required')
    const user = await ctx.db.collection('users').findOne({ tenant_id: ctx.tenant.id, email, status: 'active' })
    if (!user || !STAFF_ROLES.includes(user.role) || !(await comparePassword(password, user.password_hash))) {
      throw unauthorized('Incorrect email or password')
    }
    await ctx.db.collection('users').updateOne({ id: user.id }, { $set: { last_login_at: new Date() } })
    await audit(ctx.db, ctx.tenant.id, { actor_id: user.id, actor_role: user.role, action: 'STAFF_LOGIN', entity: 'user', entity_id: user.id })
    const token = signToken({ sub: user.id, tenant_id: ctx.tenant.id, role: user.role }, '12h')
    const res = NextResponse.json({ user: publicUser(user) })
    setSessionCookie(res, 'staff', token)
    return res
  })
  r.get('/admin/auth/me', async (ctx) => {
    try {
      const u = await requireStaff(ctx)
      return { user: publicUser(u) }
    } catch {
      return { user: null }
    }
  })
  r.post('/admin/auth/logout', async () => {
    const res = NextResponse.json({ ok: true })
    clearSessionCookie(res, 'staff')
    return res
  })

  // ---------- Dashboard ----------
  r.get('/admin/dashboard', async (ctx) => {
    await requireStaff(ctx)
    const db = ctx.db
    const tid = ctx.tenant.id
    const tz = ctx.tenant.timezone || 'UTC'
    const start = startOfDayTz(tz)
    const [today, active, top, weekOrders, customersTotal, customersNew, returningRows, recent] = await Promise.all([
      db.collection('orders').find({ tenant_id: tid, created_at: { $gte: start } }).toArray(),
      db.collection('orders').find({ tenant_id: tid, status: { $in: ACTIVE_STATUSES } }, { projection: { status: 1 } }).toArray(),
      db.collection('orders').aggregate([
        { $match: { tenant_id: tid, status: { $in: REVENUE_STATUSES }, created_at: { $gte: daysAgo(30) } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.product_id', name: { $first: '$items.name' }, image: { $first: '$items.image' }, qty: { $sum: '$items.qty' }, revenue: { $sum: '$items.line_total' } } },
        { $sort: { qty: -1 } }, { $limit: 5 },
      ]).toArray(),
      db.collection('orders').find({ tenant_id: tid, status: { $in: REVENUE_STATUSES }, created_at: { $gte: startOfDayTz(tz, daysAgo(6)) } }, { projection: { total: 1, created_at: 1 } }).toArray(),
      db.collection('customers').countDocuments({ tenant_id: tid }),
      db.collection('customers').countDocuments({ tenant_id: tid, created_at: { $gte: daysAgo(30) } }),
      db.collection('orders').aggregate([{ $match: { tenant_id: tid, status: { $in: REVENUE_STATUSES }, customer_id: { $ne: null } } }, { $group: { _id: '$customer_id', n: { $sum: 1 } } }, { $match: { n: { $gte: 2 } } }, { $count: 'c' }]).toArray(),
      db.collection('orders').find({ tenant_id: tid }).sort({ created_at: -1 }).limit(8).toArray(),
    ])
    const revenueOrders = today.filter((o) => REVENUE_STATUSES.includes(o.status))
    const series = []
    for (let i = 6; i >= 0; i--) {
      const key = dayKeyTz(tz, daysAgo(i))
      series.push({ date: key, orders: 0, revenue: 0 })
    }
    for (const o of weekOrders) {
      const k = dayKeyTz(tz, new Date(o.created_at))
      const s = series.find((x) => x.date === k)
      if (s) { s.orders += 1; s.revenue = round2(s.revenue + o.total) }
    }
    return {
      today: {
        orders: today.length,
        revenue: round2(revenueOrders.reduce((s, o) => s + o.total, 0)),
        delivered: today.filter((o) => o.status === 'DELIVERED').length,
        cancelled: today.filter((o) => ['CANCELLED', 'REJECTED'].includes(o.status)).length,
        aov: revenueOrders.length ? round2(revenueOrders.reduce((s, o) => s + o.total, 0) / revenueOrders.length) : 0,
      },
      live: {
        new: active.filter((o) => o.status === 'ORDER_PLACED').length,
        preparing: active.filter((o) => ['ACCEPTED', 'PREPARING'].includes(o.status)).length,
        ready: active.filter((o) => ['READY', 'OUT_FOR_DELIVERY'].includes(o.status)).length,
      },
      top_products: top.map((t) => ({ product_id: t._id, name: t.name, image: t.image, qty: t.qty, revenue: round2(t.revenue) })),
      series,
      customers: { total: customersTotal, new_30d: customersNew, returning: returningRows[0]?.c || 0 },
      recent_orders: cleanAll(recent),
      server_time: new Date(),
    }
  })

  // ---------- Orders ----------
  r.get('/admin/orders', async (ctx) => {
    const user = await requireStaff(ctx)
    const tid = ctx.tenant.id
    const { scope = 'board', status, q, page = '1', limit = '50', since } = ctx.query
    const filter = { tenant_id: tid }
    if (user.role === 'delivery') {
      filter.$or = [{ delivery_assignee_id: user.id }, { mode: 'DELIVERY', status: { $in: ['READY', 'OUT_FOR_DELIVERY'] } }]
    }
    if (status) filter.status = { $in: status.split(',') }
    else if (scope === 'board') filter.$and = [{ $or: [{ status: { $in: ACTIVE_STATUSES } }, { updated_at: { $gte: daysAgo(1) } }] }]
    if (since) filter.updated_at = { $gt: new Date(since) }
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      const n = parseInt(q, 10)
      filter.$and = [...(filter.$and || []), { $or: [{ 'customer.name': rx }, { 'customer.phone': rx }, ...(Number.isFinite(n) ? [{ order_number: n }] : [])] }]
    }
    const lim = Math.min(200, parseInt(limit, 10) || 50)
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * lim
    const [orders, total, counts] = await Promise.all([
      ctx.db.collection('orders').find(filter).sort({ created_at: -1 }).skip(skip).limit(lim).toArray(),
      ctx.db.collection('orders').countDocuments(filter),
      ctx.db.collection('orders').aggregate([{ $match: { tenant_id: tid, status: { $in: ACTIVE_STATUSES } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
    ])
    const countMap = Object.fromEntries(counts.map((c) => [c._id, c.n]))
    return { orders: cleanAll(orders), total, page: Number(page), counts: countMap, server_time: new Date(), rejection_reasons: REJECTION_REASONS }
  })

  r.get('/admin/orders/:id', async (ctx) => {
    await requireStaff(ctx)
    const o = await ctx.db.collection('orders').findOne({ tenant_id: ctx.tenant.id, id: ctx.params.id })
    if (!o) throw notFound('Order not found')
    const [customer, payments, refunds] = await Promise.all([
      o.customer_id ? ctx.db.collection('customers').findOne({ tenant_id: ctx.tenant.id, id: o.customer_id }) : null,
      ctx.db.collection('payments').find({ tenant_id: ctx.tenant.id, order_id: o.id }).toArray(),
      ctx.db.collection('refunds').find({ tenant_id: ctx.tenant.id, order_id: o.id }).toArray(),
    ])
    const stats = o.customer_id ? (await customerStats(ctx.db, ctx.tenant.id, o.customer_id)).get(o.customer_id) : null
    return { order: clean(o), customer: customer ? { ...clean(customer), stats, segment: segmentFor(stats) } : null, payments: cleanAll(payments), refunds: cleanAll(refunds), allowed_transitions: TRANSITIONS[o.status] || [] }
  })

  r.patch('/admin/orders/:id/status', async (ctx) => {
    const user = await requireStaff(ctx)
    const to = String(ctx.body?.status || '')
    if (!TRANSITIONS[to] && to !== 'DELIVERED') throw bad('Unknown status')
    const o = await ctx.db.collection('orders').findOne({ tenant_id: ctx.tenant.id, id: ctx.params.id })
    if (!o) throw notFound('Order not found')
    if (to === 'REJECTED' && !ctx.body?.reason) throw bad('Please choose a rejection reason')
    const updated = await transitionOrder(ctx.db, ctx.tenant, o, to, { actor_id: user.id, role: user.role, reason: ctx.body?.reason || null, note: ctx.body?.note || null })
    return { order: clean(updated) }
  })

  r.patch('/admin/orders/:id/assign', async (ctx) => {
    const user = await requireStaff(ctx, MANAGEMENT_ROLES)
    const staff = await ctx.db.collection('users').findOne({ tenant_id: ctx.tenant.id, id: ctx.body?.staff_user_id, status: 'active' })
    if (!staff) throw bad('Delivery staff not found')
    const res = await ctx.db.collection('orders').findOneAndUpdate(
      { tenant_id: ctx.tenant.id, id: ctx.params.id },
      { $set: { delivery_assignee_id: staff.id, delivery_assignee_name: staff.name, updated_at: new Date() } },
      { returnDocument: 'after' }
    )
    if (!res) throw notFound('Order not found')
    await ctx.db.collection('delivery_assignments').insertOne({ id: uuid(), tenant_id: ctx.tenant.id, order_id: res.id, staff_user_id: staff.id, assigned_by: user.id, created_at: new Date() })
    await audit(ctx.db, ctx.tenant.id, { actor_id: user.id, actor_role: user.role, action: 'ORDER_ASSIGNED', entity: 'order', entity_id: res.id, meta: { staff_user_id: staff.id } })
    return { order: clean(res) }
  })

  r.post('/admin/orders/:id/notes', async (ctx) => {
    const user = await requireStaff(ctx)
    const note = String(ctx.body?.note || '').trim().slice(0, 500)
    if (!note) throw bad('Note cannot be empty')
    const res = await ctx.db.collection('orders').findOneAndUpdate(
      { tenant_id: ctx.tenant.id, id: ctx.params.id },
      { $push: { internal_notes: { id: uuid(), note, by: user.name, by_id: user.id, at: new Date() } }, $set: { updated_at: new Date() } },
      { returnDocument: 'after' }
    )
    if (!res) throw notFound('Order not found')
    return { order: clean(res) }
  })

  // ---------- Staff ----------
  r.get('/admin/staff', async (ctx) => {
    await requireStaff(ctx)
    const list = await ctx.db.collection('users').find({ tenant_id: ctx.tenant.id, role: { $in: STAFF_ROLES } }).sort({ created_at: 1 }).toArray()
    return { staff: list.map(publicUser) }
  })
  r.post('/admin/staff', async (ctx) => {
    const user = await requireStaff(ctx, ['owner'])
    const data = parse(z.object({ name: z.string().min(1).max(80), email: z.string().email(), password: z.string().min(6).max(100), role: z.enum(STAFF_ROLES) }), ctx.body)
    const email = data.email.toLowerCase()
    if (await ctx.db.collection('users').findOne({ tenant_id: ctx.tenant.id, email })) throw bad('A user with this email already exists')
    const u = { id: uuid(), tenant_id: ctx.tenant.id, email, name: data.name, role: data.role, password_hash: await hashPassword(data.password), status: 'active', created_at: new Date() }
    await ctx.db.collection('users').insertOne(u)
    await audit(ctx.db, ctx.tenant.id, { actor_id: user.id, actor_role: user.role, action: 'STAFF_CREATED', entity: 'user', entity_id: u.id, meta: { role: u.role } })
    return { user: publicUser(u) }
  })
  r.patch('/admin/staff/:id', async (ctx) => {
    const user = await requireStaff(ctx, ['owner'])
    const set = {}
    if (ctx.body?.status && ['active', 'disabled'].includes(ctx.body.status)) set.status = ctx.body.status
    if (ctx.body?.role && STAFF_ROLES.includes(ctx.body.role)) set.role = ctx.body.role
    if (ctx.body?.name) set.name = String(ctx.body.name).slice(0, 80)
    if (ctx.params.id === user.id && set.status === 'disabled') throw bad('You cannot disable your own account')
    const res = await ctx.db.collection('users').findOneAndUpdate({ tenant_id: ctx.tenant.id, id: ctx.params.id }, { $set: set }, { returnDocument: 'after' })
    if (!res) throw notFound('Staff member not found')
    return { user: publicUser(res) }
  })

  // ---------- Categories ----------
  r.get('/admin/categories', async (ctx) => {
    await requireStaff(ctx)
    const list = await ctx.db.collection('categories').find({ tenant_id: ctx.tenant.id }).sort({ sort_order: 1, name: 1 }).toArray()
    return { categories: cleanAll(list) }
  })
  r.post('/admin/categories', async (ctx) => {
    const user = await requireStaff(ctx, MANAGEMENT_ROLES)
    const data = parse(categorySchema, ctx.body)
    const last = await ctx.db.collection('categories').find({ tenant_id: ctx.tenant.id }).sort({ sort_order: -1 }).limit(1).toArray()
    const cat = { id: uuid(), tenant_id: ctx.tenant.id, ...data, sort_order: data.sort_order ?? ((last[0]?.sort_order || 0) + 1), created_at: new Date() }
    await ctx.db.collection('categories').insertOne(cat)
    await audit(ctx.db, ctx.tenant.id, { actor_id: user.id, actor_role: user.role, action: 'CATEGORY_CREATED', entity: 'category', entity_id: cat.id })
    return { category: clean(cat) }
  })
  r.patch('/admin/categories/:id', async (ctx) => {
    await requireStaff(ctx, MANAGEMENT_ROLES)
    const data = parse(categorySchema.partial(), ctx.body)
    const res = await ctx.db.collection('categories').findOneAndUpdate({ tenant_id: ctx.tenant.id, id: ctx.params.id }, { $set: { ...data, updated_at: new Date() } }, { returnDocument: 'after' })
    if (!res) throw notFound('Category not found')
    return { category: clean(res) }
  })
  r.post('/admin/categories/reorder', async (ctx) => {
    await requireStaff(ctx, MANAGEMENT_ROLES)
    const ids = Array.isArray(ctx.body?.ids) ? ctx.body.ids : []
    await Promise.all(ids.map((id, i) => ctx.db.collection('categories').updateOne({ tenant_id: ctx.tenant.id, id }, { $set: { sort_order: i + 1 } })))
    return { ok: true }
  })
  r.del('/admin/categories/:id', async (ctx) => {
    const user = await requireStaff(ctx, MANAGEMENT_ROLES)
    const inUse = await ctx.db.collection('products').countDocuments({ tenant_id: ctx.tenant.id, category_id: ctx.params.id, deleted_at: null })
    if (inUse) throw bad(`Move or delete the ${inUse} product(s) in this category first`)
    const res = await ctx.db.collection('categories').deleteOne({ tenant_id: ctx.tenant.id, id: ctx.params.id })
    if (!res.deletedCount) throw notFound('Category not found')
    await audit(ctx.db, ctx.tenant.id, { actor_id: user.id, actor_role: user.role, action: 'CATEGORY_DELETED', entity: 'category', entity_id: ctx.params.id })
    return { ok: true }
  })

  // ---------- Products ----------
  r.get('/admin/products', async (ctx) => {
    await requireStaff(ctx)
    const list = await ctx.db.collection('products').find({ tenant_id: ctx.tenant.id, deleted_at: null }).sort({ sort_order: 1, name: 1 }).toArray()
    return { products: cleanAll(list) }
  })
  r.post('/admin/products', async (ctx) => {
    const user = await requireStaff(ctx, MANAGEMENT_ROLES)
    const data = parse(productSchema, ctx.body)
    const cat = await ctx.db.collection('categories').findOne({ tenant_id: ctx.tenant.id, id: data.category_id })
    if (!cat) throw bad('Category not found')
    const p = { id: uuid(), tenant_id: ctx.tenant.id, ...data, variants: data.variants.map((v) => ({ ...v, id: v.id || uuid() })), addons: data.addons.map((a) => ({ ...a, id: a.id || uuid() })), deleted_at: null, created_at: new Date(), updated_at: new Date() }
    await ctx.db.collection('products').insertOne(p)
    await audit(ctx.db, ctx.tenant.id, { actor_id: user.id, actor_role: user.role, action: 'PRODUCT_CREATED', entity: 'product', entity_id: p.id })
    return { product: clean(p) }
  })
  r.patch('/admin/products/:id', async (ctx) => {
    const user = await requireStaff(ctx, MANAGEMENT_ROLES)
    const data = parse(productSchema.partial(), ctx.body)
    if (data.category_id) {
      const cat = await ctx.db.collection('categories').findOne({ tenant_id: ctx.tenant.id, id: data.category_id })
      if (!cat) throw bad('Category not found')
    }
    if (data.variants) data.variants = data.variants.map((v) => ({ ...v, id: v.id || uuid() }))
    if (data.addons) data.addons = data.addons.map((a) => ({ ...a, id: a.id || uuid() }))
    const res = await ctx.db.collection('products').findOneAndUpdate({ tenant_id: ctx.tenant.id, id: ctx.params.id, deleted_at: null }, { $set: { ...data, updated_at: new Date() } }, { returnDocument: 'after' })
    if (!res) throw notFound('Product not found')
    await audit(ctx.db, ctx.tenant.id, { actor_id: user.id, actor_role: user.role, action: 'PRODUCT_UPDATED', entity: 'product', entity_id: res.id, meta: { fields: Object.keys(data) } })
    return { product: clean(res) }
  })
  r.patch('/admin/products/:id/availability', async (ctx) => {
    const user = await requireStaff(ctx)
    const is_available = !!ctx.body?.is_available
    const res = await ctx.db.collection('products').findOneAndUpdate({ tenant_id: ctx.tenant.id, id: ctx.params.id, deleted_at: null }, { $set: { is_available, updated_at: new Date() } }, { returnDocument: 'after' })
    if (!res) throw notFound('Product not found')
    await audit(ctx.db, ctx.tenant.id, { actor_id: user.id, actor_role: user.role, action: is_available ? 'PRODUCT_AVAILABLE' : 'PRODUCT_UNAVAILABLE', entity: 'product', entity_id: res.id })
    return { product: clean(res) }
  })
  r.del('/admin/products/:id', async (ctx) => {
    const user = await requireStaff(ctx, MANAGEMENT_ROLES)
    const res = await ctx.db.collection('products').updateOne({ tenant_id: ctx.tenant.id, id: ctx.params.id, deleted_at: null }, { $set: { deleted_at: new Date(), is_available: false } })
    if (!res.matchedCount) throw notFound('Product not found')
    await audit(ctx.db, ctx.tenant.id, { actor_id: user.id, actor_role: user.role, action: 'PRODUCT_DELETED', entity: 'product', entity_id: ctx.params.id })
    return { ok: true }
  })

  // ---------- Customers / CRM ----------
  r.get('/admin/customers', async (ctx) => {
    await requireStaff(ctx, [...MANAGEMENT_ROLES, 'kitchen'])
    const { segment, q, page = '1', limit = '50' } = ctx.query
    const filter = { tenant_id: ctx.tenant.id }
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ name: rx }, { phone: rx }, { email: rx }]
    }
    const [customers, stats] = await Promise.all([
      ctx.db.collection('customers').find(filter).sort({ created_at: -1 }).limit(1000).toArray(),
      customerStats(ctx.db, ctx.tenant.id),
    ])
    let rows = customers.map((c) => {
      const s = stats.get(c.id) || { total_orders: 0, total_spent: 0, avg_order_value: 0, last_order_at: null, first_order_at: null }
      return { ...clean(c), stats: s, segment: segmentFor(s) }
    })
    if (segment) rows = rows.filter((r) => r.segment === segment)
    rows.sort((a, b) => b.stats.total_spent - a.stats.total_spent || new Date(b.created_at) - new Date(a.created_at))
    const segCounts = {}
    for (const c of customers) {
      const seg = segmentFor(stats.get(c.id))
      segCounts[seg] = (segCounts[seg] || 0) + 1
    }
    const all = [...stats.values()]
    const totalRevenue = all.reduce((s, x) => s + x.total_spent, 0)
    const totalOrders = all.reduce((s, x) => s + x.total_orders, 0)
    const metrics = {
      total_customers: customers.length,
      new_30d: customers.filter((c) => new Date(c.created_at) >= daysAgo(30)).length,
      returning: all.filter((x) => x.total_orders >= 2).length,
      repeat_rate: all.length ? Math.round((all.filter((x) => x.total_orders >= 2).length / all.length) * 100) : 0,
      avg_order_value: totalOrders ? round2(totalRevenue / totalOrders) : 0,
      avg_ltv: all.length ? round2(totalRevenue / all.length) : 0,
      segments: segCounts,
    }
    const lim = Math.min(200, parseInt(limit, 10) || 50)
    const p = Math.max(1, parseInt(page, 10) || 1)
    return { customers: rows.slice((p - 1) * lim, p * lim), total: rows.length, page: p, metrics }
  })
  r.get('/admin/customers/:id', async (ctx) => {
    await requireStaff(ctx, [...MANAGEMENT_ROLES, 'kitchen'])
    const c = await ctx.db.collection('customers').findOne({ tenant_id: ctx.tenant.id, id: ctx.params.id })
    if (!c) throw notFound('Customer not found')
    const [orders, statsMap] = await Promise.all([
      ctx.db.collection('orders').find({ tenant_id: ctx.tenant.id, customer_id: c.id }).sort({ created_at: -1 }).limit(50).toArray(),
      customerStats(ctx.db, ctx.tenant.id, c.id),
    ])
    const fav = {}
    for (const o of orders) if (REVENUE_STATUSES.includes(o.status)) for (const it of o.items) fav[it.name] = (fav[it.name] || 0) + it.qty
    const favorites = Object.entries(fav).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }))
    const stats = statsMap.get(c.id) || { total_orders: 0, total_spent: 0, avg_order_value: 0, last_order_at: null, first_order_at: null }
    return { customer: { ...clean(c), stats, segment: segmentFor(stats), favorites }, orders: cleanAll(orders) }
  })

  // ---------- Coupons ----------
  r.get('/admin/coupons', async (ctx) => {
    await requireStaff(ctx, MANAGEMENT_ROLES)
    const list = await ctx.db.collection('coupons').find({ tenant_id: ctx.tenant.id }).sort({ created_at: -1 }).toArray()
    return { coupons: cleanAll(list) }
  })
  r.post('/admin/coupons', async (ctx) => {
    const user = await requireStaff(ctx, MANAGEMENT_ROLES)
    const data = parse(couponSchema, ctx.body)
    if (data.type === 'PERCENT' && data.value > 100) throw bad('Percentage cannot exceed 100')
    if (await ctx.db.collection('coupons').findOne({ tenant_id: ctx.tenant.id, code: data.code })) throw bad('A coupon with this code already exists')
    const c = { id: uuid(), tenant_id: ctx.tenant.id, ...data, used_count: 0, created_at: new Date() }
    await ctx.db.collection('coupons').insertOne(c)
    await audit(ctx.db, ctx.tenant.id, { actor_id: user.id, actor_role: user.role, action: 'COUPON_CREATED', entity: 'coupon', entity_id: c.id })
    return { coupon: clean(c) }
  })
  r.patch('/admin/coupons/:id', async (ctx) => {
    await requireStaff(ctx, MANAGEMENT_ROLES)
    const data = parse(couponSchema.partial(), ctx.body)
    if (data.code) {
      const dup = await ctx.db.collection('coupons').findOne({ tenant_id: ctx.tenant.id, code: data.code, id: { $ne: ctx.params.id } })
      if (dup) throw bad('A coupon with this code already exists')
    }
    const res = await ctx.db.collection('coupons').findOneAndUpdate({ tenant_id: ctx.tenant.id, id: ctx.params.id }, { $set: { ...data, updated_at: new Date() } }, { returnDocument: 'after' })
    if (!res) throw notFound('Coupon not found')
    return { coupon: clean(res) }
  })
  r.del('/admin/coupons/:id', async (ctx) => {
    await requireStaff(ctx, MANAGEMENT_ROLES)
    const res = await ctx.db.collection('coupons').deleteOne({ tenant_id: ctx.tenant.id, id: ctx.params.id })
    if (!res.deletedCount) throw notFound('Coupon not found')
    return { ok: true }
  })

  // ---------- Reports ----------
  r.get('/admin/reports', async (ctx) => {
    await requireStaff(ctx, MANAGEMENT_ROLES)
    const tz = ctx.tenant.timezone || 'UTC'
    const { range = '7d', from, to } = ctx.query
    let start
    let end = new Date()
    if (range === 'today') start = startOfDayTz(tz)
    else if (range === '30d') start = startOfDayTz(tz, daysAgo(29))
    else if (range === 'custom' && from) {
      start = startOfDayTz(tz, new Date(from))
      if (to) end = new Date(startOfDayTz(tz, new Date(to)).getTime() + 86400000)
    } else start = startOfDayTz(tz, daysAgo(6))
    const orders = await ctx.db.collection('orders').find({ tenant_id: ctx.tenant.id, created_at: { $gte: start, $lt: end } }).toArray()
    const rev = orders.filter((o) => REVENUE_STATUSES.includes(o.status))
    const revenue = round2(rev.reduce((s, o) => s + o.total, 0))
    const seriesMap = new Map()
    for (let d = new Date(start); d < end; d = new Date(d.getTime() + 86400000)) seriesMap.set(dayKeyTz(tz, d), { date: dayKeyTz(tz, d), orders: 0, revenue: 0, cancelled: 0 })
    const items = {}
    const custs = {}
    const modes = {}
    let deliveryMinutes = []
    for (const o of orders) {
      const s = seriesMap.get(dayKeyTz(tz, new Date(o.created_at)))
      if (REVENUE_STATUSES.includes(o.status)) {
        if (s) { s.orders += 1; s.revenue = round2(s.revenue + o.total) }
        modes[o.mode] = (modes[o.mode] || 0) + 1
        for (const it of o.items) {
          items[it.name] = items[it.name] || { name: it.name, qty: 0, revenue: 0 }
          items[it.name].qty += it.qty
          items[it.name].revenue = round2(items[it.name].revenue + it.line_total)
        }
        if (o.customer_id) {
          custs[o.customer_id] = custs[o.customer_id] || { customer_id: o.customer_id, name: o.customer?.name || 'Guest', phone: o.customer?.phone, orders: 0, spent: 0 }
          custs[o.customer_id].orders += 1
          custs[o.customer_id].spent = round2(custs[o.customer_id].spent + o.total)
        }
        if (o.status === 'DELIVERED') {
          const placed = o.status_history?.find((h) => h.status === 'ORDER_PLACED')?.at || o.created_at
          const done = o.status_history?.find((h) => h.status === 'DELIVERED')?.at
          if (done) deliveryMinutes.push((new Date(done) - new Date(placed)) / 60000)
        }
      } else if (['CANCELLED', 'REJECTED'].includes(o.status) && s) s.cancelled += 1
    }
    return {
      range: { from: start, to: end },
      totals: {
        orders: rev.length,
        revenue,
        aov: rev.length ? round2(revenue / rev.length) : 0,
        cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
        rejected: orders.filter((o) => o.status === 'REJECTED').length,
        payment: { cod: rev.filter((o) => o.payment_method === 'COD').length, online: rev.filter((o) => o.payment_method !== 'COD').length, failed: orders.filter((o) => o.status === 'PAYMENT_FAILED').length },
        avg_fulfilment_min: deliveryMinutes.length ? Math.round(deliveryMinutes.reduce((a, b) => a + b, 0) / deliveryMinutes.length) : null,
        modes,
      },
      series: [...seriesMap.values()],
      top_items: Object.values(items).sort((a, b) => b.qty - a.qty).slice(0, 10),
      top_customers: Object.values(custs).sort((a, b) => b.spent - a.spent).slice(0, 10),
    }
  })

  // ---------- Settings ----------
  r.get('/admin/settings', async (ctx) => {
    await requireStaff(ctx, MANAGEMENT_ROLES)
    const t = await ctx.db.collection('tenants').findOne({ id: ctx.tenant.id })
    const domains = await ctx.db.collection('domains').find({ tenant_id: ctx.tenant.id }).toArray()
    return { settings: maskSettings(t), domains: cleanAll(domains), order_modes: ORDER_MODES }
  })
  r.patch('/admin/settings', async (ctx) => {
    const user = await requireStaff(ctx, MANAGEMENT_ROLES)
    const b = ctx.body || {}
    const set = {}
    const str = (k, max = 200) => { if (typeof b[k] === 'string') set[k] = b[k].trim().slice(0, max) }
    str('business_name', 80); str('tagline', 120); str('description', 400); str('logo', 600); str('hero_image', 600); str('opening_hours', 120)
    if (b.logo === null) set.logo = null
    if (b.hero_image === null) set.hero_image = null
    for (const k of ['primary_color', 'secondary_color']) if (b[k] !== undefined) { if (!isHexColor(b[k])) throw bad(`${k} must be a hex colour like #1F6F5F`); set[k] = b[k] }
    if (typeof b.is_open === 'boolean') set.is_open = b.is_open
    if (Array.isArray(b.ordering_modes)) {
      const modes = b.ordering_modes.filter((m) => ORDER_MODES.includes(m))
      if (!modes.length) throw bad('Enable at least one ordering mode')
      set.ordering_modes = modes
    }
    if (b.contact && typeof b.contact === 'object') set.contact = { phone: String(b.contact.phone || '').slice(0, 30), email: String(b.contact.email || '').slice(0, 120), address: String(b.contact.address || '').slice(0, 300) }
    if (b.delivery_settings) set.delivery_settings = { fee: Math.max(0, Number(b.delivery_settings.fee) || 0), free_above: Math.max(0, Number(b.delivery_settings.free_above) || 0), min_order: Math.max(0, Number(b.delivery_settings.min_order) || 0), radius_km: Math.max(0, Number(b.delivery_settings.radius_km) || 0), eta_min: Math.max(0, Number(b.delivery_settings.eta_min) || 0) }
    if (b.pickup_settings) set.pickup_settings = { eta_min: Math.max(0, Number(b.pickup_settings.eta_min) || 0) }
    if (b.tax_settings) set.tax_settings = { rate_percent: Math.min(100, Math.max(0, Number(b.tax_settings.rate_percent) || 0)), inclusive: !!b.tax_settings.inclusive, label: String(b.tax_settings.label || 'Tax').slice(0, 20) }
    if (b.packaging_fee !== undefined) set.packaging_fee = Math.max(0, Number(b.packaging_fee) || 0)
    if (b.payment_settings) {
      const cur = ctx.tenant.payment_settings || {}
      const rzIn = b.payment_settings.razorpay || {}
      const rz = { ...(cur.razorpay || {}) }
      if (typeof rzIn.key_id === 'string') rz.key_id = rzIn.key_id.trim()
      if (typeof rzIn.key_secret === 'string' && rzIn.key_secret.trim()) rz.key_secret = rzIn.key_secret.trim()
      if (typeof rzIn.webhook_secret === 'string' && rzIn.webhook_secret.trim()) rz.webhook_secret = rzIn.webhook_secret.trim()
      if (typeof rzIn.enabled === 'boolean') {
        if (rzIn.enabled && !(rz.key_id && rz.key_secret)) throw bad('Add your Razorpay Key ID and Key Secret before enabling online payments')
        rz.enabled = rzIn.enabled
      }
      set.payment_settings = { cod_enabled: b.payment_settings.cod_enabled !== undefined ? !!b.payment_settings.cod_enabled : cur.cod_enabled !== false, cod_label: String(b.payment_settings.cod_label ?? cur.cod_label ?? '').slice(0, 60), razorpay: rz }
      if (!set.payment_settings.cod_enabled && !rz.enabled) throw bad('At least one payment method must stay enabled')
    }
    set.updated_at = new Date()
    const res = await ctx.db.collection('tenants').findOneAndUpdate({ id: ctx.tenant.id }, { $set: set }, { returnDocument: 'after' })
    await audit(ctx.db, ctx.tenant.id, { actor_id: user.id, actor_role: user.role, action: 'SETTINGS_UPDATED', entity: 'tenant', entity_id: ctx.tenant.id, meta: { fields: Object.keys(set) } })
    return { settings: maskSettings(res) }
  })

  // ---------- Notifications & audit ----------
  r.get('/admin/notifications', async (ctx) => {
    await requireStaff(ctx)
    const list = await ctx.db.collection('notifications').find({ tenant_id: ctx.tenant.id, audience: 'admin' }).sort({ created_at: -1 }).limit(30).toArray()
    const unread = await ctx.db.collection('notifications').countDocuments({ tenant_id: ctx.tenant.id, audience: 'admin', read: false })
    return { notifications: cleanAll(list), unread }
  })
  r.post('/admin/notifications/read', async (ctx) => {
    await requireStaff(ctx)
    const filter = { tenant_id: ctx.tenant.id, audience: 'admin', read: false }
    if (Array.isArray(ctx.body?.ids) && ctx.body.ids.length) filter.id = { $in: ctx.body.ids }
    await ctx.db.collection('notifications').updateMany(filter, { $set: { read: true } })
    return { ok: true }
  })
  r.get('/admin/audit-logs', async (ctx) => {
    await requireStaff(ctx, MANAGEMENT_ROLES)
    const list = await ctx.db.collection('audit_logs').find({ tenant_id: ctx.tenant.id }).sort({ created_at: -1 }).limit(100).toArray()
    return { logs: cleanAll(list) }
  })
}
