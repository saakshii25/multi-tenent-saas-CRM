import { v4 as uuid } from 'uuid'
import { HttpError } from './api/http'
import { round2 } from './util'

// ---------------- Order state machine ----------------
export const STATUS = {
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID: 'PAID',
  ORDER_PLACED: 'ORDER_PLACED',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
}

export const ACTIVE_STATUSES = ['ORDER_PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']
export const REVENUE_STATUSES = ['ORDER_PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED']
export const FAILED_STATUSES = ['PAYMENT_FAILED', 'REJECTED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED']

export const TRANSITIONS = {
  PAYMENT_PENDING: ['PAID', 'PAYMENT_FAILED', 'CANCELLED'],
  PAID: ['ORDER_PLACED'],
  ORDER_PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'REJECTED', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  PAYMENT_FAILED: [],
  REJECTED: ['REFUND_PENDING', 'REFUNDED'],
  CANCELLED: ['REFUND_PENDING', 'REFUNDED'],
  REFUND_PENDING: ['REFUNDED'],
  REFUNDED: [],
}

// Which statuses each staff role may set.
export const ROLE_TRANSITIONS = {
  owner: '*',
  manager: '*',
  kitchen: ['ACCEPTED', 'REJECTED', 'PREPARING', 'READY', 'DELIVERED'],
  delivery: ['OUT_FOR_DELIVERY', 'DELIVERED'],
}

export const REJECTION_REASONS = [
  'Item unavailable',
  'Restaurant closed',
  'Kitchen overloaded',
  'Delivery unavailable',
  'Other',
]

export const ORDER_MODES = ['DELIVERY', 'PICKUP', 'DINE_IN', 'ROOM_SERVICE']

export function canTransition(order, to, role) {
  const allowed = TRANSITIONS[order.status] || []
  if (!allowed.includes(to)) return false
  if (to === 'OUT_FOR_DELIVERY' && order.mode !== 'DELIVERY') return false
  if (role && role !== 'customer' && role !== 'system') {
    const r = ROLE_TRANSITIONS[role]
    if (!r) return false
    if (r !== '*' && !r.includes(to)) return false
    // Kitchen staff can hand over pickup / dine-in / room-service orders but
    // delivery orders are closed by delivery staff or management.
    if (role === 'kitchen' && to === 'DELIVERED' && order.mode === 'DELIVERY') return false
  }
  return true
}

// ---------------- Pricing (server-side only) ----------------
export function priceItems(products, items) {
  const byId = new Map(products.map((p) => [p.id, p]))
  const lines = []
  const errors = []
  for (const it of items || []) {
    const p = byId.get(it.product_id)
    if (!p || p.deleted_at) {
      errors.push({ product_id: it.product_id, message: 'An item in your cart is no longer on the menu' })
      continue
    }
    if (!p.is_available) {
      errors.push({ product_id: p.id, message: `${p.name} is currently unavailable` })
      continue
    }
    const qty = Math.max(1, Math.min(50, parseInt(it.qty, 10) || 1))
    let unit = Number(p.base_price) || 0
    let variant = null
    if ((p.variants || []).length) {
      variant = p.variants.find((v) => v.id === it.variant_id) || null
      if (!variant) {
        errors.push({ product_id: p.id, message: `Please choose an option for ${p.name}` })
        continue
      }
      unit = Number(variant.price) || 0
    }
    const addons = []
    for (const aid of it.addon_ids || []) {
      const a = (p.addons || []).find((x) => x.id === aid)
      if (!a) continue
      addons.push({ id: a.id, name: a.name, price: Number(a.price) || 0 })
      unit += Number(a.price) || 0
    }
    unit = round2(unit)
    lines.push({
      product_id: p.id,
      name: p.name,
      image: p.image || null,
      is_veg: !!p.is_veg,
      variant_id: variant?.id || null,
      variant_name: variant?.name || null,
      addons,
      unit_price: unit,
      qty,
      line_total: round2(unit * qty),
      notes: String(it.notes || '').slice(0, 200) || null,
      tax_rate: p.tax_rate ?? null,
    })
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0))
  return { lines, subtotal, errors }
}

