'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts'
import { ScoreGauge, scoreColor } from './ScoreGauge'
import type { RiskReport } from '@/lib/risk/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BREAKDOWN_LABELS: Record<string, string> = {
  financial_health:      'Financial Health',
  operational_stability: 'Operational Stability',
  compliance_record:     'Compliance Record',
  provider_diversity:    'Provider Diversity',
}

const TREND_CONFIG = {
  improving: { Icon: TrendingUp,   color: '#22C55E', label: 'Improving' },
  stable:    { Icon: Minus,        color: '#94A3B8', label: 'Stable' },
  declining: { Icon: TrendingDown, color: '#EF4444', label: 'Declining' },
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BreakdownBar({
  label, score, weight,
}: { label: string; score: number; weight: number }) {
  const color = scoreColor(score)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#94A3B8]">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-[#CBD5E1] tabular-nums">
            {Math.round(score)}
          </span>
          <span className="text-[10px] text-[#475569] font-mono">
            {(weight * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-[#0F172A] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full score-bar-fill"
          style={{ width: `${score}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}50` }}
        />
      </div>
    </div>
  )
}

function SkeletonGauge() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="skeleton rounded-full h-[220px] w-[220px]" />
      <div className="space-y-2 w-full">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="space-y-1">
            <div className="skeleton h-3 rounded w-full" />
            <div className="skeleton h-1.5 rounded-full w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface RiskScorePanelProps {
  report: RiskReport | null
}

export function RiskScorePanel({ report }: RiskScorePanelProps) {
  if (!report) {
    return (
      <section className="flex flex-col gap-3">
        <PanelLabel>Machine Credit Score</PanelLabel>
        <SkeletonGauge />
      </section>
    )
  }

  const { overall_score, grade, breakdown, trend, trend_data } = report
  const trendCfg = TREND_CONFIG[trend]
  const gaugeColor = scoreColor(overall_score)

  const breakdownEntries = [
    { key: 'financial_health',      ...breakdown.financial_health },
    { key: 'operational_stability', ...breakdown.operational_stability },
    { key: 'compliance_record',     ...breakdown.compliance_record },
    { key: 'provider_diversity',    ...breakdown.provider_diversity },
  ]

  return (
    <section className="flex flex-col gap-4 fade-in">

      {/* Section label */}
      <PanelLabel>Machine Credit Score</PanelLabel>

      {/* Gauge */}
      <ScoreGauge score={overall_score} grade={grade} />

      {/* Breakdown bars */}
      <div className="space-y-3 px-1">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#475569] mb-2">
          Score Breakdown
        </div>
        {breakdownEntries.map(({ key, score, weight }) => (
          <BreakdownBar
            key={key}
            label={BREAKDOWN_LABELS[key] ?? key}
            score={score}
            weight={weight}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-[#1E2D3D]" />

      {/* 7-day trend sparkline */}
      <div className="space-y-2 px-1">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#475569]">
            7-Day Trend
          </div>
          <div className="flex items-center gap-1.5" style={{ color: trendCfg.color }}>
            <trendCfg.Icon size={12} />
            <span className="text-[11px] font-mono">{trendCfg.label}</span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={56}>
          <AreaChart data={trend_data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={gaugeColor} stopOpacity={0.35} />
                <stop offset="95%" stopColor={gaugeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="score"
              stroke={gaugeColor}
              strokeWidth={1.5}
              fill="url(#trendGrad)"
              dot={false}
              isAnimationActive
              animationDuration={1200}
              animationEasing="ease-out"
            />
            <Tooltip
              contentStyle={{
                background: '#1E293B',
                border: '1px solid #334155',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: '#F8FAFC',
              }}
              itemStyle={{ color: gaugeColor }}
              labelStyle={{ color: '#94A3B8' }}
              formatter={(v) => [v as number, 'Score']}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Date labels */}
        <div className="flex justify-between px-0.5">
          {[trend_data[0]?.date?.slice(5), trend_data[6]?.date?.slice(5)].map((d, i) => (
            <span key={i} className="text-[9px] font-mono text-[#475569]">{d}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-widest text-[#F59E0B]">
      {children}
    </div>
  )
}
