'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { TenantProvider, useTenant, TenantLogo } from '@/components/shared/TenantProvider'
import { PreviewBar } from '@/components/shared/PreviewBar'
import { api, fetcher, money } from '@/lib/client'
import { beep, ROLE_LABEL } from './ui'
import { LoginView } from './LoginView'
import { DashboardView } from './DashboardView'
import { OrdersView } from './OrdersView'
import { MenuView } from './MenuView'
import { CustomersView } from './CustomersView'
import { CouponsView } from './CouponsView'
import { ReportsView } from './ReportsView'
import { SettingsView } from './SettingsView'
import { QrView } from './QrView'
import { KitchenDisplay } from './KitchenDisplay'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LayoutDashboard, ClipboardList, UtensilsCrossed, Users, Tag, BarChart3, Settings, ExternalLink, LogOut, Bell, Volume2, VolumeX, ChevronDown, MonitorPlay, QrCode } from 'lucide-react'

// ---------- Live orders feed shared across admin pages ----------
const FeedCtx = createContext(null)
export const useOrdersFeed = () => useContext(FeedCtx)

function OrdersFeedProvider({ children }) {
  const { tenant } = useTenant()
  const router = useRouter()
  const { data, error, mutate } = useSWR('/admin/orders?scope=board', fetcher, { refreshInterval: 5000, dedupingInterval: 1500 })
  const known = useRef(null)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    if (!data?.orders) return
    const ids = new Set(data.orders.map((o) => o.id))
    if (known.current) {
      const fresh = data.orders.filter((o) => o.status === 'ORDER_PLACED' && !known.current.has(o.id))
      if (fresh.length) {
        if (!muted) beep()
        fresh.forEach((o) =>
          toast(`New order #${o.order_number} · ${money(o.total, tenant.currency)}`, {
            description: o.items.map((i) => `${i.qty}× ${i.name}`).join(', '),
            duration: 8000,
            action: { label: 'View', onClick: () => router.push('/admin/orders') },
          })
        )
      }
    }
    known.current = ids
  }, [data, muted, router, tenant.currency])

  const newCount = data?.counts?.ORDER_PLACED || 0
  useEffect(() => {
    document.title = newCount ? `(${newCount}) New orders · ${tenant.business_name}` : `Admin · ${tenant.business_name}`
  }, [newCount, tenant.business_name])

  return (
    <FeedCtx.Provider value={{ orders: data?.orders || [], counts: data?.counts || {}, rejectionReasons: data?.rejection_reasons || [], refresh: mutate, loading: !data && !error, error, muted, setMuted, newCount }}>
      {children}
    </FeedCtx.Provider>
  )
}

const NAV = [
  { href: '/admin', key: '', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'manager', 'kitchen'] },
  { href: '/admin/orders', key: 'orders', label: 'Live orders', icon: ClipboardList, roles: ['owner', 'manager', 'kitchen', 'delivery'] },
  { href: '/admin/kds', key: 'kds', label: 'Kitchen display', icon: MonitorPlay, roles: ['owner', 'manager', 'kitchen'] },
  { href: '/admin/menu', key: 'menu', label: 'Menu', icon: UtensilsCrossed, roles: ['owner', 'manager', 'kitchen'] },
  { href: '/admin/customers', key: 'customers', label: 'Customers', icon: Users, roles: ['owner', 'manager', 'kitchen'] },
  { href: '/admin/coupons', key: 'coupons', label: 'Coupons', icon: Tag, roles: ['owner', 'manager'] },
  { href: '/admin/qr', key: 'qr', label: 'QR codes', icon: QrCode, roles: ['owner', 'manager'] },
  { href: '/admin/reports', key: 'reports', label: 'Reports', icon: BarChart3, roles: ['owner', 'manager'] },
  { href: '/admin/settings', key: 'settings', label: 'Settings', icon: Settings, roles: ['owner', 'manager'] },
]

