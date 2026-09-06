import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me'

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  MANAGER: 'manager',
  KITCHEN: 'kitchen',
  DELIVERY: 'delivery',
  CUSTOMER: 'customer',
}
export const STAFF_ROLES = ['owner', 'manager', 'kitchen', 'delivery']
export const MANAGEMENT_ROLES = ['owner', 'manager']

// Three independent session cookies so a merchant can test the customer flow
// in the same browser without clobbering their admin session.
export const COOKIES = {
  customer: 'cust_session',
  staff: 'staff_session',
  platform: 'platform_session',
}

export function signToken(payload, expiresIn = '30d') {
  return jwt.sign(payload, SECRET, { expiresIn })
}
export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET)
  } catch {
    return null
  }
}
export async function hashPassword(p) {
  return bcrypt.hash(String(p), 10)
}
export async function comparePassword(p, hash) {
  if (!hash) return false
  return bcrypt.compare(String(p), hash)
}

export function getSession(request, kind) {
  const token = request.cookies.get(COOKIES[kind])?.value
  if (!token) return null
  return verifyToken(token)
}
export function setSessionCookie(response, kind, token) {
  response.cookies.set(COOKIES[kind], token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}
export function clearSessionCookie(response, kind) {
  response.cookies.set(COOKIES[kind], '', { httpOnly: true, path: '/', maxAge: 0 })
}
