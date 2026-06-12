'use client'

import { useActionState, useEffect, useRef } from 'react'
import {
  addBrandAssetAction,
  deleteBrandAssetAction,
  type BrandAssetState,
} from './brandAssetActions'
import { labelCls, fieldCls, btnPrimary } from '@/components/ui'

export type BrandAsset = {
  id: string
  kind: string
  label: string | null
  value: string | null
  notes: string | null
}

const initial: BrandAssetState = { error: null, ok: false }

const KIND_LABEL: Record<string, string> = {
  logo: 'Logo', colour: 'Colour', font: 'Font', guideline: 'Guideline', other: 'Other',
}

function isUrl(v: string) {
  return /^https?:\/\//i.test(v)
}

function ValueCell({ kind, value }: { kind: string; value: string | null }) {
  if (!value) return <span className="text-[#9398A1]">—</span>
  if (kind === 'colour') {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="w-4 h-4 rounded border border-[#ECECEE]" style={{ background: value }} />
        <span>{value}</span>
      </span>
    )
  }
  if (isUrl(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="text-[#3B82F6] hover:underline break-all">
        {value}
      </a>
    )
  }
  return <span className="break-all">{value}</span>
}

function AddBrandAssetForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(addBrandAssetAction, initial)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])

  return (
    <form ref={ref} action={action} className="border border-[#ECECEE] rounded-2xl bg-white p-5">
      <div className="text-sm font-semibold mb-4">Add brand asset</div>
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Kind</label>
          <select name="kind" defaultValue="logo" className={fieldCls}>
            <option value="logo">Logo</option>
            <option value="colour">Colour</option>
            <option value="font">Font</option>
            <option value="guideline">Guideline</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Label</label>
          <input name="label" className={fieldCls} placeholder="Primary logo" />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Value</label>
          <input name="value" className={fieldCls} placeholder="https://…  ·  #15171C  ·  Inter" />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Notes</label>
          <textarea name="notes" rows={2} className={fieldCls} />
        </div>
      </div>
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className={btnPrimary}
        >
          {pending ? 'Adding…' : 'Add asset'}
        </button>
      </div>
    </form>
  )
}

function DeleteBrandAssetButton({ assetId, clientId }: { assetId: string; clientId: string }) {
  const [state, action, pending] = useActionState(deleteBrandAssetAction, initial)
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm('Delete this brand asset?')) e.preventDefault() }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="asset_id" value={assetId} />
      <button type="submit" disabled={pending} className="text-sm text-[#E0572E] hover:underline disabled:opacity-50">
        Delete
      </button>
      {state.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
    </form>
  )
}

function AssetRow({ asset, clientId }: { asset: BrandAsset; clientId: string }) {
  return (
    <div className="px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold flex items-center gap-2">
          <span className="text-[11px] text-[#5A5E66] border border-[#ECECEE] rounded-full px-2 py-0.5">
            {KIND_LABEL[asset.kind] ?? asset.kind}
          </span>
          {asset.label ?? <span className="text-[#9398A1] font-normal">No label</span>}
        </div>
        <div className="text-xs text-[#5A5E66] mt-1">
          <ValueCell kind={asset.kind} value={asset.value} />
        </div>
        {asset.notes && <div className="text-xs text-[#9398A1] mt-1">{asset.notes}</div>}
      </div>
      <div className="shrink-0">
        <DeleteBrandAssetButton assetId={asset.id} clientId={clientId} />
      </div>
    </div>
  )
}

export default function BrandAssetsSection({ clientId, assets }: { clientId: string; assets: BrandAsset[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-lg font-bold">Brand assets</div>
        <div className="text-sm text-[#5A5E66]">{assets.length} {assets.length === 1 ? 'asset' : 'assets'}</div>
      </div>

      {assets.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-10 text-center text-sm text-[#5A5E66]">
          No brand assets yet.
        </div>
      ) : (
        <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
          {assets.map((a) => <AssetRow key={a.id} asset={a} clientId={clientId} />)}
        </div>
      )}

      <AddBrandAssetForm clientId={clientId} />
    </div>
  )
}
