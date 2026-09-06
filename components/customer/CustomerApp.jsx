'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { TenantProvider, useTenant, TenantLogo } from '@/components/shared/TenantProvider'
import { PreviewBar } from '@/components/shared/PreviewBar'
import { CartProvider, CustomerAuthProvider, useCart, useCustomer } from './store'
import { MenuView } from './MenuView'
import { CartView } from './CartView'
import { CheckoutView } from './CheckoutView'
import { OrdersView, OrderTrackingView } from './OrdersView'
import { AccountView } from './AccountView'
import { AuthSheet } from './AuthSheet'
import { money, api } from '@/lib/client'
import { ArrowLeft, ReceiptText, User, ShoppingBag, ChevronRight } from 'lucide-react'

const TITLES = { cart: ['Your cart', '/order'], checkout: ['Checkout', '/order/cart'], orders: ['Your orders', '/order'], account: ['Account', '/order'] }

function Header({ isMenu, title, back }) {
  const { tenant } = useTenant()
  const { customer } = useCustomer()
  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
      <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-3">
        {isMenu ? (
          <>
            <TenantLogo tenant={tenant} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate leading-tight">{tenant.business_name}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
                <span className={`h-1.5 w-1.5 rounded-full ${tenant.is_open ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                {tenant.is_open ? 'Open' : 'Closed'} · {tenant.opening_hours}
              </div>
            </div>
            <Link href="/order/orders" aria-label="Your orders" className="h-9 w-9 rounded-full hover:bg-muted flex items-center justify-center"><ReceiptText className="h-5 w-5" /></Link>
            <Link href="/order/account" aria-label="Account" className={`h-9 w-9 rounded-full flex items-center justify-center ${customer ? 'bg-brand-soft text-brand' : 'hover:bg-muted'}`}><User className="h-5 w-5" /></Link>
          </>
        ) : (
          <>
            <Link href={back} aria-label="Back" className="h-9 w-9 -ml-2 rounded-full hover:bg-muted flex items-center justify-center"><ArrowLeft className="h-5 w-5" /></Link>
            <div className="font-semibold flex-1 truncate">{title}</div>
            <span className="text-xs text-muted-foreground truncate max-w-[40%]">{tenant.business_name}</span>
          </>
        )}
      </div>
    </header>
  )
}

function CartBar() {
  const cart = useCart()
  const { tenant } = useTenant()
  if (!cart.hydrated || !cart.count) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 safe-bottom pointer-events-none">
      <Link href="/order/cart" className="pointer-events-auto mx-auto max-w-3xl flex items-center justify-between rounded-2xl bg-brand text-brand-foreground shadow-xl shadow-black/20 px-5 h-14">
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-5 w-5" />
          <div className="leading-tight">
            <div className="text-sm font-bold">{cart.count} item{cart.count > 1 ? 's' : ''}</div>
            <div className="text-xs opacity-80">{money(cart.subtotal, tenant.currency)} + taxes</div>
          </div>
        </div>
        <div className="flex items-center gap-1 font-bold text-sm">View cart <ChevronRight className="h-4 w-4" /></div>
      </Link>
    </div>
  )
}

function Shell() {
  const pathname = usePathname()
  const segs = pathname.replace(/^\/order\/?/, '').split('/').filter(Boolean)
  const isMenu = segs.length === 0

  useEffect(() => {
    api('/events', { method: 'POST', body: { event: 'PAGE_VIEW', props: { path: pathname } } }).catch(() => {})
  }, [pathname])

  let view
  let title = ''
  let back = '/order'
  if (isMenu) view = <MenuView />
  else if (segs[0] === 'cart') { view = <CartView />; [title, back] = TITLES.cart }
  else if (segs[0] === 'checkout') { view = <CheckoutView />; [title, back] = TITLES.checkout }
  else if (segs[0] === 'orders' && segs[1]) { view = <OrderTrackingView id={segs[1]} />; title = 'Order details'; back = '/order/orders' }
  else if (segs[0] === 'orders') { view = <OrdersView />; [title, back] = TITLES.orders }
  else if (segs[0] === 'account') { view = <AccountView />; [title, back] = TITLES.account }
  else view = <MenuView />

  return (
    <div className="min-h-screen bg-background">
      <PreviewBar />
      <Header isMenu={isMenu} title={title} back={back} />
      <main className="mx-auto max-w-3xl px-4 pb-32">{view}</main>
      {isMenu && <CartBar />}
      <AuthSheet />
    </div>
  )
}

function Inner() {
  const { tenant } = useTenant()
  return (
    <CartProvider tenant={tenant}>
      <CustomerAuthProvider>
        <Shell />
      </CustomerAuthProvider>
    </CartProvider>
  )
}

export default function CustomerApp() {
  return (
    <TenantProvider>
      <Inner />
    </TenantProvider>
  )
}