function Shell({ user, onLogout }) {
  const { tenant } = useTenant()
  const pathname = usePathname()
  const feed = useOrdersFeed()
  const seg = pathname.replace(/^\/admin\/?/, '').split('/')[0] || ''
  const allowed = NAV.filter((n) => n.roles.includes(user.role))
  const current = allowed.find((n) => n.key === seg) || allowed[0]

  let view
  const key = allowed.some((n) => n.key === seg) ? seg : allowed[0].key
  // Kitchen display is a full-screen surface without the admin chrome.
  if (key === 'kds') return <KitchenDisplay user={user} />
  if (key === '') view = <DashboardView user={user} />
  else if (key === 'orders') view = <OrdersView user={user} />
  else if (key === 'menu') view = <MenuView user={user} />
  else if (key === 'customers') view = <CustomersView user={user} />
  else if (key === 'coupons') view = <CouponsView user={user} />
  else if (key === 'qr') view = <QrView user={user} />
  else if (key === 'reports') view = <ReportsView user={user} />
  else if (key === 'settings') view = <SettingsView user={user} />

  const NavLink = ({ n, mobile }) => {
    const active = n.key === key
    const Icon = n.icon
    const badge = n.key === 'orders' && feed.newCount ? feed.newCount : null
    if (mobile) {
      return (
        <Link href={n.href} className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-14 text-[10px] font-medium ${active ? 'text-brand' : 'text-muted-foreground'}`}>
          <Icon className="h-5 w-5" />{n.label.replace('Live ', '')}
          {badge && <span className="absolute top-1.5 right-1/2 translate-x-4 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{badge}</span>}
        </Link>
      )
    }
    return (
      <Link href={n.href} className={`flex items-center gap-3 rounded-lg px-3 h-10 text-sm font-medium transition ${active ? 'bg-sidebar-accent text-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent/60'}`}>
        <Icon className={`h-4 w-4 ${active ? 'text-brand' : ''}`} />
        <span className="flex-1">{n.label}</span>
        {badge && <span className={`min-w-[22px] h-[22px] rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center px-1.5 ${active ? '' : 'new-order-pulse'}`}>{badge}</span>}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PreviewBar />
      <div className="flex">
        <aside className="print:hidden hidden lg:flex w-60 shrink-0 flex-col border-r bg-sidebar sticky top-0 h-screen">
          <div className="h-16 px-4 flex items-center gap-3 border-b">
            <TenantLogo tenant={tenant} size="sm" />
            <div className="min-w-0"><div className="font-bold truncate leading-tight">{tenant.business_name}</div><div className="text-[11px] text-muted-foreground">Merchant admin</div></div>
          </div>
          <nav className="p-3 space-y-1 flex-1">{allowed.map((n) => <NavLink key={n.key} n={n} />)}</nav>
          <div className="p-3 border-t">
            <a href="/order" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-3 h-9"><ExternalLink className="h-3.5 w-3.5" />Open storefront</a>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="print:hidden sticky top-0 z-20 h-14 lg:h-16 border-b bg-white/90 backdrop-blur flex items-center px-4 gap-3">
            <div className="lg:hidden flex items-center gap-2 min-w-0"><TenantLogo tenant={tenant} size="sm" /><span className="font-bold truncate">{tenant.business_name}</span></div>
            <div className="hidden lg:block font-semibold">{current?.label}</div>
            <div className="flex-1" />
            <div className={`hidden sm:flex items-center gap-1.5 text-xs ${feed.error ? 'text-rose-600' : 'text-emerald-700'}`}>
              <span className={`h-2 w-2 rounded-full ${feed.error ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`} />{feed.error ? 'Reconnecting…' : 'Live'}
            </div>
            <button onClick={() => feed.setMuted(!feed.muted)} className="h-9 w-9 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground" title={feed.muted ? 'Unmute new order sound' : 'Mute new order sound'}>
              {feed.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <Link href="/admin/orders" className="relative h-9 w-9 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground" title="New orders">
              <Bell className="h-4 w-4" />
              {feed.newCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{feed.newCount}</span>}
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg border px-2.5 h-9 text-sm hover:bg-muted">
                  <span className="h-6 w-6 rounded-full bg-brand text-brand-foreground text-xs font-bold flex items-center justify-center">{(user.name || 'U')[0].toUpperCase()}</span>
                  <span className="hidden sm:inline font-medium max-w-[120px] truncate">{user.name}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel><div className="font-semibold">{user.name}</div><div className="text-xs text-muted-foreground font-normal">{user.email} · {ROLE_LABEL[user.role]}</div></DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allowed.filter((n) => ['kds', 'coupons', 'qr', 'settings', 'reports'].includes(n.key)).map((n) => (
                  <DropdownMenuItem key={n.key} asChild className="lg:hidden"><Link href={n.href}><n.icon className="h-4 w-4 mr-2" />{n.label}</Link></DropdownMenuItem>
                ))}
                <DropdownMenuItem asChild><a href="/order" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-2" />Open storefront</a></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-destructive"><LogOut className="h-4 w-4 mr-2" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main className="p-4 lg:p-6 pb-24 lg:pb-8 max-w-[1400px] print:p-0 print:max-w-none">{view}</main>
        </div>
      </div>

      <nav className="print:hidden lg:hidden fixed bottom-0 inset-x-0 z-20 border-t bg-white flex safe-bottom">
        {allowed.filter((n) => ['', 'orders', 'menu', 'customers', 'reports'].includes(n.key)).slice(0, 5).map((n) => <NavLink key={n.key} n={n} mobile />)}
      </nav>
    </div>
  )
}

function AdminInner() {
  const { data, isLoading, mutate } = useSWR('/admin/auth/me', fetcher, { revalidateOnFocus: false })
  const user = data?.user
  if (isLoading && !data) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
  if (!user) return <LoginView onLogin={(u) => mutate({ user: u }, false)} />
  const logout = async () => {
    await api('/admin/auth/logout', { method: 'POST' })
    mutate({ user: null }, false)
  }
  return (
    <OrdersFeedProvider>
      <Shell user={user} onLogout={logout} />
    </OrdersFeedProvider>
  )
}

export default function AdminApp() {
  return (
    <TenantProvider>
      <AdminInner />
    </TenantProvider>
  )
}
