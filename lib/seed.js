import { v4 as uuid } from 'uuid'
import { hashPassword } from './auth'
import { daysAgo, round2 } from './util'

const img = (id, w = 640) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`
const IMG = {
  latte: img('photo-1485808191679-5f86510681a2'),
  croissant: img('photo-1691480162735-9b91238080f6'),
  club: img('photo-1676300184084-de35d56a9a70'),
  pasta: img('photo-1621996346565-e3dbc646d9a9'),
  cake: img('photo-1588195538326-c5b1e9f80a1b'),
  cafeHero: img('photo-1567880905822-56f8e06fe630', 1600),
  biryani: img('photo-1589302168068-964664d93dc0'),
  butterChicken: img('photo-1631452180519-c014fe946bc7'),
  paneer: img('photo-1666001120694-3ebe8fd207be'),
  breakfast: img('photo-1525473233136-080cdd8b7cb2'),
  cheesecake: img('photo-1676300185983-d5f242babe34'),
  hotelHero: img('photo-1552566626-52f8b828add9', 1600),
}

let seedChecked = false

export async function ensureSeeded(db) {
  if (seedChecked) return
  seedChecked = true
  const count = await db.collection('tenants').countDocuments()
  if (count > 0) return
  await seedAll(db)
}

export async function seedAll(db) {
  const now = new Date()
  const v = (name, price) => ({ id: uuid(), name, price })
  const a = (name, price) => ({ id: uuid(), name, price })

  // ---------------- Tenant 1: White Mug (Cafe) ----------------
  const wm = {
    id: uuid(),
    slug: 'white-mug',
    is_default_demo: true,
    business_name: 'White Mug',
    business_type: 'CAFE',
    tagline: 'Specialty coffee, fresh bakes & honest food',
    description: 'A neighbourhood cafe roasting small-batch coffee and baking every morning.',
    logo: null,
    hero_image: IMG.cafeHero,
    primary_color: '#1F6F5F',
    secondary_color: '#F4EDE4',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    contact: { phone: '+91 98200 11223', email: 'hello@thewhitemug.site', address: '12, Lane 4, Koregaon Park, Pune 411001' },
    opening_hours: '8:00 AM – 10:30 PM',
    is_open: true,
    ordering_modes: ['PICKUP', 'DINE_IN', 'DELIVERY'],
    delivery_settings: { fee: 40, free_above: 499, min_order: 149, radius_km: 6, eta_min: 35 },
    pickup_settings: { eta_min: 15 },
    tax_settings: { rate_percent: 5, inclusive: false, label: 'GST' },
    packaging_fee: 10,
    payment_settings: { cod_enabled: true, cod_label: 'Pay at counter / on delivery', razorpay: { enabled: false, key_id: '', key_secret: '', webhook_secret: '' } },
    notification_settings: { email: true, in_app: true },
    plan: 'GROWTH',
    subscription_status: 'ACTIVE',
    trial_status: null,
    billing_provider: null,
    status: 'active',
    created_at: daysAgo(90),
    updated_at: now,
  }

  // ---------------- Tenant 2: ABC Hotel ----------------
  const abc = {
    id: uuid(),
    slug: 'abc-hotel',
    is_default_demo: false,
    business_name: 'ABC Hotel',
    business_type: 'HOTEL',
    tagline: 'In-room dining & all-day restaurant',
    description: 'Order from the comfort of your room or reserve a table at The Terrace.',
    logo: null,
    hero_image: IMG.hotelHero,
    primary_color: '#1E3A5F',
    secondary_color: '#F5F1E8',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    contact: { phone: '+91 80 4455 0000', email: 'dining@abchotel.com', address: 'MG Road, Bengaluru 560001' },
    opening_hours: '24 hours (room service) · Restaurant 7 AM – 11 PM',
    is_open: true,
    ordering_modes: ['ROOM_SERVICE', 'DINE_IN', 'PICKUP', 'DELIVERY'],
    delivery_settings: { fee: 60, free_above: 999, min_order: 299, radius_km: 5, eta_min: 45 },
    pickup_settings: { eta_min: 20 },
    tax_settings: { rate_percent: 18, inclusive: false, label: 'GST' },
    packaging_fee: 20,
    payment_settings: { cod_enabled: true, cod_label: 'Charge to room / pay at desk', razorpay: { enabled: false, key_id: '', key_secret: '', webhook_secret: '' } },
    notification_settings: { email: true, in_app: true },
    plan: 'ENTERPRISE',
    subscription_status: 'ACTIVE',
    trial_status: null,
    billing_provider: null,
    status: 'active',
    created_at: daysAgo(60),
    updated_at: now,
  }

  await db.collection('tenants').insertMany([wm, abc])

  await db.collection('domains').insertMany([
    { id: uuid(), tenant_id: wm.id, domain: 'thewhitemug.site', is_primary: true, verified: true, status: 'active', ssl_status: 'active', verification_token: uuid(), created_at: daysAgo(80) },
    { id: uuid(), tenant_id: wm.id, domain: 'white-mug.local', is_primary: false, verified: true, status: 'active', ssl_status: 'n/a', verification_token: uuid(), created_at: daysAgo(80) },
    { id: uuid(), tenant_id: abc.id, domain: 'abchotel.com', is_primary: true, verified: true, status: 'active', ssl_status: 'active', verification_token: uuid(), created_at: daysAgo(50) },
  ])

  // ---------------- Users (staff + super admin) ----------------
  const pw = await hashPassword('admin123')
  const kpw = await hashPassword('kitchen123')
  const spw = await hashPassword('super123')
  const wmOwner = { id: uuid(), tenant_id: wm.id, email: 'owner@whitemug.demo', password_hash: pw, name: 'Meera Kulkarni', role: 'owner', status: 'active', created_at: daysAgo(90) }
  const wmKitchen = { id: uuid(), tenant_id: wm.id, email: 'kitchen@whitemug.demo', password_hash: kpw, name: 'Sanjay (Kitchen)', role: 'kitchen', status: 'active', created_at: daysAgo(80) }
  const wmRider = { id: uuid(), tenant_id: wm.id, email: 'rider@whitemug.demo', password_hash: kpw, name: 'Imran (Rider)', role: 'delivery', status: 'active', created_at: daysAgo(70) }
  const abcOwner = { id: uuid(), tenant_id: abc.id, email: 'owner@abchotel.demo', password_hash: pw, name: 'Arjun Rao', role: 'owner', status: 'active', created_at: daysAgo(60) }
  const superAdmin = { id: uuid(), tenant_id: null, email: 'admin@platform.demo', password_hash: spw, name: 'Platform Admin', role: 'super_admin', status: 'active', created_at: daysAgo(120) }
  await db.collection('users').insertMany([wmOwner, wmKitchen, wmRider, abcOwner, superAdmin])

  // ---------------- Menus ----------------
  const cat = (tenant_id, name, sort_order, description = '') => ({ id: uuid(), tenant_id, name, description, image: null, sort_order, is_active: true, created_at: now })
  const wmCats = {
    coffee: cat(wm.id, 'Coffee & Espresso', 1, 'Single-origin beans, roasted weekly'),
    cold: cat(wm.id, 'Cold Beverages', 2),
    bakery: cat(wm.id, 'Bakery', 3, 'Baked fresh every morning'),
    sandwiches: cat(wm.id, 'Sandwiches', 4),
    mains: cat(wm.id, 'Pasta & Mains', 5),
    desserts: cat(wm.id, 'Desserts', 6),
  }
  const abcCats = {
    breakfast: cat(abc.id, 'Breakfast', 1, 'Served 7 AM – 11 AM'),
    indian: cat(abc.id, 'Indian Mains', 2),
    bites: cat(abc.id, 'Sandwiches & Light Bites', 3),
    desserts: cat(abc.id, 'Desserts', 4),
    beverages: cat(abc.id, 'Beverages', 5),
  }
  await db.collection('categories').insertMany([...Object.values(wmCats), ...Object.values(abcCats)])

  const prod = (tenant_id, category_id, name, base_price, o = {}) => ({
    id: uuid(),
    tenant_id,
    category_id,
    name,
    description: o.description || '',
    image: o.image || null,
    base_price,
    is_veg: o.is_veg !== false,
    prep_time_min: o.prep || 15,
    is_available: o.available !== false,
    is_featured: !!o.featured,
    tax_rate: null,
    sort_order: o.sort || 0,
    variants: o.variants || [],
    addons: o.addons || [],
    deleted_at: null,
    created_at: now,
    updated_at: now,
  })

  const wmProducts = [
    prod(wm.id, wmCats.coffee.id, 'Signature Latte', 180, { image: IMG.latte, featured: true, prep: 6, sort: 1, description: 'Double shot espresso with silky steamed milk and our house latte art.', variants: [v('Regular (240ml)', 180), v('Large (360ml)', 220)], addons: [a('Extra espresso shot', 40), a('Oat milk', 50), a('Vanilla syrup', 30), a('Hazelnut syrup', 30)] }),
    prod(wm.id, wmCats.coffee.id, 'Cappuccino', 160, { prep: 5, sort: 2, description: 'Classic Italian style with a thick velvety foam.', variants: [v('Regular', 160), v('Large', 200)], addons: [a('Extra espresso shot', 40), a('Oat milk', 50)] }),
    prod(wm.id, wmCats.coffee.id, 'Pour Over (Single Origin)', 220, { prep: 8, sort: 3, description: "This week: Chikmagalur washed Arabica. Notes of cocoa and citrus." }),
    prod(wm.id, wmCats.cold.id, 'Cold Brew', 190, { prep: 3, sort: 1, description: '18-hour steeped cold brew served over ice.', addons: [a('Vanilla syrup', 30), a('Tonic top-up', 40)] }),
    prod(wm.id, wmCats.cold.id, 'Iced Mocha', 210, { prep: 5, sort: 2, description: 'Espresso, dark chocolate and cold milk over ice.', variants: [v('Regular', 210), v('Large', 250)] }),
    prod(wm.id, wmCats.bakery.id, 'Butter Croissant', 120, { image: IMG.croissant, featured: true, prep: 4, sort: 1, description: '72-hour laminated dough, baked golden and flaky.', addons: [a('Almond glaze', 30), a('Warm it up', 0)] }),
    prod(wm.id, wmCats.bakery.id, 'Pain au Chocolat', 140, { prep: 4, sort: 2, description: 'Croissant dough wrapped around two batons of dark chocolate.' }),
    prod(wm.id, wmCats.bakery.id, 'Banana Walnut Loaf', 110, { prep: 3, sort: 3, description: 'Moist, nutty and lightly spiced. A slice of comfort.', available: false }),
    prod(wm.id, wmCats.sandwiches.id, 'Chicken Club Sandwich', 260, { image: IMG.club, is_veg: false, featured: true, prep: 15, sort: 1, description: 'Triple-decker with grilled chicken, bacon, egg, lettuce and tomato.', addons: [a('Extra cheese', 40), a('Side of fries', 60)] }),
    prod(wm.id, wmCats.sandwiches.id, 'Grilled Veg Panini', 220, { prep: 12, sort: 2, description: 'Zucchini, peppers, pesto and mozzarella on ciabatta.', addons: [a('Extra cheese', 40), a('Side of fries', 60)] }),
    prod(wm.id, wmCats.mains.id, 'Creamy Alfredo Pasta', 320, { image: IMG.pasta, featured: true, prep: 20, sort: 1, description: 'Fettuccine tossed in parmesan cream with garlic and herbs.', variants: [v('Veg', 320), v('Grilled Chicken', 390)], addons: [a('Extra parmesan', 40), a('Garlic bread (2 pc)', 70)] }),
    prod(wm.id, wmCats.mains.id, 'Penne Arrabbiata', 290, { prep: 18, sort: 2, description: 'Spicy tomato sauce, roasted garlic, chilli flakes and basil.', addons: [a('Garlic bread (2 pc)', 70)] }),
    prod(wm.id, wmCats.desserts.id, 'Belgian Chocolate Cake', 180, { image: IMG.cake, featured: true, prep: 3, sort: 1, description: 'Dense, dark and decadent. Made with 70% Belgian couverture.' }),
    prod(wm.id, wmCats.desserts.id, 'Blueberry Cheesecake', 210, { image: IMG.cheesecake, prep: 3, sort: 2, description: 'Baked New York style with a wild blueberry compote.' }),
  ]
  const abcProducts = [
    prod(abc.id, abcCats.breakfast.id, 'Continental Breakfast Platter', 450, { image: IMG.breakfast, featured: true, prep: 20, sort: 1, description: 'Eggs your way, toast, grilled tomato, baked beans, seasonal fruit and juice.', addons: [a('Add bacon', 90), a('Add chicken sausage', 90)] }),
    prod(abc.id, abcCats.breakfast.id, 'Masala Dosa', 260, { prep: 15, sort: 2, description: 'Crisp dosa with spiced potato, sambar and two chutneys.' }),
    prod(abc.id, abcCats.indian.id, 'Hyderabadi Chicken Biryani', 420, { image: IMG.biryani, is_veg: false, featured: true, prep: 30, sort: 1, description: 'Slow-cooked dum biryani with saffron, mint and caramelised onions.', variants: [v('Half', 420), v('Full', 680)], addons: [a('Raita', 40), a('Extra salan', 30)] }),
    prod(abc.id, abcCats.indian.id, 'Butter Chicken', 480, { image: IMG.butterChicken, is_veg: false, featured: true, prep: 25, sort: 2, description: 'Tandoori chicken simmered in a velvety tomato-butter gravy.', addons: [a('Garlic naan', 80), a('Steamed rice', 120)] }),
    prod(abc.id, abcCats.indian.id, 'Paneer Tikka', 380, { image: IMG.paneer, prep: 20, sort: 3, description: 'Char-grilled cottage cheese with peppers in a smoky marinade.' }),
    prod(abc.id, abcCats.indian.id, 'Dal Makhani', 340, { prep: 15, sort: 4, description: 'Black lentils slow-cooked overnight with butter and cream.', addons: [a('Garlic naan', 80), a('Steamed rice', 120)] }),
    prod(abc.id, abcCats.indian.id, 'Garlic Naan', 80, { prep: 8, sort: 5, description: 'Tandoor-baked leavened bread brushed with garlic butter.' }),
    prod(abc.id, abcCats.bites.id, 'Club Sandwich', 350, { image: IMG.club, is_veg: false, prep: 15, sort: 1, description: 'Grilled chicken, egg, lettuce and tomato with fries.' }),
    prod(abc.id, abcCats.bites.id, 'Grilled Veg Panini', 320, { prep: 15, sort: 2, description: 'Roasted vegetables, pesto and mozzarella.' }),
    prod(abc.id, abcCats.desserts.id, 'New York Cheesecake', 320, { image: IMG.cheesecake, featured: true, prep: 5, sort: 1, description: 'Classic baked cheesecake with berry coulis.' }),
    prod(abc.id, abcCats.desserts.id, 'Gulab Jamun (2 pc)', 180, { prep: 5, sort: 2, description: 'Warm, syrup-soaked and fragrant with cardamom.' }),
    prod(abc.id, abcCats.beverages.id, 'Masala Chai', 120, { prep: 6, sort: 1, description: 'Brewed with ginger, cardamom and whole spices.' }),
    prod(abc.id, abcCats.beverages.id, 'Fresh Juice', 180, { prep: 5, sort: 2, description: 'Cold pressed to order.', variants: [v('Orange', 180), v('Watermelon', 160), v('Pineapple', 180)] }),
  ]
  await db.collection('products').insertMany([...wmProducts, ...abcProducts])

  // ---------------- Coupons ----------------
  const coupon = (tenant_id, code, type, value, o = {}) => ({
    id: uuid(), tenant_id, code, type, value, min_order: o.min_order || 0, max_discount: o.max_discount || null,
    starts_at: null, ends_at: o.ends_at || null, usage_limit: o.usage_limit || null, per_user_limit: o.per_user_limit || null,
    is_active: true, used_count: 0, description: o.description || '', created_at: now,
  })
  await db.collection('coupons').insertMany([
    coupon(wm.id, 'WELCOME10', 'PERCENT', 10, { min_order: 299, max_discount: 100, per_user_limit: 1, description: '10% off your first order' }),
    coupon(wm.id, 'FLAT50', 'FIXED', 50, { min_order: 499, description: 'Flat ₹50 off on orders above ₹499' }),
    coupon(abc.id, 'STAY15', 'PERCENT', 15, { min_order: 999, max_discount: 300, description: '15% off for in-house guests' }),
  ])

  // ---------------- Customers & sample orders ----------------
  const cust = (tenant_id, name, phone, email, addresses = [], created) => ({
    id: uuid(), tenant_id, name, phone, email, addresses, created_at: created, last_login_at: created,
  })
  const addr = (label, line1, line2, city, pincode) => ({ id: uuid(), label, line1, line2, city, pincode, landmark: '' })
  const wmCustomers = [
    cust(wm.id, 'Aarav Sharma', '9876543210', 'aarav@example.com', [addr('Home', 'Flat 402, Sunshine Residency', 'North Main Road', 'Pune', '411001')], daysAgo(45)),
    cust(wm.id, 'Priya Nair', '9812345678', 'priya@example.com', [addr('Office', 'WeWork, 3rd Floor', 'Kalyani Nagar', 'Pune', '411006')], daysAgo(30)),
    cust(wm.id, 'Rohan Mehta', '9898989898', '', [], daysAgo(3)),
    cust(wm.id, 'Sneha Iyer', '9822001122', 'sneha@example.com', [], daysAgo(70)),
  ]
  const abcCustomers = [
    cust(abc.id, 'David Chen', '9900112233', 'david@example.com', [], daysAgo(10)),
    cust(abc.id, 'Ananya Gupta', '9911223344', '', [], daysAgo(2)),
  ]
  await db.collection('customers').insertMany([...wmCustomers, ...abcCustomers])

  const orders = []
  let seqWm = 1000
  let seqAbc = 1000
  const line = (p, qty, variant = null, addonNames = [], notes = null) => {
    const vr = variant ? p.variants.find((x) => x.name === variant) : null
    const ads = addonNames.map((n) => p.addons.find((x) => x.name === n)).filter(Boolean).map((x) => ({ id: x.id, name: x.name, price: x.price }))
    const unit = round2((vr ? vr.price : p.base_price) + ads.reduce((s, x) => s + x.price, 0))
    return { product_id: p.id, name: p.name, image: p.image, is_veg: p.is_veg, variant_id: vr?.id || null, variant_name: vr?.name || null, addons: ads, unit_price: unit, qty, line_total: round2(unit * qty), notes, tax_rate: null }
  }
  const mkOrder = (tenant, customer, lines, createdAt, status, mode, extra = {}) => {
    const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0))
    const discount = extra.discount || 0
    const taxable = subtotal - discount
    const tax = round2((taxable * tenant.tax_settings.rate_percent) / 100)
    const delivery_fee = mode === 'DELIVERY' ? (subtotal >= tenant.delivery_settings.free_above ? 0 : tenant.delivery_settings.fee) : 0
    const packaging_fee = ['DELIVERY', 'PICKUP'].includes(mode) ? tenant.packaging_fee : 0
    const total = round2(taxable + tax + delivery_fee + packaging_fee)
    const seq = tenant.id === wm.id ? ++seqWm : ++seqAbc
    const history = [{ status: 'ORDER_PLACED', at: createdAt, by: customer.id, role: 'customer', note: null }]
    const chain = { ACCEPTED: 2, PREPARING: 4, READY: 18, OUT_FOR_DELIVERY: 20, DELIVERED: 40 }
    if (status !== 'ORDER_PLACED' && status !== 'REJECTED' && status !== 'CANCELLED') {
      for (const [s, m] of Object.entries(chain)) {
        if (s === 'OUT_FOR_DELIVERY' && mode !== 'DELIVERY') continue
        history.push({ status: s, at: new Date(createdAt.getTime() + m * 60000), by: null, role: 'owner', note: null })
        if (s === status) break
      }
    }
    if (status === 'REJECTED') history.push({ status: 'REJECTED', at: new Date(createdAt.getTime() + 3 * 60000), by: null, role: 'owner', note: extra.rejection_reason })
    return {
      id: uuid(), tenant_id: tenant.id, order_number: seq, customer_id: customer.id,
      customer: { name: customer.name, phone: customer.phone, email: customer.email || '' },
      mode, address: mode === 'DELIVERY' ? customer.addresses[0] || addr('Home', '221B Baker Street', '', 'Pune', '411001') : null,
      table_number: mode === 'DINE_IN' ? extra.table || '4' : null, room_number: mode === 'ROOM_SERVICE' ? extra.room || '305' : null,
      notes: extra.notes || null, items: lines, subtotal, discount, coupon_code: extra.coupon_code || null, tax, delivery_fee, packaging_fee, total,
      currency: 'INR', payment_method: 'COD', payment_status: status === 'DELIVERED' ? 'PAID' : ['REJECTED', 'CANCELLED'].includes(status) ? 'VOID' : 'PENDING',
      status, status_history: history, rejection_reason: extra.rejection_reason || null, delivery_assignee_id: extra.rider || null,
      internal_notes: [], source: 'WEB', idempotency_key: uuid(), created_at: createdAt, updated_at: history[history.length - 1].at,
    }
  }
  const P = (list, name) => list.find((p) => p.name === name)
  const [aarav, priya, rohan, sneha] = wmCustomers
  const minutesAgo = (m) => new Date(now.getTime() - m * 60000)

  orders.push(
    mkOrder(wm, aarav, [line(P(wmProducts, 'Signature Latte'), 2, 'Large (360ml)', ['Oat milk']), line(P(wmProducts, 'Butter Croissant'), 2)], daysAgo(14), 'DELIVERED', 'PICKUP'),
    mkOrder(wm, aarav, [line(P(wmProducts, 'Creamy Alfredo Pasta'), 1, 'Grilled Chicken', ['Garlic bread (2 pc)']), line(P(wmProducts, 'Cold Brew'), 1)], daysAgo(9), 'DELIVERED', 'DELIVERY'),
    mkOrder(wm, aarav, [line(P(wmProducts, 'Chicken Club Sandwich'), 1, null, ['Side of fries']), line(P(wmProducts, 'Iced Mocha'), 1, 'Regular')], daysAgo(5), 'DELIVERED', 'DINE_IN', { table: '7' }),
    mkOrder(wm, aarav, [line(P(wmProducts, 'Belgian Chocolate Cake'), 2), line(P(wmProducts, 'Cappuccino'), 2, 'Regular')], daysAgo(2), 'DELIVERED', 'PICKUP'),
    mkOrder(wm, priya, [line(P(wmProducts, 'Grilled Veg Panini'), 1), line(P(wmProducts, 'Signature Latte'), 1, 'Regular (240ml)')], daysAgo(12), 'DELIVERED', 'DELIVERY'),
    mkOrder(wm, priya, [line(P(wmProducts, 'Penne Arrabbiata'), 2, null, ['Garlic bread (2 pc)'])], daysAgo(6), 'DELIVERED', 'DELIVERY', { coupon_code: 'WELCOME10', discount: 65 }),
    mkOrder(wm, priya, [line(P(wmProducts, 'Blueberry Cheesecake'), 1), line(P(wmProducts, 'Pour Over (Single Origin)'), 1)], daysAgo(1), 'DELIVERED', 'PICKUP'),
    mkOrder(wm, sneha, [line(P(wmProducts, 'Cappuccino'), 1, 'Large')], daysAgo(48), 'DELIVERED', 'PICKUP'),
    mkOrder(wm, rohan, [line(P(wmProducts, 'Chicken Club Sandwich'), 1)], daysAgo(3), 'REJECTED', 'DELIVERY', { rejection_reason: 'Delivery unavailable' }),
    // today, live board
    mkOrder(wm, rohan, [line(P(wmProducts, 'Creamy Alfredo Pasta'), 1, 'Veg'), line(P(wmProducts, 'Cold Brew'), 2, null, ['Vanilla syrup'])], minutesAgo(26), 'PREPARING', 'DELIVERY'),
    mkOrder(wm, priya, [line(P(wmProducts, 'Signature Latte'), 1, 'Large (360ml)', ['Extra espresso shot']), line(P(wmProducts, 'Pain au Chocolat'), 1)], minutesAgo(9), 'ACCEPTED', 'DINE_IN', { table: '3', notes: 'Less sugar please' }),
    mkOrder(wm, aarav, [line(P(wmProducts, 'Butter Croissant'), 3, null, ['Warm it up']), line(P(wmProducts, 'Cappuccino'), 2, 'Regular')], minutesAgo(2), 'ORDER_PLACED', 'PICKUP')
  )
  const [david, ananya] = abcCustomers
  orders.push(
    mkOrder(abc, david, [line(P(abcProducts, 'Hyderabadi Chicken Biryani'), 1, 'Full', ['Raita']), line(P(abcProducts, 'Masala Chai'), 2)], daysAgo(8), 'DELIVERED', 'ROOM_SERVICE', { room: '412' }),
    mkOrder(abc, david, [line(P(abcProducts, 'Continental Breakfast Platter'), 2, null, ['Add bacon'])], daysAgo(7), 'DELIVERED', 'ROOM_SERVICE', { room: '412' }),
    mkOrder(abc, ananya, [line(P(abcProducts, 'Butter Chicken'), 1, null, ['Garlic naan']), line(P(abcProducts, 'Dal Makhani'), 1)], daysAgo(1), 'DELIVERED', 'DINE_IN', { table: '12' }),
    mkOrder(abc, ananya, [line(P(abcProducts, 'Paneer Tikka'), 1), line(P(abcProducts, 'Fresh Juice'), 2, 'Watermelon')], minutesAgo(5), 'ORDER_PLACED', 'ROOM_SERVICE', { room: '218' })
  )
  await db.collection('orders').insertMany(orders)
  await db.collection('counters').insertMany([
    { tenant_id: wm.id, name: 'order', seq: seqWm - 1000 },
    { tenant_id: abc.id, name: 'order', seq: seqAbc - 1000 },
  ])

  // Admin notifications for the live orders
  const liveNew = orders.filter((o) => o.status === 'ORDER_PLACED')
  if (liveNew.length) {
    await db.collection('notifications').insertMany(
      liveNew.map((o) => ({ id: uuid(), tenant_id: o.tenant_id, audience: 'admin', customer_id: null, type: 'NEW_ORDER', title: `New order #${o.order_number}`, body: `${o.items.map((i) => `${i.qty}x ${i.name}`).join(', ')} · ₹${o.total}`, order_id: o.id, read: false, created_at: o.created_at }))
    )
  }
  return { tenants: 2 }
}
