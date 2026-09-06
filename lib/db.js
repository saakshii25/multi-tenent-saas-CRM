import { MongoClient } from 'mongodb'

// Single shared connection (pooled by the driver). Never hardcode URLs – always from env.
let client
let db
let indexesReady = false

export async function getDb() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME)
  }
  if (!indexesReady) {
    indexesReady = true
    await ensureIndexes(db)
  }
  return db
}

async function ensureIndexes(db) {
  const ops = [
    db.collection('tenants').createIndex({ slug: 1 }, { unique: true }),
    db.collection('domains').createIndex({ domain: 1 }, { unique: true }),
    db.collection('domains').createIndex({ tenant_id: 1 }),
    db.collection('users').createIndex({ email: 1, tenant_id: 1 }, { unique: true }),
    db.collection('customers').createIndex({ tenant_id: 1, phone: 1 }, { unique: true }),
    db.collection('categories').createIndex({ tenant_id: 1, sort_order: 1 }),
    db.collection('products').createIndex({ tenant_id: 1, category_id: 1 }),
    db.collection('orders').createIndex({ tenant_id: 1, created_at: -1 }),
    db.collection('orders').createIndex({ tenant_id: 1, status: 1 }),
    db.collection('orders').createIndex({ tenant_id: 1, customer_id: 1 }),
    db.collection('orders').createIndex({ tenant_id: 1, order_number: 1 }, { unique: true }),
    db.collection('orders').createIndex({ idempotency_key: 1 }, { unique: true, sparse: true }),
    db.collection('payments').createIndex({ provider_payment_id: 1 }, { unique: true, sparse: true }),
    db.collection('payments').createIndex({ tenant_id: 1, order_id: 1 }),
    db.collection('coupons').createIndex({ tenant_id: 1, code: 1 }, { unique: true }),
    db.collection('coupon_usage').createIndex({ tenant_id: 1, coupon_id: 1, customer_id: 1 }),
    db.collection('notifications').createIndex({ tenant_id: 1, audience: 1, created_at: -1 }),
    db.collection('audit_logs').createIndex({ tenant_id: 1, created_at: -1 }),
    db.collection('analytics_events').createIndex({ tenant_id: 1, created_at: -1 }),
    db.collection('otp_codes').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
  ]
  await Promise.allSettled(ops)
}
