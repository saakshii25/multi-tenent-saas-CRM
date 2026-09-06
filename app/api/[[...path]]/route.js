import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { resolveTenant, isPlatformHost, getHost } from '@/lib/tenant'
import { ensureSeeded } from '@/lib/seed'
import { HttpError } from '@/lib/api/http'
import { router } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Single API entrypoint. Every request is scoped to a tenant that is resolved
// SERVER-SIDE from the Host header (or the preview cookie on platform hosts).
// Client-supplied tenant ids are never trusted.
async function handle(request, { params }) {
  const { path = [] } = await params
  const route = '/' + path.join('/')
  try {
    const db = await getDb()
    await ensureSeeded(db)

    const m = router.match(request.method, route)
    if (!m) return NextResponse.json({ error: `Route ${route} not found`, code: 'NOT_FOUND' }, { status: 404 })

    let body = {}
    if (!['GET', 'HEAD'].includes(request.method)) {
      try { body = await request.json() } catch { body = {} }
    }
    const url = new URL(request.url)
    const ctx = { request, db, params: m.params, query: Object.fromEntries(url.searchParams.entries()), body, host: getHost(request), route }

    if (m.meta?.platform) {
      if (!isPlatformHost(ctx.host)) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    } else if (!m.meta?.noTenant) {
      const r = await resolveTenant(request)
      if (!r.tenant) {
        return NextResponse.json({ error: 'No business is configured for this domain', code: r.error, host: r.host }, { status: 404 })
      }
      ctx.tenant = r.tenant
      ctx.tenantVia = r.via
    }

    const result = await m.handler(ctx)
    if (result instanceof Response) return result
    return NextResponse.json(result ?? { ok: true })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    console.error('[api]', request.method, route, e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
