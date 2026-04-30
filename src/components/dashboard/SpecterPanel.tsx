'use client'

import { cn } from '@/lib/utils'
import type { ProviderIntel } from '@/lib/specter/types'

// ---------------------------------------------------------------------------
// Provider ordering — match mock data order
// ---------------------------------------------------------------------------

const PUBKEY_ORDER = [
  'Hoh7fqnGfuvpHzMhVEoP5K8qfcuVNSGFnJoLTBMLbdYw', // InferencePro
  'GPdnT3tRBm6RaMz1E4PKBYvY7RdtNvb1KEmRsLBJJrqA', // ComputeHub
  '2noknFMELsRzWaFhpBrqJnxXmvZsQn1gGNmLuE5RL7E9', // NeuralEdge
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFunding(usd: number | null, rounds: number | null): string {
  if (usd === null && rounds === null) return 'Bootstrapped'
  const parts: string[] = []
  if (usd !== null) {
    const millions = usd / 1_000_000
    parts.push(`$${millions >= 1 ? `${millions.toFixed(0)}m` : `${(usd / 1000).toFixed(0)}k`} raised`)
  }
  if (rounds !== null) parts.push(`${rounds} round${rounds !== 1 ? 's' : ''}`)
  return parts.join(' · ')
}

function reliabilityColor(score: number): string {
  if (score >= 80) return '#22C55E'
  if (score >= 50) return '#F59E0B'
  return '#EF4444'
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ProviderSkeleton() {
  return (
    <div className="p-3 rounded-lg border border-[#1E2D3D] bg-[#111827] space-y-2">
      <div className="skeleton h-3 w-32 rounded" />
      <div className="skeleton h-2.5 w-48 rounded" />
      <div className="skeleton h-2 w-full rounded" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single provider row
// ---------------------------------------------------------------------------

function ProviderCard({ intel }: { intel: ProviderIntel }) {
  const color = reliabilityColor(intel.reliability_score)
  const funding = formatFunding(intel.funding_total_usd, intel.funding_rounds)

  return (
    <div className="p-3 rounded-lg border border-[#1E2D3D] bg-[#111827] space-y-2">
      {/* Row 1: names */}
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-semibold text-[#F8FAFC]">{intel.display_name}</span>
        <span className="text-[10px] font-mono text-[#475569]">{intel.specter_name}</span>
      </div>

      {/* Row 2: location + headcount */}
      <div className="flex items-center gap-3 text-[10px] font-mono text-[#64748B]">
        {intel.hq_city && (
          <span>{intel.hq_city}, {intel.hq_country}</span>
        )}
        {intel.founded_year && (
          <span>Est. {intel.founded_year}</span>
        )}
        {intel.employee_count && (
          <span>{intel.employee_count}+ employees</span>
        )}
      </div>

      {/* Row 3: funding */}
      <div className="text-[10px] font-mono text-[#94A3B8]">{funding}</div>

      {/* Row 4: reliability bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-[#1E2D3D] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${intel.reliability_score}%`, background: color }}
          />
        </div>
        <span className="text-[9px] font-mono tabular-nums" style={{ color }}>
          {intel.reliability_score}/100
        </span>
      </div>

      {/* Row 5: tagline */}
      {intel.tagline && (
        <p className="text-[10px] text-[#475569] italic truncate">{intel.tagline}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface SpecterPanelProps {
  providers: Record<string, ProviderIntel> | null
  isLoading: boolean
  source: string | null
}

export function SpecterPanel({ providers, isLoading, source }: SpecterPanelProps) {
  const orderedProviders = PUBKEY_ORDER
    .map(pubkey => providers?.[pubkey] ?? null)
    .filter((p): p is ProviderIntel => p !== null)

  return (
    <section className="flex flex-col gap-3 fade-in min-w-0 mt-4">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#F59E0B]">
            Provider Intelligence
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'text-[9px] font-mono px-2 py-0.5 rounded-full border',
            source === 'specter'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : source === 'mock'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-slate-500/10 border-slate-500/30 text-slate-400',
          )}>
            {source === 'specter' ? 'Specter Live' : source === 'mock' ? 'Simulated' : 'Loading…'}
          </span>
          {/* Specter branding dot */}
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
          <span className="text-[9px] font-mono text-[#475569]">Specter</span>
        </div>
      </div>

      {/* Provider cards */}
      <div className="flex flex-col gap-2.5">
        {isLoading ? (
          <>
            <ProviderSkeleton />
            <ProviderSkeleton />
            <ProviderSkeleton />
          </>
        ) : orderedProviders.length > 0 ? (
          orderedProviders.map(intel => (
            <ProviderCard key={intel.pubkey} intel={intel} />
          ))
        ) : (
          // Fallback: show placeholders if providers is null
          <>
            <ProviderSkeleton />
            <ProviderSkeleton />
            <ProviderSkeleton />
          </>
        )}
      </div>
    </section>
  )
}
