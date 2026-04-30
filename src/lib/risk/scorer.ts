/**
 * Machine Credit Score — deterministic risk scorer.
 *
 * Same input → same output. No network calls, no randomness, no Date.now()
 * in the scoring math itself (callers pass a reference timestamp).
 *
 * Overall = financial(30%) + operational(25%) + compliance(25%) + diversity(20%)
 */

import type { PaymentEvent, ComplianceEvent } from '@/lib/solana/types'
import type {
  DimensionScore,
  Grade,
  RiskBreakdown,
  RiskReport,
  Trend,
  TrendPoint,
  WalletData,
} from '@/lib/risk/types'

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

function cv(arr: number[]): number {
  const m = mean(arr)
  return m === 0 ? 0 : stdDev(arr) / m
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

// ---------------------------------------------------------------------------
// Financial Health  (weight 0.30)
//
// Sub-scores
//  • Runway      50% — how many hours at current burn rate before empty
//  • Stability   30% — CV of per-payment lamport amounts (low = good)
//  • Trend       20% — is the second half of the window burning faster?
// ---------------------------------------------------------------------------

function scoreFinancialHealth(
  payments: PaymentEvent[],
  balance: number,
): DimensionScore & { weight: 0.30 } {
  const factors: string[] = []

  if (payments.length === 0) {
    factors.push('No payment history — cannot compute burn rate')
    return { score: 50, weight: 0.30, factors }
  }

  // Sort ascending (oldest first)
  const sorted = [...payments].sort((a, b) => a.timestamp - b.timestamp)
  const spanMs = Math.max(sorted[sorted.length - 1].timestamp - sorted[0].timestamp, MS_PER_HOUR)
  const spanHours = spanMs / MS_PER_HOUR
  const totalSpent = payments.reduce((s, p) => s + p.lamports, 0)

  // 1. Runway
  const burnPerHour = totalSpent / spanHours
  const runwayHours = burnPerHour > 0 ? balance / burnPerHour : Infinity
  const runwayScore =
    burnPerHour === 0
      ? 100
      : clamp(((runwayHours - 12) / 36) * 100, 0, 100)
  factors.push(
    `Runway: ${Number.isFinite(runwayHours) ? runwayHours.toFixed(0) + 'h' : '∞'} at ${burnPerHour.toFixed(0)} lam/h → ${runwayScore.toFixed(0)}/100`,
  )

  // 2. Burn-rate stability (CV of per-payment amounts)
  const amounts = payments.map(p => p.lamports)
  const amountCV = cv(amounts)
  const stabilityScore = clamp(((1.5 - amountCV) / 1.2) * 100, 0, 100)
  factors.push(`Amount CV: ${amountCV.toFixed(2)} → stability ${stabilityScore.toFixed(0)}/100`)

  // 3. Balance trend — compare total lamports in first vs second half of span
  const midTs = sorted[0].timestamp + spanMs / 2
  const firstHalfSpend = sorted
    .filter(p => p.timestamp < midTs)
    .reduce((s, p) => s + p.lamports, 0)
  const secondHalfSpend = sorted
    .filter(p => p.timestamp >= midTs)
    .reduce((s, p) => s + p.lamports, 0)

  let trendScore: number
  if (firstHalfSpend === 0) {
    trendScore = 70
    factors.push('Balance trend: insufficient data → neutral (70)')
  } else {
    const ratio = secondHalfSpend / firstHalfSpend
    if (ratio < 0.9) {
      trendScore = 100
      factors.push(`Balance trend: improving (spend ratio ${ratio.toFixed(2)})`)
    } else if (ratio > 1.1) {
      trendScore = 40
      factors.push(`Balance trend: declining (spend ratio ${ratio.toFixed(2)})`)
    } else {
      trendScore = 70
      factors.push(`Balance trend: stable (spend ratio ${ratio.toFixed(2)})`)
    }
  }

  const score = clamp(0.5 * runwayScore + 0.3 * stabilityScore + 0.2 * trendScore, 0, 100)
  return { score, weight: 0.30, factors }
}

// ---------------------------------------------------------------------------
// Operational Stability  (weight 0.25)
//
// Sub-scores
//  • Consistency  60% — CV of inter-payment intervals (low = regular)
//  • Uptime       40% — fraction of expected work hours with ≥1 payment
// ---------------------------------------------------------------------------

function scoreOperationalStability(payments: PaymentEvent[]): DimensionScore & { weight: 0.25 } {
  const factors: string[] = []

  if (payments.length < 2) {
    const s = payments.length === 0 ? 30 : 50
    factors.push('Too few payments for stability analysis')
    return { score: s, weight: 0.25, factors }
  }

  const sorted = [...payments].sort((a, b) => a.timestamp - b.timestamp)

  // 1. Interval consistency — all gaps (do not filter overnights to capture true instability)
  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i].timestamp - sorted[i - 1].timestamp)
  }
  const intervalCV = cv(intervals)
  // CV of 0 → 100, CV of 2+ → 0 (linear)
  const consistencyScore = clamp(((2.0 - intervalCV) / 2.0) * 100, 0, 100)
  factors.push(`Interval CV: ${intervalCV.toFixed(2)} → consistency ${consistencyScore.toFixed(0)}/100`)

  // 2. Uptime — work hours (08:00–18:00) that had at least one payment
  const activeWorkHours = new Set<string>()
  const allWorkHours = new Set<string>()

  // Walk the time span hour by hour
  const spanStart = sorted[0].timestamp
  const spanEnd = sorted[sorted.length - 1].timestamp
  let cursor = spanStart - (spanStart % MS_PER_HOUR) // floor to hour
  while (cursor <= spanEnd) {
    const h = new Date(cursor).getUTCHours()
    if (h >= 8 && h < 18) {
      allWorkHours.add(String(cursor))
    }
    cursor += MS_PER_HOUR
  }

  for (const p of payments) {
    const hourKey = String(p.timestamp - (p.timestamp % MS_PER_HOUR))
    const h = new Date(p.timestamp).getUTCHours()
    if (h >= 8 && h < 18) {
      activeWorkHours.add(hourKey)
    }
  }

  const expectedHours = Math.max(allWorkHours.size, 1)
  const uptimeScore = clamp((activeWorkHours.size / expectedHours) * 100, 0, 100)
  factors.push(
    `Work-hour uptime: ${activeWorkHours.size}/${expectedHours} (${uptimeScore.toFixed(0)}/100)`,
  )

  const score = clamp(0.6 * consistencyScore + 0.4 * uptimeScore, 0, 100)
  return { score, weight: 0.25, factors }
}

