'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Build phase data
// ---------------------------------------------------------------------------

interface Phase {
  tag: string
  title: string
  duration: string
  agent: string
  prompt: string
  files: string[]
}

const PHASES: Phase[] = [
  {
    tag: 'P0',
    title: 'Repo Bootstrap',
    duration: '10 min',
    agent: 'Claude Sonnet 4.6 via Cursor',
    prompt:
      'Bootstrap the machine-treasury repo. Next.js 14 App Router, TypeScript strict, Tailwind, shadcn/ui, Zustand. Install @solana/web3.js, @anthropic-ai/sdk, recharts. Create CLAUDE.md with full project context and design rules. Zero features — skeleton only.',
    files: [
      'package.json',
      'CLAUDE.md',
      '.env.local',
      'next.config.ts',
      'tailwind.config.ts',
      'src/app/globals.css',
    ],
  },
  {
    tag: 'P1',
    title: 'Solana Data Layer',
    duration: '30 min',
    agent: 'Claude Sonnet 4.6 via Cursor',
    prompt:
      'Build the Solana data layer with a mock fallback. Fetch ComputePaymentEvent and ComplianceEvent from Devnet. 3 s timeout then fall back to rich mock data. The demo must NEVER show a loading spinner for more than 3 seconds. Mock data tells a story: robot running normally, two critical anomalies in last 24 h.',
    files: [
      'src/lib/solana/connection.ts',
      'src/lib/solana/fetcher.ts',
      'src/lib/solana/types.ts',
      'src/lib/mock/generator.ts',
      'src/lib/data-source.ts',
      'src/store/wallet-store.ts',
    ],
  },
  {
    tag: 'P2',
    title: 'Treasury Agent',
    duration: '40 min',
    agent: 'Claude Sonnet 4.6 via Cursor',
    prompt:
      'Build the AI treasury reasoning engine. POST /api/treasury/analyze calls Claude Sonnet with a structured financial summary, returns TreasuryAnalysis JSON with prompt caching. Haiku scans for anomalies every 10 s. SSE streaming for the live summary. Heuristic fallback if API is down — demo must never show an error state.',
    files: [
      'src/app/api/treasury/analyze/route.ts',
      'src/app/api/treasury/scan/route.ts',
      'src/app/api/treasury/stream/route.ts',
      'src/lib/treasury/types.ts',
      'src/hooks/useTreasuryAnalysis.ts',
    ],
  },
  {
    tag: 'P3',
    title: 'Risk Scoring Engine',
    duration: '40 min',
    agent: 'Claude Sonnet 4.6 via Cursor',
    prompt:
      'Build the deterministic Machine Credit Score. Four weighted factors: financial health (30%), operational stability (25%), compliance record (25%), provider diversity (20%). Score runs on 24 h sliding windows for the 7-day trend. Pure math, no AI call — testable and explainable.',
    files: [
      'src/lib/risk/scorer.ts',
      'src/lib/risk/types.ts',
      'src/lib/risk/__tests__/scorer.test.ts',
    ],
  },
  {
    tag: 'P4',
    title: 'Dashboard UI + Specter Intelligence',
    duration: '75 min',
    agent: 'Claude Sonnet 4.6 via Cursor + ui-ux-pro-max skill',
    prompt:
      'Build the full fintech dashboard. Dark mode, 3-column layout. Left: Machine Credit Score gauge with grade and 7-day trend. Centre: AI Treasury streaming analysis with multi-model routing + Specter Provider Intelligence panel. Right: live payment stream with enriched provider names and compliance events. Production quality — judges are from OpenAI, Downing Street, Earlybird VC.',
    files: [
      'src/app/page.tsx',
      'src/components/dashboard/Header.tsx',
      'src/components/dashboard/RiskScorePanel.tsx',
      'src/components/dashboard/TreasuryPanel.tsx',
      'src/components/dashboard/ActivityPanel.tsx',
      'src/components/dashboard/SpecterPanel.tsx',
      'src/components/dashboard/BuildStoryModal.tsx',
      'src/app/api/specter/enrich/route.ts',
      'src/lib/specter/types.ts',
      'src/hooks/useSpecterIntel.ts',
    ],
  },
]

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const STATS = [
  { label: 'Build Time',       value: '3h 15m' },
  { label: 'Files Generated',  value: '24' },
  { label: 'Lines of Code',    value: '~2,800' },
  { label: 'Human Lines',      value: '0' },
  { label: 'Models Used',      value: 'Sonnet + Haiku' },
  { label: 'Cursor Sessions',  value: '7 runs' },
]