export function evaluateCoupon(coupon, subtotal, { customerUses = 0, now = new Date() } = {}) {
  if (!coupon || !coupon.is_active) return { ok: false, error: 'Invalid coupon code' }
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return { ok: false, error: 'This coupon is not active yet' }
  if (coupon.ends_at && new Date(coupon.ends_at) < now) return { ok: false, error: 'This coupon has expired' }
  if (coupon.usage_limit && (coupon.used_count || 0) >= coupon.usage_limit) return { ok: false, error: 'This coupon has been fully redeemed' }
  if (coupon.per_user_limit && customerUses >= coupon.per_user_limit) return { ok: false, error: 'You have already used this coupon' }
  if (coupon.min_order && subtotal < coupon.min_order) return { ok: false, error: `Add items worth ₹${round2(coupon.min_order - subtotal)} more to use this coupon` }
  let discount = coupon.type === 'PERCENT' ? (subtotal * Number(coupon.value)) / 100 : Number(coupon.value)
  if (coupon.max_discount) discount = Math.min(discount, Number(coupon.max_discount))
  discount = round2(Math.min(discount, subtotal))
  return { ok: true, discount }
}

export function computeTotals(tenant, { subtotal, discount = 0, mode }) {
  const tax = tenant.tax_settings || {}
  const taxable = Math.max(0, round2(subtotal - discount))
  const taxAmount = tax.inclusive ? 0 : round2((taxable * (Number(tax.rate_percent) || 0)) / 100)
  const ds = tenant.delivery_settings || {}
  let deliveryFee = 0
  if (mode === 'DELIVERY') {
    deliveryFee = Number(ds.fee) || 0
    if (ds.free_above && subtotal >= Number(ds.free_above)) deliveryFee = 0
  }
  const packagingFee = ['DELIVERY', 'PICKUP'].includes(mode) ? Number(tenant.packaging_fee) || 0 : 0
  const total = round2(taxable + taxAmount + deliveryFee + packagingFee)
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    tax: taxAmount,
    tax_label: tax.label || 'Tax',
    tax_rate: Number(tax.rate_percent) || 0,
    tax_inclusive: !!tax.inclusive,
    delivery_fee: round2(deliveryFee),
    packaging_fee: round2(packagingFee),
    total,
  }
}

// Builds a fully server-validated quote from raw cart items.
export async function buildQuote(db, tenant, { items = [], mode, coupon_code }, customer) {
  const ids = [...new Set((items || []).map((i) => i.product_id).filter(Boolean))]
  const products = ids.length
    ? await db.collection('products').find({ tenant_id: tenant.id, id: { $in: ids } }).toArray()
    : []
  const priced = priceItems(products, items)
  const errors = [...priced.errors]

  const modes = tenant.ordering_modes || []
  const effectiveMode = mode && modes.includes(mode) ? mode : null
  if (mode && !effectiveMode) errors.push({ message: 'This order type is not available' })

  let coupon = null
  let discount = 0
  let couponResult = null
  if (coupon_code) {
    const code = String(coupon_code).trim().toUpperCase()
    const c = await db.collection('coupons').findOne({ tenant_id: tenant.id, code })
    let uses = 0
    if (c && customer) {
      uses = await db.collection('coupon_usage').countDocuments({ tenant_id: tenant.id, coupon_id: c.id, customer_id: customer.id })
    }
    const ev = evaluateCoupon(c, priced.subtotal, { customerUses: uses })
    couponResult = { code, ...ev }
    if (ev.ok) {
      discount = ev.discount
      coupon = c
    }
  }

  const ds = tenant.delivery_settings || {}
  if (effectiveMode === 'DELIVERY' && ds.min_order && priced.subtotal < Number(ds.min_order) && priced.lines.length) {
    errors.push({ message: `Minimum order for delivery is ₹${ds.min_order}` })
  }

  const totals = computeTotals(tenant, { subtotal: priced.subtotal, discount, mode: effectiveMode })
  return { lines: priced.lines, ...totals, mode: effectiveMode, coupon: couponResult, coupon_doc: coupon, errors, currency: tenant.currency || 'INR' }
}

export async function nextOrderNumber(db, tenantId) {
  const res = await db.collection('counters').findOneAndUpdate(
    { tenant_id: tenantId, name: 'order' },
    { $inc: { seq: 1 }, $setOnInsert: { tenant_id: tenantId, name: 'order' } },
    { upsert: true, returnDocument: 'after' }
  )
  return 1000 + (res?.seq || 1)
}

// ---------------- Side-effects: notifications, audit, analytics ----------------
export async function notify(db, tenantId, { audience, customer_id = null, type, title, body, order_id = null }) {
  await db.collection('notifications').insertOne({
    id: uuid(),
    tenant_id: tenantId,
    audience,
    customer_id,
    type,
    title,
    body,
    order_id,
    read: false,
    created_at: new Date(),
  })
}
export async function audit(db, tenantId, { actor_id, actor_role, action, entity, entity_id, meta = {} }) {
  await db.collection('audit_logs').insertOne({
    id: uuid(),
    tenant_id: tenantId,
    actor_id,
    actor_role,
    action,
    entity,
    entity_id,
    meta,
    created_at: new Date(),
  })
}
export async function track(db, tenantId, event, props = {}) {
  await db.collection('analytics_events').insertOne({ id: uuid(), tenant_id: tenantId, event, props, created_at: new Date() })
}