// ---------------------------------------------------------------------------
// Compliance Record  (weight 0.25)
//
// Sub-scores
//  • Severity     50% — penalise severity-3/2/1 events
//  • Recency      30% — time since last severity ≥2 event (7-day scale)
//  • Event rate   20% — compliance events per 100 transactions
// ---------------------------------------------------------------------------

function scoreComplianceRecord(
  compliance: ComplianceEvent[],
  txCount: number,
  referenceTime: number,
): DimensionScore & { weight: 0.25 } {
  const factors: string[] = []

  // 1. Severity penalty
  const sev3 = compliance.filter(e => e.severity === 3).length
  const sev2 = compliance.filter(e => e.severity === 2).length
  const sev1 = compliance.filter(e => e.severity === 1).length
  const severityScore = clamp(100 - sev3 * 30 - sev2 * 8 - sev1 * 1, 0, 100)
  factors.push(
    `Severity: ${sev3} critical / ${sev2} moderate / ${sev1} minor → ${severityScore.toFixed(0)}/100`,
  )

  // 2. Recency of last severity ≥2 event (168h = 7 days → 100 score, 0h → 0 score)
  const highSev = [...compliance]
    .filter(e => e.severity >= 2)
    .sort((a, b) => b.timestamp - a.timestamp)

  let recencyScore: number
  if (highSev.length === 0) {
    recencyScore = 100
    factors.push('Recency: no severity 2+ events on record → 100')
  } else {
    const hoursSince = (referenceTime - highSev[0].timestamp) / MS_PER_HOUR
    recencyScore = clamp((hoursSince / 168) * 100, 0, 100)
    factors.push(
      `Recency: last sev 2+ was ${hoursSince.toFixed(0)}h ago → ${recencyScore.toFixed(0)}/100`,
    )
  }

  // 3. Event rate — compliance events per 100 txs
  const effectiveTxCount = Math.max(txCount, compliance.length, 1)
  const rate = (compliance.length / effectiveTxCount) * 100
  // <3 per 100 → 100, >15 per 100 → 0, linear between
  const eventRateScore = clamp(((15 - rate) / 12) * 100, 0, 100)
  factors.push(`Event rate: ${rate.toFixed(1)}/100 txs → ${eventRateScore.toFixed(0)}/100`)

  const score = clamp(
    0.5 * severityScore + 0.3 * recencyScore + 0.2 * eventRateScore,
    0,
    100,
  )
  return { score, weight: 0.25, factors }
}

// ---------------------------------------------------------------------------
// Provider Diversity  (weight 0.20)
//
// Sub-scores
//  • Count   30% — number of unique providers (1=30, 2=65, 3+=100)
//  • HHI     50% — Herfindahl-Hirschman Index of volume share (lower=better)
//  • Streak  20% — longest consecutive single-provider run
// ---------------------------------------------------------------------------

