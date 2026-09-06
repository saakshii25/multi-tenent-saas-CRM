'use client'

import { useEffect, useState } from 'react'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from '@/components/ui/drawer'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { money } from '@/lib/client'
import { VegDot, Stepper } from './MenuView'

export function ProductSheet({ product, open, onClose, onAdd, currency }) {
  const [variant, setVariant] = useState(null)
  const [addons, setAddons] = useState([])
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (product) {
      setVariant(product.variants?.[0] || null)
      setAddons([])
      setQty(1)
      setNotes('')
    }
  }, [product])

  if (!product) return null
  const unit = (variant ? Number(variant.price) : Number(product.base_price)) + addons.reduce((s, a) => s + Number(a.price), 0)
  const toggleAddon = (a) => setAddons((cur) => (cur.some((x) => x.id === a.id) ? cur.filter((x) => x.id !== a.id) : [...cur, a]))

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[92vh]">
        <div className="mx-auto w-full max-w-lg flex flex-col min-h-0">
          <div className="overflow-y-auto min-h-0">
            {product.image && <img src={product.image} alt={product.name} className="h-44 w-full object-cover" />}
            <DrawerHeader className="text-left pb-2">
              <div className="flex items-center gap-2"><VegDot veg={product.is_veg} /><span className="text-xs text-muted-foreground">{product.prep_time_min ? `${product.prep_time_min} min` : ''}</span></div>
              <DrawerTitle className="text-lg">{product.name}</DrawerTitle>
              {product.description && <DrawerDescription>{product.description}</DrawerDescription>}
            </DrawerHeader>
            <div className="px-4 pb-4 space-y-5">
              {product.variants?.length > 0 && (
                <section>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Choose an option</h4>
                    <span className="text-[11px] font-medium text-brand bg-brand-soft rounded px-1.5 py-0.5">Required</span>
                  </div>
                  <RadioGroup value={variant?.id || ''} onValueChange={(id) => setVariant(product.variants.find((v) => v.id === id))} className="mt-2 gap-0">
                    {product.variants.map((v) => (
                      <label key={v.id} htmlFor={`v-${v.id}`} className="flex items-center justify-between py-2.5 border-b last:border-0 cursor-pointer">
                        <span className="flex items-center gap-3 text-sm"><RadioGroupItem value={v.id} id={`v-${v.id}`} />{v.name}</span>
                        <span className="text-sm font-medium">{money(v.price, currency)}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </section>
              )}
              {product.addons?.length > 0 && (
                <section>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Add-ons</h4>
                    <span className="text-[11px] text-muted-foreground">Optional</span>
                  </div>
                  <div className="mt-2">
                    {product.addons.map((a) => {
                      const on = addons.some((x) => x.id === a.id)
                      return (
                        <label key={a.id} htmlFor={`a-${a.id}`} className="flex items-center justify-between py-2.5 border-b last:border-0 cursor-pointer">
                          <span className="flex items-center gap-3 text-sm"><Checkbox id={`a-${a.id}`} checked={on} onCheckedChange={() => toggleAddon(a)} />{a.name}</span>
                          <span className="text-sm font-medium">{Number(a.price) ? `+ ${money(a.price, currency)}` : 'Free'}</span>
                        </label>
                      )
                    })}
                  </div>
                </section>
              )}
              <section>
                <h4 className="text-sm font-semibold">Special instructions</h4>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 200))} placeholder="e.g. less sugar, no onions" className="mt-2 min-h-[64px] resize-none" />
              </section>
            </div>
          </div>
          <DrawerFooter className="flex-row items-center gap-3 border-t bg-background">
            <Stepper qty={qty} size="lg" onInc={() => setQty((q) => Math.min(50, q + 1))} onDec={() => setQty((q) => Math.max(1, q - 1))} />
            <Button
              data-testid="sheet-add"
              className="flex-1 h-11 bg-brand text-brand-foreground hover:opacity-90 text-base font-bold"
              onClick={() => {
                onAdd(product, { variant, addons, qty, notes })
                onClose()
              }}
            >
              Add item · {money(unit * qty, currency)}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
