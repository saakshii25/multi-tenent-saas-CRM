'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { useTenant } from '@/components/shared/TenantProvider'
import { fetcher, money, timeAgo } from '@/lib/client'
import { PageHeader, StatCard, StatusBadge, ModeChip, Empty } from './ui'
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, CartesianGrid } from 'recharts'
import { ShoppingBag, IndianRupee, Receipt, CheckCircle2, XCircle, ArrowRight, Users } from 'lucide-react'

export function DashboardView({ user }) {
  const { tenant } = useTenant()
  const { data } = useSWR('/admin/dashboard', fetcher, { refreshInterval: 15000 })
  const cur = tenant.currency
  if (!data) return <div className="text-sm text-muted-foreground">Loading dashboard…</div>
  const t = data.today
  const series = data.series.map((s) => ({ ...s, label: new Date(s.date).toLocaleDateString('en-IN', { weekday: 'short' }) }))

  return (
    <div>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`} subtitle={`Here is what is happening at ${tenant.business_name} today.`} />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <StatCard label="Today's orders" value={t.orders} icon={ShoppingBag} />
        <StatCard label="Today's revenue" value={money(t.revenue, cur)} icon={IndianRupee} tone="good" />
        <StatCard label="Avg order value" value={money(t.aov, cur)} icon={Receipt} />
        <StatCard label="Delivered today" value={t.delivered} icon={CheckCircle2} />
        <StatCard label="Cancelled / rejected" value={t.cancelled} icon={XCircle} tone={t.cancelled ? 'bad' : 'default'} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'New orders', value: data.live.new, cls: 'border-amber-200 bg-amber-50 text-amber-900', pulse: data.live.new > 0 },
          { label: 'In the kitchen', value: data.live.preparing, cls: 'border-blue-200 bg-blue-50 text-blue-900' },
          { label: 'Ready / on the way', value: data.live.ready, cls: 'border-violet-200 bg-violet-50 text-violet-900' },
        ].map((c) => (
          <Link key={c.label} href="/admin/orders" className={`rounded-xl border p-4 flex items-center justify-between ${c.cls} hover:opacity-90`}>
            <div><div className="text-xs font-medium opacity-80">{c.label}</div><div className="text-3xl font-bold">{c.value}</div></div>
            <ArrowRight className="h-5 w-5 opacity-60" />
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Revenue · last 7 days</h3><span className="text-xs text-muted-foreground">{money(series.reduce((s, x) => s + x.revenue, 0), cur)} total</span></div>
          <div className="h-56 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} formatter={(v, n) => [n === 'revenue' ? money(v, cur) : v, n === 'revenue' ? 'Revenue' : 'Orders']} labelFormatter={(l, p) => p?.[0]?.payload?.date || l} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="revenue" fill="var(--brand)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Top products · 30 days</h3>
          <div className="mt-3 space-y-3">
            {data.top_products.length === 0 && <div className="text-sm text-muted-foreground">No sales yet.</div>}
            {data.top_products.map((p, i) => (
              <div key={p.product_id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                {p.image ? <img src={p.image} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <div className="h-9 w-9 rounded-lg bg-muted" />}
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{p.name}</div><div className="text-xs text-muted-foreground">{p.qty} sold</div></div>
                <div className="text-sm font-semibold">{money(p.revenue, cur)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card">
          <div className="p-4 flex items-center justify-between"><h3 className="font-semibold">Recent orders</h3><Link href="/admin/orders" className="text-xs font-semibold text-brand">Open live board</Link></div>
          <div className="divide-y border-t">
            {data.recent_orders.map((o) => (
              <Link key={o.id} href="/admin/orders" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                <div className="w-16 text-sm font-semibold">#{o.order_number}</div>
                <div className="flex-1 min-w-0"><div className="text-sm truncate">{o.customer?.name || 'Guest'} <span className="text-muted-foreground">· {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span></div><div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5"><ModeChip mode={o.mode} />{timeAgo(o.created_at)}</div></div>
                <div className="text-sm font-semibold">{money(o.total, cur)}</div>
                <StatusBadge status={o.status} />
              </Link>
            ))}
            {data.recent_orders.length === 0 && <div className="p-6"><Empty title="No orders yet" subtitle="Orders will show up here as they come in." /></div>}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Customers</h3><Users className="h-4 w-4 text-muted-foreground" /></div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/60 p-3"><div className="text-xl font-bold">{data.customers.total}</div><div className="text-[11px] text-muted-foreground">Total</div></div>
            <div className="rounded-lg bg-muted/60 p-3"><div className="text-xl font-bold">{data.customers.new_30d}</div><div className="text-[11px] text-muted-foreground">New (30d)</div></div>
            <div className="rounded-lg bg-muted/60 p-3"><div className="text-xl font-bold">{data.customers.returning}</div><div className="text-[11px] text-muted-foreground">Returning</div></div>
          </div>
          <Link href="/admin/customers" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand">View CRM <ArrowRight className="h-3 w-3" /></Link>
        </div>
      </div>
    </div>
  )
}
