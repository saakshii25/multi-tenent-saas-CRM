import { NextResponse } from 'next/server'

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code || 'ERROR'
  }
}
export const bad = (m, c = 'BAD_REQUEST') => new HttpError(400, m, c)
export const unauthorized = (m = 'Authentication required') => new HttpError(401, m, 'UNAUTHORIZED')
export const forbidden = (m = 'You do not have permission to do that') => new HttpError(403, m, 'FORBIDDEN')
export const notFound = (m = 'Not found') => new HttpError(404, m, 'NOT_FOUND')

export function json(data, status = 200) {
  return NextResponse.json(data, { status })
}

// Tiny pattern router: '/admin/orders/:id/status'
export function createRouter() {
  const routes = []
  function add(method, pattern, handler, meta = {}) {
    const keys = []
    const src = pattern.replace(/\/:([a-zA-Z_]+)/g, (_, k) => {
      keys.push(k)
      return '/([^/]+)'
    })
    routes.push({ method, regex: new RegExp('^' + src + '/?$'), keys, handler, meta })
  }
  return {
    get: (p, h, m) => add('GET', p, h, m),
    post: (p, h, m) => add('POST', p, h, m),
    patch: (p, h, m) => add('PATCH', p, h, m),
    put: (p, h, m) => add('PUT', p, h, m),
    del: (p, h, m) => add('DELETE', p, h, m),
    match(method, path) {
      for (const r of routes) {
        if (r.method !== method) continue
        const m = r.regex.exec(path)
        if (m) {
          const params = {}
          r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])))
          return { handler: r.handler, params, meta: r.meta }
        }
      }
      return null
    },
  }
}
