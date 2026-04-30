'use client'

import { useState } from 'react'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { DataSource } from '@/lib/data-source'

const LAMPORTS_PER_SOL = 1_000_000_000

interface HeaderProps {
  walletPubkey: string
  balance: number      // lamports
  dataSource: DataSource
  fetchedAt: number | null
  isLoading: boolean
  onRefresh: () => void
}

export function Header({ walletPubkey, balance, dataSource, fetchedAt, isLoading, onRefresh }: HeaderProps) {
  const [copied, setCopied] = useState(false)

  const sol = (balance / LAMPORTS_PER_SOL).toFixed(4)
  const truncated = walletPubkey
    ? `${walletPubkey.slice(0, 6)}…${walletPubkey.slice(-6)}`
    : 'No wallet configured'

  const copy = async () => {
    if (!walletPubkey) return
    await navigator.clipboard.writeText(walletPubkey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header className="h-14 flex items-center px-5 gap-6 border-b border-[#1E2D3D] bg-[#0B1524] shrink-0">

      {/* Left — logo + wallet */}
      <div className="flex items-center gap-4 min-w-0">
        {/* Logo mark */}
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <polygon points="9,1.5 16,5.25 16,12.75 9,16.5 2,12.75 2,5.25"
              stroke="#F59E0B" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
            <polygon points="9,5.5 12.5,7.5 12.5,11.5 9,13.5 5.5,11.5 5.5,7.5"
              fill="#F59E0B" opacity="0.25" />
          </svg>
          <span className="text-white font-semibold text-base tracking-tight">
            Machine Treasury
          </span>
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-[#334155]" />

        {/* Wallet address */}
        <div className="flex items-center gap-1.5 bg-[#162032] rounded-md px-2.5 py-1 border border-[#1E2D3D]">
          <span className="font-mono text-[11px] text-[#94A3B8] tabular-nums">{truncated}</span>
          <button
            onClick={copy}
            aria-label="Copy wallet address"
            className="text-[#475569] hover:text-[#94A3B8] transition-colors cursor-pointer"
          >
            {copied
              ? <Check size={11} className="text-[#22C55E]" />
              : <Copy size={11} />}
          </button>
        </div>
      </div>

      {/* Centre — data source indicator */}
      <div className="flex-1 flex justify-center">
        <div className={`flex items-center gap-2 rounded-full px-3.5 py-1 text-[11px] font-mono font-semibold tracking-widest uppercase border ${
          dataSource === 'devnet'
            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
            : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            dataSource === 'devnet'
              ? 'bg-emerald-400 animate-pulse'
              : 'bg-amber-400 animate-pulse'
          }`} />
          {dataSource === 'devnet' ? 'Devnet Live' : 'Mock Data'}
        </div>
      </div>

      {/* Right — balance + timestamp + refresh */}
      <div className="flex items-center gap-5">
        <div className="text-right">
          <div className="text-[10px] text-[#475569] font-mono uppercase tracking-widest">Balance</div>
          <div className="text-[#F8FAFC] font-mono text-sm font-semibold tabular-nums">
            {sol} <span className="text-[#64748B] text-[11px]">SOL</span>
          </div>
        </div>

        <div className="h-8 w-px bg-[#1E2D3D]" />

        <div className="text-right">
          <div className="text-[10px] text-[#475569] font-mono uppercase tracking-widest">Updated</div>
          <div className="text-[#64748B] font-mono text-[11px] tabular-nums">
            {fetchedAt
              ? formatDistanceToNow(fetchedAt, { addSuffix: true })
              : '—'}
          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Refresh data"
          className="flex items-center justify-center h-7 w-7 rounded-md border border-[#334155] text-[#475569] hover:text-[#94A3B8] hover:border-[#475569] transition-colors cursor-pointer disabled:opacity-40"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>
    </header>
  )
}