function scoreProviderDiversity(payments: PaymentEvent[]): DimensionScore & { weight: 0.20 } {
  const factors: string[] = []

  if (payments.length === 0) {
    factors.push('No payments — cannot assess diversity')
    return { score: 30, weight: 0.20, factors }
  }

  // Volume per provider
  const vol: Record<string, number> = {}
  for (const p of payments) vol[p.provider] = (vol[p.provider] ?? 0) + p.lamports
  const providers = Object.keys(vol)
  const n = providers.length
  const totalVol = payments.reduce((s, p) => s + p.lamports, 0)

  // 1. Count score
  const countScore = n === 1 ? 30 : n === 2 ? 65 : 100
  factors.push(`Unique providers: ${n} → ${countScore}/100`)

  // 2. HHI (sum of squared volume shares)
  const hhi = providers.reduce((s, p) => {
    const share = vol[p] / totalVol
    return s + share * share
  }, 0)
  const hhiScore = clamp((1 - hhi) * 100, 0, 100)
  factors.push(`HHI: ${hhi.toFixed(3)} → ${hhiScore.toFixed(0)}/100`)

  // 3. Longest single-provider consecutive streak
  const sorted = [...payments].sort((a, b) => a.timestamp - b.timestamp)
  let longest = 1
  let current = 1
  for (let i = 1; i < sorted.length; i++) {
    current = sorted[i].provider === sorted[i - 1].provider ? current + 1 : 1
    if (current > longest) longest = current
  }
  // 1-5 = excellent (100), 20+ = poor (0), linear
  const streakScore = clamp(((20 - longest) / 19) * 100, 0, 100)
  factors.push(`Longest streak: ${longest} txs → ${streakScore.toFixed(0)}/100`)

  const score = clamp(0.3 * countScore + 0.5 * hhiScore + 0.2 * streakScore, 0, 100)
  return { score, weight: 0.20, factors }
}

// ---------------------------------------------------------------------------
// Internal: compute a single score snapshot from a payment/compliance slice
// ---------------------------------------------------------------------------

interface ScoreSnapshot {
  overall: number
  breakdown: RiskBreakdown
}

function computeSnapshot(
  payments: PaymentEvent[],
  compliance: ComplianceEvent[],
  balance: number,
  txCount: number,
  referenceTime: number,
): ScoreSnapshot {
  const fin = scoreFinancialHealth(payments, balance)
  const ops = scoreOperationalStability(payments)
  const comp = scoreComplianceRecord(compliance, txCount, referenceTime)
  const div = scoreProviderDiversity(payments)

  const overall = clamp(
    fin.score * 0.3 + ops.score * 0.25 + comp.score * 0.25 + div.score * 0.2,
    0,
    100,
  )

  return {
    overall,
    breakdown: {
      financial_health: fin,
      operational_stability: ops,
      compliance_record: comp,
      provider_diversity: div,
    },
  }
}

// ---------------------------------------------------------------------------
// Grade + Trend helpers
// ---------------------------------------------------------------------------

function toGrade(score: number): Grade {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

function toTrend(trendData: TrendPoint[]): Trend {
  if (trendData.length < 4) return 'stable'
  const first = mean(trendData.slice(0, 3).map(d => d.score))
  const last = mean(trendData.slice(-3).map(d => d.score))
  const delta = last - first
  if (delta > 5) return 'improving'
  if (delta < -5) return 'declining'
  return 'stable'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate the Machine Credit Score for a wallet.
 *
 * Fully deterministic: given the same WalletData and referenceTime, always
 * returns the same RiskReport.
 */
export function calculateRiskScore(
  data: WalletData,
  referenceTime: number = Date.now(),
): RiskReport {
  const { paymentHistory, complianceHistory, balance, txCount } = data

  // Main snapshot (full history)
  const main = computeSnapshot(
    paymentHistory,
    complianceHistory,
    balance,
    txCount,
    referenceTime,
  )

  // Trend data — one point per day for the last 7 days
  const trend_data: TrendPoint[] = []

  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const windowEnd = referenceTime - daysAgo * MS_PER_DAY
    const windowStart = windowEnd - MS_PER_DAY

    const windowPayments = paymentHistory.filter(
      p => p.timestamp >= windowStart && p.timestamp < windowEnd,
    )
    const windowCompliance = complianceHistory.filter(
      e => e.timestamp >= windowStart && e.timestamp < windowEnd,
    )

    // Estimate historical balance: current balance + everything spent AFTER this window
    const futureSpend = paymentHistory
      .filter(p => p.timestamp >= windowEnd)
      .reduce((s, p) => s + p.lamports, 0)
    const windowBalance = balance + futureSpend

    const snap = computeSnapshot(
      windowPayments,
      windowCompliance,
      windowBalance,
      windowPayments.length, // txCount approximated from window payments
      windowEnd,
    )

    trend_data.push({
      date: new Date(windowEnd).toISOString().slice(0, 10),
      score: Math.round(snap.overall),
    })
  }

  const trend = toTrend(trend_data)
  const overall_score = Math.round(main.overall)
  const grade = toGrade(overall_score)

  return {
    overall_score,
    grade,
    breakdown: main.breakdown,
    trend,
    trend_data,
  }
}