// ---------------------------------------------------------------------------
// Phase card
// ---------------------------------------------------------------------------

function PhaseCard({ phase, index }: { phase: Phase; index: number }) {
  const [filesOpen, setFilesOpen] = useState(false)

  return (
    <div
      className="relative pl-8 fade-in"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Timeline dot */}
      <div className="absolute left-0 top-1 flex flex-col items-center">
        <div className="h-2.5 w-2.5 rounded-full bg-[#F59E0B] border-2 border-[#0B1524]" />
        {index < PHASES.length - 1 && (
          <div className="flex-1 w-px bg-[#1E2D3D] mt-1" style={{ height: 'calc(100% + 0.75rem)' }} />
        )}
      </div>

      <div className="pb-6">
        {/* Card */}
        <div className="rounded-lg border border-[#1E2D3D] bg-[#0F1A2B] p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start gap-3 flex-wrap">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#F59E0B]/15 border border-[#F59E0B]/30 text-[#F59E0B] tracking-widest">
              {phase.tag}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-[#F8FAFC]">{phase.title}</span>
              <span className="ml-2 text-[11px] font-mono text-[#475569]">{phase.duration}</span>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 shrink-0">
              {phase.agent}
            </span>
          </div>

          {/* Prompt excerpt */}
          <div className="border-l-2 border-[#F59E0B]/30 bg-[#111827] rounded-r px-3 py-2">
            <p className="text-[11px] text-[#94A3B8] italic leading-relaxed">
              &ldquo;{phase.prompt}&rdquo;
            </p>
          </div>

          {/* Files toggle */}
          <div>
            <button
              onClick={() => setFilesOpen(v => !v)}
              className="text-[10px] font-mono text-[#475569] hover:text-[#94A3B8] transition-colors cursor-pointer"
            >
              {filesOpen ? '▾ Hide files' : '▸ Show files'} ({phase.files.length})
            </button>
            {filesOpen && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {phase.files.map(f => (
                  <span
                    key={f}
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#162032] text-[#64748B] border border-[#1E2D3D]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

interface BuildStoryModalProps {
  open: boolean
  onClose: () => void
}

export function BuildStoryModal({ open, onClose }: BuildStoryModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar bg-[#0B1524] border border-[#1E2D3D] rounded-xl shadow-2xl p-6 fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-[#475569] hover:text-[#94A3B8] transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-[#F8FAFC]">Built with Cursor</h2>
          <p className="text-[11px] font-mono text-[#475569] mt-0.5">
            A 3h 15m AI-native sprint — every line agent-generated
          </p>
        </div>

        {/* Timeline */}
        <div className="border-l-2 border-[#1E2D3D] ml-1 pl-0">
          {PHASES.map((phase, i) => (
            <PhaseCard key={phase.tag} phase={phase} index={i} />
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-[#1E2D3D] my-5" />

        {/* Stats grid */}
        <div
          className="grid grid-cols-3 gap-3 fade-in"
          style={{ animationDelay: `${PHASES.length * 80}ms` }}
        >
          {STATS.map(stat => (
            <div
              key={stat.label}
              className="rounded-lg border border-[#1E2D3D] bg-[#111827] p-3 text-center"
            >
              <div className="text-[9px] font-mono uppercase tracking-widest text-[#475569] mb-1">
                {stat.label}
              </div>
              <div className="text-sm font-semibold font-mono text-[#F8FAFC] tabular-nums">
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Footer branding */}
        <p className="text-center text-[9px] font-mono text-[#334155] mt-5">
          Built at Cursor × Briefcase FinTech London Hackathon, April 2026
        </p>
      </div>
    </div>
  )
}
