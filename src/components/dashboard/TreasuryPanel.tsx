'use client'

import { Sparkles, Flame, Clock, PieChart as PieIcon } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import type { TreasuryAnalysis, RecommendedAction } from '@/lib/treasury/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUDGET_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B']
const BUDGET_LABELS = ['Inference', 'Reserve', 'Buffer']

const PRIORITY_CONFIG = {
  low:      { bg: 'bg-slate-500/15', border: 'border-slate-500/30', text: 'text-slate-400', label: 'LOW' },
  medium:   { bg: 'bg-blue-500/15',  border: 'border-blue-500/30',  text: 'text-blue-400',  label: 'MED' },
  high:     { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', label: 'HIGH' },
  critical: { bg: 'bg-red-500/15',   border: 'border-red-500/30',   text: 'text-red-400',   label: 'CRIT' },
}

const RUNWAY_COLOR: Record<string, string> = {
  healthy:  '#22C55E',
  warning:  '#F59E0B',
  critical: '#EF4444',
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded', className)} />
}

function TreasurySkeleton() {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="space-y-2 p-4 rounded-lg border border-[#1E2D3D] bg-[#111827]">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-3 rounded-lg border border-[#1E2D3D] bg-[#111827] space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      {/* Actions */}
      {[1, 2].map(i => (
        <div key={i} className="p-3 rounded-lg border border-[#1E2D3D] bg-[#111827] space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  label, icon: Icon, children, className,
}: { label: string; icon: React.ElementType; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      'flex flex-col gap-1.5 p-3 rounded-lg border border-[#1E2D3D] bg-[#111827]',
      className
    )}>
      <div className="flex items-center gap-1.5 text-[#475569]">
        <Icon size={11} />
        <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
      </div>
      {children}
    </div>
  )
}

function ActionCard({ action }: { action: RecommendedAction }) {
  const cfg = PRIORITY_CONFIG[action.priority] ?? PRIORITY_CONFIG.medium
  const isCritical = action.priority === 'critical'

  return (
    <div className={cn(
      'p-3 rounded-lg border transition-all',
      cfg.bg, cfg.border,
      isCritical && 'critical-pulse',
    )}>
      <div className="flex items-start gap-2.5">
        <span className={cn(
          'mt-0.5 shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wider',
          cfg.bg, cfg.text,
        )}>
          {cfg.label}
        </span>
        <div className="space-y-0.5 min-w-0">
          <p className="text-xs text-[#F8FAFC] leading-snug">{action.action}</p>
          <p className="text-[11px] text-[#64748B] leading-snug">{action.reasoning}</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Budget donut
// ---------------------------------------------------------------------------

function BudgetDonut({ inference, reserve, buffer }: { inference: number; reserve: number; buffer: number }) {
  const data = [
    { name: BUDGET_LABELS[0], value: inference },
    { name: BUDGET_LABELS[1], value: reserve },
    { name: BUDGET_LABELS[2], value: buffer },
  ]
  return (
    <div className="flex items-center gap-3">
      <PieChart width={72} height={72}>
        <Pie
          data={data} cx={32} cy={32}
          innerRadius={20} outerRadius={32}
          startAngle={90} endAngle={-270}
          dataKey="value" strokeWidth={0}
          isAnimationActive
          animationDuration={900}
          animationEasing="ease-out"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={BUDGET_COLORS[i]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: '#1E293B',
            border: '1px solid #334155',
            borderRadius: '6px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: '#F8FAFC',
          }}
          formatter={(v) => [`${v as number}%`]}
        />
      </PieChart>
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: BUDGET_COLORS[i] }} />
            <span className="text-[10px] font-mono text-[#94A3B8]">{d.name}</span>
            <span className="text-[10px] font-mono text-[#CBD5E1] tabular-nums ml-auto pl-2">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface TreasuryPanelProps {
  analysis: TreasuryAnalysis | null
  isAnalyzing: boolean
}

export function TreasuryPanel({ analysis, isAnalyzing }: TreasuryPanelProps) {
  const loading = isAnalyzing && !analysis

  return (
    <section className="flex flex-col gap-4 fade-in min-w-0">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#F59E0B]">
          AI Treasury Analysis
        </div>
        {analysis && (
          <span className={cn(
            'text-[9px] font-mono px-2 py-0.5 rounded-full border',
            analysis.source === 'claude'
              ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
              : 'bg-slate-500/10 border-slate-500/30 text-slate-400',
          )}>
            {analysis.source === 'claude' ? 'Claude AI' : 'Heuristic'}
          </span>
        )}
      </div>

      {loading ? (
        <TreasurySkeleton />
      ) : analysis ? (
        <div className="flex flex-col gap-4 fade-in">

          {/* AI summary */}
          <div className="p-4 rounded-lg border border-[#1E2D3D] bg-[#111827]">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={13} className="text-[#F59E0B]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#F59E0B]">
                Treasury Summary
              </span>
            </div>
            <p className="text-[13px] text-[#CBD5E1] leading-relaxed">
              {analysis.summary}
            </p>

            {/* Anomaly flags */}
            {analysis.anomaly_flags.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#1E2D3D] space-y-1.5">
                {analysis.anomaly_flags.map((flag, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                    <span className="text-[#F87171]">{flag.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Three metric cards */}
          <div className="grid grid-cols-3 gap-3">
            {/* Burn rate */}
            <MetricCard label="Burn Rate" icon={Flame}>
              <div className="tabular-nums font-mono">
                <span className="text-lg font-semibold text-[#F8FAFC]">
                  {analysis.burn_rate_per_hour.toLocaleString()}
                </span>
                <span className="text-[10px] text-[#475569] ml-1">lam/h</span>
              </div>
            </MetricCard>

            {/* Runway */}
            <MetricCard label="Runway" icon={Clock}>
              <div className="tabular-nums font-mono">
                <span
                  className="text-lg font-semibold"
                  style={{ color: RUNWAY_COLOR[analysis.runway_status] ?? '#F8FAFC' }}
                >
                  {analysis.runway_hours > 999
                    ? '∞'
                    : analysis.runway_hours.toFixed(0)}
                </span>
                <span className="text-[10px] text-[#475569] ml-1">hrs</span>
              </div>
              <span className={cn(
                'text-[9px] font-mono uppercase tracking-wider',
                analysis.runway_status === 'healthy' ? 'text-emerald-400'
                  : analysis.runway_status === 'warning' ? 'text-amber-400'
                  : 'text-red-400',
              )}>
                {analysis.runway_status}
              </span>
            </MetricCard>

            {/* Budget donut */}
            <MetricCard label="Allocation" icon={PieIcon} className="col-span-1">
              <BudgetDonut
                inference={analysis.budget_allocation.inference}
                reserve={analysis.budget_allocation.reserve}
                buffer={analysis.budget_allocation.buffer}
              />
            </MetricCard>
          </div>

          {/* Recommended actions */}
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#475569]">
              Recommended Actions
            </div>
            {analysis.recommended_actions.slice(0, 5).map((action, i) => (
              <ActionCard key={i} action={action} />
            ))}
          </div>
        </div>
      ) : (
        <TreasurySkeleton />
      )}
    </section>
  )
}
