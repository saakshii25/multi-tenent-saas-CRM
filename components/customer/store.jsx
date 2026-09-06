'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import useSWR from 'swr'
import { api, fetcher } from '@/lib/client'

// ---------------- Cart (client-side, persisted per tenant; server re-prices everything) ----------------
const CartCtx = createContext(null)
const EMPTY = { items: [], mode: null, table_number: '', room_number: '', coupon_code: '' }
const lineKey = (pid, vid, addonIds, notes) => `${pid}|${vid || ''}|${[...(addonIds || [])].sort().join(',')}|${(notes || '').trim()}`

export function CartProvider({ tenant, children }) {
  const storageKey = `wl_cart:${tenant.slug}`
  const [state, setState] = useState(EMPTY)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let saved = null
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) saved = JSON.parse(raw)
    } catch {}
    let next = { ...EMPTY, ...(saved || {}) }
    const params = new URLSearchParams(window.location.search)
    const table = params.get('table')
    const room = params.get('room')
    const modes = tenant.ordering_modes || []
    if (table && modes.includes('DINE_IN')) next = { ...next, mode: 'DINE_IN', table_number: table }
    if (room && modes.includes('ROOM_SERVICE')) next = { ...next, mode: 'ROOM_SERVICE', room_number: room }
    if (!next.mode || !modes.includes(next.mode)) next.mode = modes[0] || null
    setState(next)
    setHydrated(true)
  }, [storageKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {}
  }, [state, hydrated, storageKey])

  const addItem = useCallback((product, { variant = null, addons = [], qty = 1, notes = '' } = {}) => {
    const addon_ids = addons.map((a) => a.id)
    const key = lineKey(product.id, variant?.id, addon_ids, notes)
    const unit = (variant ? Number(variant.price) : Number(product.base_price)) + addons.reduce((s, a) => s + Number(a.price), 0)
    setState((s) => {
      const idx = s.items.findIndex((i) => i.key === key)
      if (idx >= 0) {
        const items = [...s.items]
        items[idx] = { ...items[idx], qty: Math.min(50, items[idx].qty + qty) }
        return { ...s, items }
      }
      return {
        ...s,
        items: [
          ...s.items,
          { key, product_id: product.id, name: product.name, image: product.image, is_veg: product.is_veg, variant_id: variant?.id || null, variant_name: variant?.name || null, addon_ids, addon_names: addons.map((a) => a.name), unit_price: unit, qty, notes: notes || '' },
        ],
      }
    })
    api('/events', { method: 'POST', body: { event: 'ADD_TO_CART', props: { product_id: product.id, qty } } }).catch(() => {})
  }, [])

  const updateQty = useCallback((key, qty) => {
    setState((s) => ({ ...s, items: qty <= 0 ? s.items.filter((i) => i.key !== key) : s.items.map((i) => (i.key === key ? { ...i, qty: Math.min(50, qty) } : i)) }))
  }, [])
  const removeItem = useCallback((key) => updateQty(key, 0), [updateQty])
  const clear = useCallback(() => setState((s) => ({ ...s, items: [], coupon_code: '' })), [])
  const patch = useCallback((p) => setState((s) => ({ ...s, ...p })), [])

  const count = state.items.reduce((s, i) => s + i.qty, 0)
  const subtotal = state.items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const qtyForProduct = (pid) => state.items.filter((i) => i.product_id === pid).reduce((s, i) => s + i.qty, 0)
  const linesForProduct = (pid) => state.items.filter((i) => i.product_id === pid)
  const apiItems = state.items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, addon_ids: i.addon_ids, qty: i.qty, notes: i.notes || null }))

  return <CartCtx.Provider value={{ ...state, hydrated, addItem, updateQty, removeItem, clear, patch, count, subtotal, qtyForProduct, linesForProduct, apiItems }}>{children}</CartCtx.Provider>
}
export const useCart = () => useContext(CartCtx)

// Server-priced quote for the current cart.
export function useQuote(cart) {
  const body = { items: cart.apiItems, mode: cart.mode, coupon_code: cart.coupon_code || null }
  const key = cart.hydrated && cart.items.length ? ['/checkout/quote', JSON.stringify(body)] : null
  const { data, error, isLoading, mutate } = useSWR(key, ([p, b]) => api(p, { method: 'POST', body: JSON.parse(b) }), { keepPreviousData: true, revalidateOnFocus: false })
  return { quote: data, error, loading: isLoading, refresh: mutate }
}

// ---------------- Customer auth ----------------
const AuthCtx = createContext(null)
export function CustomerAuthProvider({ children }) {
  const { data, mutate, isLoading } = useSWR('/auth/me', fetcher, { revalidateOnFocus: false })
  const [authReq, setAuthReq] = useState(null)
  const openAuth = useCallback((onSuccess) => setAuthReq({ onSuccess: onSuccess || null }), [])
  const closeAuth = useCallback(() => setAuthReq(null), [])
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' })
    mutate({ customer: null }, false)
  }, [mutate])
  return <AuthCtx.Provider value={{ customer: data?.customer || null, loading: isLoading && !data, refresh: mutate, openAuth, closeAuth, authReq, logout }}>{children}</AuthCtx.Provider>
}
export const useCustomer = () => useContext(AuthCtx)
