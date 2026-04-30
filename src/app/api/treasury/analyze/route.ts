/**
 * POST /api/treasury/analyze
 *
 * Receives wallet data, calls Claude to produce a TreasuryAnalysis JSON.
 * Falls back to heuristic computation if the API key is absent or the call fails.
 * Caches the result for 30 seconds so repeated renders don't hammer the API.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { PaymentEvent, ComplianceEvent } from '@/lib/solana/types'
import type { ProviderIntel } from '@/lib/specter/types'
import type {
  TreasuryAnalysis,
  RecommendedAction,
  AnomalyFlag,
  RunwayStatus,
} from '@/lib/treasury/types'

// ---------------------------------------------------------------------------
// In-process cache (30 s TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  analysis: TreasuryAnalysis
  expiresAt: number
}

const _cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30_000

function cacheKey(balance: number, txCount: number): string {
  return `${balance}:${txCount}`
}

// ---------------------------------------------------------------------------
// Request body type
// ---------------------------------------------------------------------------

interface AnalyzeRequest {
  paymentHistory: PaymentEvent[]
  complianceHistory: ComplianceEvent[]
  balance: number   // lamports
  txCount: number
  providerIntel?: Record<string, ProviderIntel>
}

// ---------------------------------------------------------------------------
// Financial summary builder — what we actually send to Claude
// ---------------------------------------------------------------------------

const LAMPORTS_PER_SOL = 1_000_000_000

const PROVIDER_MAP: Record<string, string> = {
  'Hoh7fqnGfuvpHzMhVEoP5K8qfcuVNSGFnJoLTBMLbdYw': 'InferencePro',
  'GPdnT3tRBm6RaMz1E4PKBYvY7RdtNvb1KEmRsLBJJrqA': 'ComputeHub',
  '2noknFMELsRzWaFhpBrqJnxXmvZsQn1gGNmLuE5RL7E9': 'NeuralEdge',
}

function buildFinancialSummary(data: AnalyzeRequest): string {
  const { paymentHistory, complianceHistory, balance, txCount, providerIntel } = data
  const now = Date.now()
  const MS = { hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000 }

  const last24h = paymentHistory.filter(p => p.timestamp > now - MS.day)
  const last7d = paymentHistory.filter(p => p.timestamp > now - MS.week)

  const sum = (arr: PaymentEvent[]) => arr.reduce((s, p) => s + p.lamports, 0)

  const spent24h = sum(last24h)
  const spent7d = sum(last7d)
  const burnRate24h = spent24h / 24      // lamports/hour
  const burnRate7d = spent7d / (7 * 24)  // lamports/hour (baseline)

  // Provider breakdown (last 24h)
  const providerCounts: Record<string, number> = {}
  for (const p of last24h) {
    providerCounts[p.provider] = (providerCounts[p.provider] ?? 0) + 1
  }
  const providerLines = Object.entries(providerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `  - ${k.slice(0, 8)}… : ${v} calls`)
    .join('\n')

  // Compliance summary
  const compLast7d = complianceHistory.filter(e => e.timestamp > now - MS.week)
  const compByBucket = [0, 1, 2, 3].map(
    sev => compLast7d.filter(e => e.severity === sev).length,
  )
  const criticalRecent = complianceHistory
    .filter(e => e.severity >= 3)
    .slice(0, 5)
    .map(
      e =>
        `  - [${new Date(e.timestamp).toISOString()}] ${e.reason_code} (severity ${e.severity})`,
    )
    .join('\n')

  return `
WALLET FINANCIAL SUMMARY
========================
Current balance : ${balance.toLocaleString()} lamports  (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL)
Total tx count  : ${txCount}

LAST 24 HOURS:
  Payments      : ${last24h.length}
  Total spent   : ${spent24h.toLocaleString()} lamports
  Burn rate     : ${burnRate24h.toFixed(0)} lamports/hour
  Top providers :
${providerLines || '  (none)'}

LAST 7 DAYS:
  Payments      : ${last7d.length}
  Total spent   : ${spent7d.toLocaleString()} lamports
  Avg burn rate : ${burnRate7d.toFixed(0)} lamports/hour (7-day baseline)

COMPLIANCE EVENTS (last 7 days):
  Severity 0 (nominal)   : ${compByBucket[0]}
  Severity 1 (minor)     : ${compByBucket[1]}
  Severity 2 (moderate)  : ${compByBucket[2]}
  Severity 3 (critical)  : ${compByBucket[3]}

RECENT CRITICAL EVENTS:
${criticalRecent || '  (none in last 7 days)'}
${providerIntel && Object.keys(providerIntel).length > 0 ? `
PROVIDER INTELLIGENCE (from Specter):
${Object.entries(providerIntel)
  .map(([pubkey, intel]) => {
    const displayName = PROVIDER_MAP[pubkey] ?? intel.display_name
    const funding = intel.funding_total_usd !== null
      ? `$${(intel.funding_total_usd / 1_000_000).toFixed(0)}m raised`
      : 'bootstrapped'
    const rounds = intel.funding_rounds !== null ? `, ${intel.funding_rounds} rounds` : ''
    return `  ${displayName} (${intel.specter_name}): ${funding}${rounds}, reliability ${intel.reliability_score}/100`
  })
  .join('\n')}` : ''}
`.trim()
}

// ---------------------------------------------------------------------------
// Heuristic fallback — never fails
// ---------------------------------------------------------------------------

function computeHeuristic(data: AnalyzeRequest): TreasuryAnalysis {
  const { paymentHistory, complianceHistory, balance } = data
  const now = Date.now()

  const last24h = paymentHistory.filter(p => p.timestamp > now - 86_400_000)
  const spent24h = last24h.reduce((s, p) => s + p.lamports, 0)
  const burnRatePerHour = spent24h / 24

  const runwayHours =
    burnRatePerHour > 0 ? Math.min(balance / burnRatePerHour, 9999) : 9999

  const runwayStatus: RunwayStatus =
    runwayHours > 48 ? 'healthy' : runwayHours > 24 ? 'warning' : 'critical'

  const recentCritical = complianceHistory.filter(
    e => e.severity >= 3 && e.timestamp > now - 86_400_000,
  )

  const actions: RecommendedAction[] = []

  if (runwayStatus === 'critical') {
    actions.push({
      action: 'Reduce inference call frequency by 40%',
      priority: 'critical',
      reasoning: `Runway of ${runwayHours.toFixed(0)}h is critically low. Throttle immediately.`,
    })
  } else if (runwayStatus === 'warning') {
    actions.push({
      action: 'Increase SOL reserve by 20%',
      priority: 'high',
      reasoning: `Runway of ${runwayHours.toFixed(0)}h falls below 48-hour safety threshold.`,
    })
  }

  if (recentCritical.length >= 2) {
    actions.push({
      action: 'Suspend autonomous operation pending safety review',
      priority: 'critical',
      reasoning: `${recentCritical.length} severity-3 compliance events in the last 24h indicate systemic risk.`,
    })
  }

  // Burn rate spike (24h vs 7d baseline)
  const last7d = paymentHistory.filter(p => p.timestamp > now - 7 * 86_400_000)
  const avgRate7d = last7d.reduce((s, p) => s + p.lamports, 0) / (7 * 24)
  if (burnRatePerHour > avgRate7d * 1.3) {
    actions.push({
      action: 'Investigate elevated inference spend',
      priority: 'medium',
      reasoning: `24h burn rate is ${((burnRatePerHour / avgRate7d - 1) * 100).toFixed(0)}% above the 7-day baseline.`,
    })
  }

  if (actions.length === 0) {
    actions.push({
      action: 'Maintain current operating parameters',
      priority: 'low',
      reasoning: 'All indicators within acceptable ranges.',
    })
  }

  const anomalyFlags: AnomalyFlag[] = recentCritical.map(e => ({
    description: e.reason_code.replace(/_/g, ' ').toLowerCase(),
    severity: e.severity,
    timestamp: new Date(e.timestamp).toISOString(),
  }))

  return {
    burn_rate_per_hour: Math.round(burnRatePerHour),
    runway_hours: Math.round(runwayHours * 10) / 10,
    runway_status: runwayStatus,
    budget_allocation: { inference: 72, reserve: 18, buffer: 10 },
    recommended_actions: actions,
    anomaly_flags: anomalyFlags,
    summary: `The wallet is operating at ${burnRatePerHour.toFixed(0)} lamports/hour with a ${runwayStatus} runway of ${runwayHours.toFixed(0)} hours. ${recentCritical.length > 0 ? `${recentCritical.length} critical compliance event(s) in the last 24 hours require immediate attention.` : 'No critical compliance events in the last 24 hours.'}`,
    computed_at: Date.now(),
    source: 'heuristic',
    model_used: 'heuristic',
    latency_ms: 0,
  }
}

// ---------------------------------------------------------------------------
// Claude response validator
// ---------------------------------------------------------------------------

function isValidAnalysis(obj: unknown): obj is Omit<TreasuryAnalysis, 'computed_at' | 'source'> {
  if (typeof obj !== 'object' || obj === null) return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.burn_rate_per_hour === 'number' &&
    typeof o.runway_hours === 'number' &&
    ['healthy', 'warning', 'critical'].includes(o.runway_status as string) &&
    typeof o.budget_allocation === 'object' &&
    Array.isArray(o.recommended_actions) &&
    Array.isArray(o.anomaly_flags) &&
    typeof o.summary === 'string'
  )
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an autonomous treasury manager for a machine wallet on Solana. This wallet belongs to a physical robot that pays for AI inference. Analyse the financial data and produce exactly this JSON structure:
{
  "burn_rate_per_hour": <number, lamports>,
  "runway_hours": <number>,
  "runway_status": <"healthy" | "warning" | "critical">,
  "budget_allocation": { "inference": <percentage>, "reserve": <percentage>, "buffer": <percentage> },
  "recommended_actions": [{ "action": <string>, "priority": <"low"|"medium"|"high"|"critical">, "reasoning": <string> }],
  "anomaly_flags": [{ "description": <string>, "severity": <number>, "timestamp": <ISO string> }],
  "summary": <string, 2-3 sentences>
}
Be specific with numbers. If burn rate exceeds sustainable levels, recommend throttling. If compliance events are spiking, flag operational risk. If balance is low, recommend reserve allocation. Output ONLY the JSON object — no markdown, no preamble.`

async function callClaude(summary: string): Promise<TreasuryAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })

  const t0 = Date.now()

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    // Prompt caching: cache the system prompt across calls (5-min TTL)
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Here is the wallet data to analyse:\n\n${summary}`,
      },
    ],
  })

  const latency_ms = Date.now() - t0

  const text = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  // Strip markdown code fences if present
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    console.error('[treasury/analyze] Claude returned non-JSON:', text.slice(0, 200))
    return null
  }

  if (!isValidAnalysis(parsed)) {
    console.error('[treasury/analyze] Claude JSON failed validation')
    return null
  }

  return { ...parsed, computed_at: Date.now(), source: 'claude', model_used: 'claude-sonnet-4-6', latency_ms }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: AnalyzeRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { balance, txCount } = body
  const key = cacheKey(balance, txCount)

  // Return cached result if still fresh
  const cached = _cache.get(key)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.analysis)
  }

  // Try Claude, fall back to heuristic
  const summary = buildFinancialSummary(body)
  let analysis: TreasuryAnalysis

  try {
    const claudeResult = await callClaude(summary)
    analysis = claudeResult ?? computeHeuristic(body)
  } catch (err) {
    console.error('[treasury/analyze] Claude call threw:', err)
    analysis = computeHeuristic(body)
  }

  _cache.set(key, { analysis, expiresAt: Date.now() + CACHE_TTL_MS })

  return NextResponse.json(analysis)
}
