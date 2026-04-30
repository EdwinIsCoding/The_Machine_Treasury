'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import type { PaymentEvent, ComplianceEvent } from '@/lib/solana/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG = {
  0: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', label: 'SEV 0' },
  1: { bg: 'bg-blue-500/15',    border: 'border-blue-500/30',    text: 'text-blue-400',    label: 'SEV 1' },
  2: { bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   text: 'text-amber-400',   label: 'SEV 2' },
  3: { bg: 'bg-red-500/15',     border: 'border-red-500/30',     text: 'text-red-400',     label: 'SEV 3' },
} as const

const LAMPORTS_PER_SOL = 1_000_000_000

function formatLamports(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL
  if (sol >= 1) return `${sol.toFixed(3)} SOL`
  return `${(sol * 1000).toFixed(2)} mSOL`
}

function truncate(s: string, front = 4, back = 4): string {
  if (s.length <= front + back + 3) return s
  return `${s.slice(0, front)}…${s.slice(-back)}`
}

function relativeTime(ts: number): string {
  try { return formatDistanceToNow(ts, { addSuffix: true }) }
  catch { return '—' }
}

// ---------------------------------------------------------------------------
// Payment stream
// ---------------------------------------------------------------------------

function PaymentRow({ event, isNew }: { event: PaymentEvent; isNew: boolean }) {
  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-2.5 border-b border-[#1E2D3D] last:border-0',
      'transition-all duration-300',
      isNew && 'payment-entry',
    )}>
      {/* Timestamp */}
      <span className="text-[10px] font-mono text-[#475569] tabular-nums shrink-0 w-16">
        {relativeTime(event.timestamp)}
      </span>

      {/* Amount */}
      <span className="text-[11px] font-mono text-[#F8FAFC] tabular-nums font-semibold shrink-0">
        {formatLamports(event.lamports)}
      </span>

      {/* Provider */}
      <span className="text-[10px] font-mono text-[#64748B] truncate flex-1">
        {truncate(event.provider, 5, 4)}
      </span>

      {/* Tx link */}
      <a
        href={`https://explorer.solana.com/tx/${event.signature}?cluster=devnet`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#334155] hover:text-[#64748B] transition-colors shrink-0"
        aria-label="View transaction"
        onClick={e => e.stopPropagation()}
      >
        <ExternalLink size={10} />
      </a>
    </div>
  )
}

function PaymentStream({ payments }: { payments: PaymentEvent[] }) {
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const prevCountRef = useRef(payments.length)

  useEffect(() => {
    const prevCount = prevCountRef.current
    const currentCount = payments.length
    if (currentCount > prevCount) {
      const fresh = payments.slice(0, currentCount - prevCount).map(p => p.signature)
      setNewIds(new Set(fresh))
      const timer = setTimeout(() => setNewIds(new Set()), 600)
      prevCountRef.current = currentCount
      return () => clearTimeout(timer)
    }
    prevCountRef.current = currentCount
  }, [payments])

  const sorted = [...payments].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50)

  return (
    <div className="flex flex-col min-h-0">
      {/* Sub-header */}
      <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-widest text-[#475569]">
        Payment Stream
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 rounded-lg border border-[#1E2D3D] bg-[#111827]">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[11px] font-mono text-[#334155]">
            No payments yet
          </div>
        ) : (
          sorted.map(p => (
            <PaymentRow
              key={p.signature}
              event={p}
              isNew={newIds.has(p.signature)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compliance table
// ---------------------------------------------------------------------------

function ComplianceRow({ event }: { event: ComplianceEvent }) {
  const cfg = SEVERITY_CONFIG[event.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG[0]
  const isCritical = event.severity === 3

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-2.5 border-b border-[#1E2D3D] last:border-0',
      isCritical && 'border-l-2 border-l-red-500/70',
    )}>
      {/* Timestamp */}
      <span className="text-[10px] font-mono text-[#475569] tabular-nums shrink-0 w-16">
        {relativeTime(event.timestamp)}
      </span>

      {/* Severity badge */}
      <span className={cn(
        'shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wider border',
        cfg.bg, cfg.border, cfg.text,
      )}>
        {cfg.label}
      </span>

      {/* Reason code */}
      <span className="text-[10px] font-mono text-[#94A3B8] truncate flex-1">
        {event.reason_code}
      </span>

      {/* Tx hash */}
      <span className="text-[9px] font-mono text-[#334155] tabular-nums shrink-0">
        {truncate(event.signature, 4, 4)}
      </span>
    </div>
  )
}

function ComplianceTable({ events }: { events: ComplianceEvent[] }) {
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20)

  return (
    <div className="flex flex-col min-h-0">
      {/* Sub-header */}
      <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-widest text-[#475569]">
        Compliance Events
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 rounded-lg border border-[#1E2D3D] bg-[#111827]">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-[11px] font-mono text-[#334155]">
            No compliance events
          </div>
        ) : (
          sorted.map((e, i) => (
            <ComplianceRow key={`${e.signature}-${i}`} event={e} />
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface ActivityPanelProps {
  payments: PaymentEvent[]
  compliance: ComplianceEvent[]
}

export function ActivityPanel({ payments, compliance }: ActivityPanelProps) {
  return (
    <section className="flex flex-col gap-4 min-h-0 h-full">
      {/* Section label */}
      <div className="text-[10px] font-mono uppercase tracking-widest text-[#F59E0B] shrink-0">
        Live Activity
      </div>

      {/* Payment stream — takes ~60% height */}
      <div className="flex flex-col flex-[3] min-h-0">
        <PaymentStream payments={payments} />
      </div>

      {/* Divider */}
      <div className="h-px bg-[#1E2D3D] shrink-0" />

      {/* Compliance table — takes ~40% height */}
      <div className="flex flex-col flex-[2] min-h-0">
        <ComplianceTable events={compliance} />
      </div>
    </section>
  )
}
