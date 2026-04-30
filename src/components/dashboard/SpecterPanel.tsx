'use client'

import { cn } from '@/lib/utils'
import type { ProviderIntel } from '@/lib/specter/types'

// ---------------------------------------------------------------------------
// Provider ordering — match mock data order
// ---------------------------------------------------------------------------

const PUBKEY_ORDER = [
  'Hoh7fqnGfuvpHzMhVEoP5K8qfcuVNSGFnJoLTBMLbdYw', // Replicate
  'GPdnT3tRBm6RaMz1E4PKBYvY7RdtNvb1KEmRsLBJJrqA', // Together AI
  '2noknFMELsRzWaFhpBrqJnxXmvZsQn1gGNmLuE5RL7E9', // Perplexity
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COUNTRY_SHORT: Record<string, string> = {
  'United States': 'US', 'United Kingdom': 'UK', 'Germany': 'DE',
  'France': 'FR', 'Canada': 'CA', 'Australia': 'AU', 'India': 'IN',
  'Singapore': 'SG', 'Netherlands': 'NL', 'Sweden': 'SE',
}

function shortCountry(country: string): string {
  return COUNTRY_SHORT[country] ?? country
}

function formatFunding(usd: number | null, rounds: number | null): string {
  if (usd === null && rounds === null) return 'Bootstrapped'
  const parts: string[] = []
  if (usd !== null) {
    const millions = usd / 1_000_000
    parts.push(`$${millions >= 1000 ? `${(millions / 1000).toFixed(1)}b` : millions >= 1 ? `${millions.toFixed(0)}m` : `${(usd / 1000).toFixed(0)}k`} raised`)
  }
  if (rounds !== null) parts.push(`${rounds} round${rounds !== 1 ? 's' : ''}`)
  return parts.join(' · ')
}

function reliabilityColor(score: number): string {
  if (score >= 80) return '#22C55E'
  if (score >= 50) return '#F59E0B'
  return '#EF4444'
}

function statusBadge(status: string | null): { label: string; color: string } | null {
  if (!status || status === 'active') return null
  if (status === 'acquired') return { label: 'Acquired', color: '#8B5CF6' }
  if (status === 'closed') return { label: 'Closed', color: '#EF4444' }
  if (status === 'ipo') return { label: 'Public', color: '#06B6D4' }
  return { label: status, color: '#64748B' }
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

function ProviderCard({ intel, spendPct }: { intel: ProviderIntel; spendPct: number | null }) {
  const color = reliabilityColor(intel.reliability_score)
  const funding = formatFunding(intel.funding_total_usd, intel.funding_rounds)
  const badge = statusBadge(intel.operating_status)
  const showHeadcount = intel.employee_count !== null && intel.employee_count > 10

  // Risk flag: low-viability provider with high spend concentration
  const isConcentrationRisk =
    spendPct !== null && spendPct >= 40 && intel.reliability_score < 80

  return (
    <div className={cn(
      'p-3 rounded-lg border bg-[#111827] space-y-2 transition-colors',
      isConcentrationRisk
        ? 'border-amber-500/40 border-l-2 border-l-amber-500'
        : 'border-[#1E2D3D]',
    )}>
      {/* Row 1: names + status badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[12px] font-semibold text-[#F8FAFC]">{intel.display_name}</span>
          {intel.specter_name && intel.specter_name !== intel.display_name && (
            <span className="text-[10px] font-mono text-[#475569] truncate">{intel.specter_name}</span>
          )}
        </div>
        {badge && (
          <span
            className="text-[8px] font-mono px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: `${badge.color}20`, color: badge.color, border: `1px solid ${badge.color}40` }}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* Row 2: location + headcount + spend share */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[10px] font-mono text-[#64748B]">
          {intel.hq_city && (
            <span>{intel.hq_city}, {shortCountry(intel.hq_country)}</span>
          )}
          {intel.founded_year && (
            <span>Est. {intel.founded_year}</span>
          )}
          {showHeadcount && (
            <span>{intel.employee_count?.toLocaleString()} emp.</span>
          )}
        </div>
        {/* Spend concentration from payment history */}
        {spendPct !== null && (
          <span className={cn(
            'text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded flex-shrink-0',
            isConcentrationRisk
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-[#1E2D3D] text-[#64748B]',
          )}>
            {spendPct}% of spend
          </span>
        )}
      </div>

      {/* Row 3: funding */}
      <div className="text-[10px] font-mono text-[#94A3B8]">{funding}</div>

      {/* Row 4: provider viability bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono uppercase tracking-wider text-[#334155]">
            Provider Viability
          </span>
          <span className="text-[9px] font-mono tabular-nums" style={{ color }}>
            {intel.reliability_score} / 100
          </span>
        </div>
        <div className="h-1 rounded-full bg-[#1E2D3D] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${intel.reliability_score}%`, background: color }}
          />
        </div>
      </div>

      {/* Row 5: tagline */}
      {intel.tagline && (
        <p className="text-[10px] text-[#475569] italic truncate">{intel.tagline}</p>
      )}

      {/* Concentration risk callout */}
      {isConcentrationRisk && (
        <p className="text-[9px] font-mono text-amber-500/80 leading-tight">
          ⚠ High spend concentration on acquired provider — treasury exposure
        </p>
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
  /** Spend concentration per provider pubkey (% of total lamports), from payment history */
  spendByPubkey?: Record<string, number>
}

export function SpecterPanel({ providers, isLoading, source, spendByPubkey = {} }: SpecterPanelProps) {
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
            <ProviderCard
              key={intel.pubkey}
              intel={intel}
              spendPct={spendByPubkey[intel.pubkey] ?? null}
            />
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
