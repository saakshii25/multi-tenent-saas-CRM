'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useTenant } from '@/components/shared/TenantProvider'
import { fetcher, money, MODE_META } from '@/lib/client'
import { PageHeader, StatCard } from './ui'
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, CartesianGrid, YAxis } from 'recharts'

const RANGES = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days']]

export function ReportsView() {
  const { tenant } = useTenant()
  const [range, setRange] = useState('7d')
  const { data } = useSWR(`/admin/reports?range=${range}`, fetcher, { keepPreviousData: true })
  const cur = tenant.currency
  const t = data?.totals
  const series = (data?.series || []).map((s) => ({ ...s, label: new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }))

  return (
    <div>
      <PageHeader title="Reports" subtitle="Sales, items and customers for the selected period." actions={<div className="flex rounded-lg border bg-card p-0.5">{RANGES.map(([k, l]) => <button key={k} onClick={() => setRange(k)} className={`px-3 h-8 rounded-md text-xs font-semibold ${range === k ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>)}</div>} />
      {!t ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
            <StatCard label="Orders" value={t.orders} />
            <StatCard label="Revenue" value={money(t.revenue, cur)} tone="good" />
            <StatCard label="Avg order value" value={money(t.aov, cur)} />
            <StatCard label="Cancelled" value={t.cancelled} tone={t.cancelled ? 'warn' : 'default'} />
            <StatCard label="Rejected" value={t.rejected} tone={t.rejected ? 'bad' : 'default'} />
            <StatCard label="Avg fulfilment" value={t.avg_fulfilment_min != null ? `${t.avg_fulfilment_min} min` : '—'} hint="placed → delivered" />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border bg-card p-4">
              <h3 className="font-semibold">Daily revenue</h3>
              <div className="h-64 mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={series.length > 10 ? 4 : 0} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} formatter={(v, n) => [n === 'revenue' ? money(v, cur) : v, n === 'revenue' ? 'Revenue' : n === 'orders' ? 'Orders' : 'Cancelled']} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                    <Bar dataKey="revenue" fill="var(--brand)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-4">
                <h3 className="font-semibold">Payments</h3>
                <div className="mt-2 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Pay on delivery / counter</span><span className="font-medium">{t.payment.cod}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Online</span><span className="font-medium">{t.payment.online}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Failed</span><span className="font-medium">{t.payment.failed}</span></div>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <h3 className="font-semibold">Order types</h3>
                <div className="mt-2 space-y-1.5 text-sm">
                  {Object.entries(t.modes).length === 0 && <div className="text-muted-foreground">No orders in range.</div>}
                  {Object.entries(t.modes).sort((a, b) => b[1] - a[1]).map(([m, n]) => <div key={m} className="flex justify-between"><span className="text-muted-foreground">{MODE_META[m]?.label || m}</span><span className="font-medium">{n}</span></div>)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card">
              <div className="p-4 font-semibold">Top items</div>
              <div className="divide-y border-t">
                {data.top_items.length === 0 && <div className="p-4 text-sm text-muted-foreground">No sales in range.</div>}
                {data.top_items.map((it, i) => <div key={it.name} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className="w-4 text-xs font-bold text-muted-foreground">{i + 1}</span><span className="flex-1 truncate">{it.name}</span><span className="text-muted-foreground">{it.qty} sold</span><span className="font-semibold w-24 text-right">{money(it.revenue, cur)}</span></div>)}
              </div>
            </div>
            <div className="rounded-xl border bg-card">
              <div className="p-4 font-semibold">Top customers</div>
              <div className="divide-y border-t">
                {data.top_customers.length === 0 && <div className="p-4 text-sm text-muted-foreground">No customers in range.</div>}
                {data.top_customers.map((c, i) => <div key={c.customer_id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className="w-4 text-xs font-bold text-muted-foreground">{i + 1}</span><span className="flex-1 truncate">{c.name}<span className="text-muted-foreground text-xs"> · {c.phone}</span></span><span className="text-muted-foreground">{c.orders} orders</span><span className="font-semibold w-24 text-right">{money(c.spent, cur)}</span></div>)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
