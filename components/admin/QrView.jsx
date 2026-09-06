'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'
import { useTenant, TenantLogo } from '@/components/shared/TenantProvider'
import { api, fetcher } from '@/lib/client'
import { PageHeader, Field } from './ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Printer, Download, Save, Armchair, BedDouble, QrCode, Loader2, Smartphone } from 'lucide-react'

const PER_PAGE = { 4: 'print:grid-cols-2', 6: 'print:grid-cols-2', 9: 'print:grid-cols-3' }

function parseList(text) {
  return [...new Set(String(text || '').split(/[\n,]+/).map((s) => s.trim().slice(0, 20)).filter(Boolean))].slice(0, 500)
}
function rangeList(from, to) {
  const a = parseInt(from, 10)
  const b = parseInt(to, 10)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return []
  return Array.from({ length: Math.min(500, b - a + 1) }, (_, i) => String(a + i))
}

function downloadSvgAsPng(svgEl, filename, size = 1024) {
  if (!svgEl) return
  const xml = new XMLSerializer().serializeToString(svgEl)
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, 0, 0, size, size)
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = filename
    a.click()
  }
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
}

function QrCard({ tenant, kind, value, url, brand }) {
  const ref = useRef(null)
  const label = kind === 'table' ? `Table ${value}` : `Room ${value}`
  return (
    <div ref={ref} className="qr-card break-inside-avoid rounded-2xl border-2 bg-white p-5 flex flex-col items-center text-center" style={{ borderColor: brand }} data-testid={`qr-${kind}-${value}`}>
      <div className="flex items-center gap-2"><TenantLogo tenant={tenant} size="sm" /><span className="font-bold">{tenant.business_name}</span></div>
      <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Scan to order</div>
      <div className="mt-0.5 text-2xl font-extrabold leading-tight" style={{ color: brand }}>{label}</div>
      <div className="mt-3 rounded-xl border p-3 bg-white"><QRCodeSVG value={url} size={168} level="M" fgColor="#0f172a" bgColor="#ffffff" marginSize={0} /></div>
      <div className="mt-3 text-[10px] text-muted-foreground break-all leading-snug max-w-[220px]">{url.replace(/^https?:\/\//, '')}</div>
      <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Smartphone className="h-3 w-3" />Point your camera · no app needed</div>
      <button type="button" onClick={() => downloadSvgAsPng(ref.current?.querySelector('svg'), `${tenant.slug}-${kind}-${value}.png`)} className="print:hidden mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"><Download className="h-3.5 w-3.5" />PNG</button>
    </div>
  )
}

export function QrView() {
  const { tenant, domains, preview } = useTenant()
  const { data, mutate } = useSWR('/admin/settings', fetcher, { revalidateOnFocus: false })
  const modes = tenant.ordering_modes || []
  const kinds = [modes.includes('DINE_IN') && 'table', modes.includes('ROOM_SERVICE') && 'room'].filter(Boolean)
  const [kind, setKind] = useState(kinds[0] || 'table')
  const [from, setFrom] = useState('1')
  const [to, setTo] = useState('12')
  const [custom, setCustom] = useState('')
  const [items, setItems] = useState([])
  const [perPage, setPerPage] = useState('6')
  const [saving, setSaving] = useState(false)

  const verified = domains.filter((d) => d.verified && d.status === 'active')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const primary = verified.find((d) => d.is_primary) || verified[0]
  const options = useMemo(() => {
    const o = verified.map((d) => ({ value: `https://${d.domain}`, label: `${d.domain}${d.is_primary ? ' (primary)' : ''}` }))
    if (preview?.enabled && origin) o.push({ value: origin, label: `${origin.replace(/^https?:\/\//, '')} (preview host)` })
    return o
  }, [verified, preview, origin])
  const [base, setBase] = useState('')
  useEffect(() => {
    if (base) return
    if (preview?.enabled && origin) setBase(origin)
    else if (primary) setBase(`https://${primary.domain}`)
  }, [preview, origin, primary, base])

  // Load saved lists once
  const loadedRef = useRef(false)
  useEffect(() => {
    if (!data?.settings || loadedRef.current) return
    loadedRef.current = true
    const saved = data.settings.qr_settings || {}
    const list = kind === 'table' ? saved.tables : saved.rooms
    if (list?.length) setItems(list)
    else setItems(rangeList(from, to))
    if (saved.base_url) setBase(saved.base_url)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchKind = (k) => {
    setKind(k)
    const saved = data?.settings?.qr_settings || {}
    const list = k === 'table' ? saved.tables : saved.rooms
    setItems(list?.length ? list : k === 'room' ? rangeList('101', '112') : rangeList('1', '12'))
  }

  const brand = tenant.primary_color || '#1F6F5F'
  const urlFor = (v) => `${base || origin}/order?${kind}=${encodeURIComponent(v)}`

  const save = async () => {
    setSaving(true)
    try {
      const cur = data?.settings?.qr_settings || {}
      const next = { ...cur, base_url: base, [kind === 'table' ? 'tables' : 'rooms']: items }
      const r = await api('/admin/settings', { method: 'PATCH', body: { qr_settings: next } })
      mutate({ ...data, settings: r.settings }, false)
      toast.success('QR list saved')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!kinds.length) {
    return (
      <div>
        <PageHeader title="QR codes" />
        <div className="rounded-xl border border-dashed p-10 text-center"><QrCode className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-3 font-semibold">Enable Dine-in or Room service first</div><p className="mt-1 text-sm text-muted-foreground">QR ordering needs a table or room mode. Turn one on under Settings → Ordering.</p></div>
      </div>
    )
  }

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="QR codes"
          subtitle="Print table or room codes. Scanning opens your menu with the table or room pre-filled."
          actions={<><Button variant="outline" size="sm" onClick={save} disabled={saving} data-testid="qr-save">{saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Save list</Button><Button size="sm" onClick={() => window.print()} disabled={!items.length} className="bg-brand text-brand-foreground hover:opacity-90" data-testid="qr-print"><Printer className="h-4 w-4 mr-1" />Print {items.length || ''}</Button></>}
        />

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-xl border bg-card p-4 space-y-4 h-fit">
            {kinds.length > 1 && (
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted">
                {kinds.map((k) => <button key={k} onClick={() => switchKind(k)} data-testid={`qr-kind-${k}`} className={`h-9 rounded-md text-sm font-semibold inline-flex items-center justify-center gap-1.5 ${kind === k ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{k === 'table' ? <Armchair className="h-4 w-4" /> : <BedDouble className="h-4 w-4" />}{k === 'table' ? 'Tables' : 'Rooms'}</button>)}
              </div>
            )}
            <Field label="Menu link opens on" hint={preview?.enabled ? 'Use the preview host while testing; switch to your domain for real prints.' : ''}>
              <Select value={base} onValueChange={setBase}>
                <SelectTrigger data-testid="qr-base"><SelectValue placeholder="Choose domain" /></SelectTrigger>
                <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Generate a range</div>
              <div className="mt-1 flex items-center gap-2">
                <Input value={from} onChange={(e) => setFrom(e.target.value)} inputMode="numeric" className="h-9" data-testid="qr-from" /><span className="text-xs text-muted-foreground">to</span><Input value={to} onChange={(e) => setTo(e.target.value)} inputMode="numeric" className="h-9" data-testid="qr-to" />
                <Button variant="outline" size="sm" onClick={() => setItems(rangeList(from, to))} data-testid="qr-generate">Go</Button>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Or add custom labels</div>
              <Textarea value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={kind === 'table' ? 'Patio 1, Patio 2, Bar 3' : '101, 102, Suite A'} className="mt-1 min-h-[64px] resize-none" />
              <Button variant="outline" size="sm" className="mt-2" disabled={!custom.trim()} onClick={() => { setItems((cur) => [...new Set([...cur, ...parseList(custom)])].slice(0, 500)); setCustom('') }}>Add to list</Button>
            </div>
            <Field label="Cards per printed page">
              <Select value={perPage} onValueChange={setPerPage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="4">4 (large)</SelectItem><SelectItem value="6">6 (medium)</SelectItem><SelectItem value="9">9 (small)</SelectItem></SelectContent>
              </Select>
            </Field>
            <div className="text-xs text-muted-foreground">{items.length} code{items.length === 1 ? '' : 's'} · <button className="underline" onClick={() => setItems([])}>clear</button></div>
            {items.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {items.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">{v}<button onClick={() => setItems(items.filter((x) => x !== v))} className="text-muted-foreground hover:text-destructive">×</button></span>)}
              </div>
            )}
          </aside>

          <div className="print:hidden rounded-xl border bg-card p-4">
            <div className="text-sm font-semibold">Preview</div>
            <p className="text-xs text-muted-foreground">Cards are printed in your brand colour. Each links to <code className="rounded bg-muted px-1">{(base || origin).replace(/^https?:\/\//, '')}/order?{kind}=…</code></p>
            <div className={`mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`}>
              {items.slice(0, 60).map((v) => <QrCard key={v} tenant={tenant} kind={kind} value={v} url={urlFor(v)} brand={brand} />)}
            </div>
            {items.length > 60 && <p className="mt-3 text-xs text-muted-foreground">Showing the first 60 in preview; all {items.length} print.</p>}
            {!items.length && <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Generate a range or add labels to see your codes.</div>}
          </div>
        </div>
      </div>

      {/* Print-only layout */}
      <div className={`hidden print:grid gap-4 ${PER_PAGE[perPage] || 'print:grid-cols-2'}`}>
        {items.map((v) => <QrCard key={v} tenant={tenant} kind={kind} value={v} url={urlFor(v)} brand={brand} />)}
      </div>
    </div>
  )
}