const CUSTOMER_MESSAGES = {
  ORDER_PLACED: (o) => ['Order placed', `We have received your order #${o.order_number}.`],
  ACCEPTED: (o) => ['Order accepted', `Order #${o.order_number} has been accepted by the kitchen.`],
  PREPARING: (o) => ['Being prepared', `Your order #${o.order_number} is being prepared.`],
  READY: (o) => ['Order ready', o.mode === 'DELIVERY' ? 'Your order is packed and ready to go.' : o.mode === 'ROOM_SERVICE' ? 'Your order is on its way to your room.' : 'Your order is ready.'],
  OUT_FOR_DELIVERY: (o) => ['Out for delivery', `Order #${o.order_number} is on the way.`],
  DELIVERED: (o) => ['Delivered', `Order #${o.order_number} has been delivered. Enjoy!`],
  REJECTED: (o) => ['Order rejected', `Sorry, order #${o.order_number} was rejected. Reason: ${o.rejection_reason || 'Not specified'}.`],
  CANCELLED: (o) => ['Order cancelled', `Order #${o.order_number} was cancelled.`],
  REFUND_PENDING: (o) => ['Refund initiated', `A refund of ₹${o.total} for order #${o.order_number} has been initiated.`],
  REFUNDED: (o) => ['Refund completed', `₹${o.total} has been refunded for order #${o.order_number}.`],
}

// Atomic, validated status transition.
export async function transitionOrder(db, tenant, order, to, { actor_id = null, role = 'system', reason = null, note = null } = {}) {
  if (!canTransition(order, to, role)) {
    throw new HttpError(400, `Cannot move order from ${order.status.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}`, 'INVALID_TRANSITION')
  }
  const now = new Date()
  const set = { status: to, updated_at: now }
  if (to === 'REJECTED') set.rejection_reason = reason || 'Other'
  if (to === 'CANCELLED') set.cancel_reason = reason || null
  if (['REJECTED', 'CANCELLED'].includes(to)) {
    set.payment_status = order.payment_status === 'PAID' ? 'REFUND_PENDING' : 'VOID'
  }
  if (to === 'DELIVERED' && order.payment_method === 'COD') set.payment_status = 'PAID'
  if (to === 'REFUND_PENDING') set.payment_status = 'REFUND_PENDING'
  if (to === 'REFUNDED') set.payment_status = 'REFUNDED'

  const hist = { status: to, at: now, by: actor_id, role, note: note || reason || null }
  const updated = await db.collection('orders').findOneAndUpdate(
    { id: order.id, tenant_id: tenant.id, status: order.status },
    { $set: set, $push: { status_history: hist } },
    { returnDocument: 'after' }
  )
  if (!updated) throw new HttpError(409, 'This order was just updated by someone else. Please refresh.', 'CONFLICT')

  // Refund bookkeeping for paid orders that get rejected/cancelled.
  if (['REJECTED', 'CANCELLED'].includes(to) && order.payment_status === 'PAID') {
    await db.collection('refunds').insertOne({
      id: uuid(),
      tenant_id: tenant.id,
      order_id: order.id,
      payment_id: order.payment_id || null,
      amount: order.total,
      currency: order.currency,
      status: 'PENDING',
      reason: reason || to,
      created_at: now,
    })
  }
  if (to === 'REFUNDED') {
    await db.collection('refunds').updateMany({ tenant_id: tenant.id, order_id: order.id, status: 'PENDING' }, { $set: { status: 'COMPLETED', completed_at: now } })
  }

  const msg = CUSTOMER_MESSAGES[to]?.(updated)
  if (msg && updated.customer_id) {
    await notify(db, tenant.id, { audience: 'customer', customer_id: updated.customer_id, type: `ORDER_${to}`, title: msg[0], body: msg[1], order_id: updated.id })
  }
  if (to === 'CANCELLED' && role === 'customer') {
    await notify(db, tenant.id, { audience: 'admin', type: 'ORDER_CANCELLED', title: `Order #${updated.order_number} cancelled`, body: 'The customer cancelled this order.', order_id: updated.id })
  }
  await audit(db, tenant.id, { actor_id, actor_role: role, action: `ORDER_${to}`, entity: 'order', entity_id: order.id, meta: { from: order.status, reason, note } })
  await track(db, tenant.id, `ORDER_${to}`, { order_id: order.id, total: updated.total, mode: updated.mode })
  return updated
}
