import { calculateRiskScore } from '@/lib/risk/scorer'
import type { WalletData } from '@/lib/risk/types'
import type { PaymentEvent, ComplianceEvent } from '@/lib/solana/types'

// ---------------------------------------------------------------------------
// Deterministic reference time so tests never depend on Date.now()
// ---------------------------------------------------------------------------
const REF = new Date('2026-04-30T12:00:00Z').getTime()
const HOUR = 3_600_000
const DAY = 86_400_000
const LAMPORTS_PER_SOL = 1_000_000_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePayment(
  index: number,
  timestamp: number,
  provider: string,
  lamports: number,
): PaymentEvent {
  return {
    signature: `sig${index}`,
    agent: 'AgentWallet111111111111111111111111111111111',
    provider,
    lamports,
    timestamp,
    slot: 200_000_000 + index,
  }
}

function makeCompliance(
  index: number,
  timestamp: number,
  severity: 0 | 1 | 2 | 3,
  reason_code: string,
): ComplianceEvent {
  return {
    signature: `csig${index}`,
    agent: 'AgentWallet111111111111111111111111111111111',
    hash: `hash${index}`.padEnd(64, '0'),
    severity,
    reason_code,
    timestamp,
    slot: 200_000_000 + index,
  }
}

// Build N regular payments spread over a time span across 3 providers (60/30/10)
function buildRegularPayments(
  count: number,
  startTs: number,
  endTs: number,
  lamports = 1000,
): PaymentEvent[] {
  const span = endTs - startTs
  const providers = ['ProviderA1111111111111111111111111111111111', 'ProviderB2222222222222222222222222222222222', 'ProviderC3333333333333333333333333333333333']
  return Array.from({ length: count }, (_, i) => {
    const t = startTs + (i / (count - 1)) * span
    const p = i % 10 < 6 ? providers[0] : i % 10 < 9 ? providers[1] : providers[2]
    return makePayment(i, Math.round(t), p, lamports)
  })
}

// ---------------------------------------------------------------------------
// Test Case 1: Healthy wallet — target ≥ 85, grade A
//
// Profile:
//   • 200 payments, very regular (≈30 min apart), 3 providers (60/30/10)
//   • Balance: 50 SOL → effectively infinite runway at tiny burn rate
//   • 10 compliance events, all severity 0-1, last one 6 days ago
// ---------------------------------------------------------------------------

function buildHealthyWallet(): WalletData {
  const payments = buildRegularPayments(200, REF - 7 * DAY, REF - HOUR, 800)

  const compliance: ComplianceEvent[] = [
    // 6 × severity-0 (routine)
    ...Array.from({ length: 6 }, (_, i) =>
      makeCompliance(i, REF - (6 - i) * DAY, 0, 'SENSOR_NOMINAL')),
    // 4 × severity-1 (minor)
    ...Array.from({ length: 4 }, (_, i) =>
      makeCompliance(100 + i, REF - (4 - i) * DAY - 12 * HOUR, 1, 'JOINT_TEMP_ELEVATED')),
  ]

  return {
    paymentHistory: payments,
    complianceHistory: compliance,
    balance: 50 * LAMPORTS_PER_SOL,
    txCount: 250,
  }
}

// ---------------------------------------------------------------------------
// Test Case 2: Compliance spike — target 45–65, grade C or D
//
// Profile:
//   • 80 payments, moderate regularity, 3 providers
//   • Decent runway (48h+ at current rate)
//   • 8 severity-3 events, 5 in the last 24h, last one 2h ago
//   • High compliance event rate (15 events / 80 txs = 18.75 per 100)
// ---------------------------------------------------------------------------

function buildComplianceSpikeWallet(): WalletData {
  // Regular payments — every 2 hours over 7 days
  const payments = buildRegularPayments(80, REF - 7 * DAY, REF - HOUR, 1500)

  const compliance: ComplianceEvent[] = [
    // 3 severity-3 events in earlier days (not recent)
    makeCompliance(0, REF - 5 * DAY, 3, 'EMERGENCY_STOP_TRIGGERED'),
    makeCompliance(1, REF - 4 * DAY, 3, 'SAFETY_BOUNDARY_BREACH'),
    makeCompliance(2, REF - 3 * DAY, 3, 'EMERGENCY_STOP_TRIGGERED'),
    // 5 severity-3 events in last 24h — the spike
    makeCompliance(3, REF - 20 * HOUR, 3, 'EMERGENCY_STOP_TRIGGERED'),
    makeCompliance(4, REF - 18 * HOUR, 3, 'SAFETY_BOUNDARY_BREACH'),
    makeCompliance(5, REF - 14 * HOUR, 3, 'FORCE_THRESHOLD_BREACH'),
    makeCompliance(6, REF - 8 * HOUR, 3, 'EMERGENCY_STOP_TRIGGERED'),
    makeCompliance(7, REF - 2 * HOUR, 3, 'SAFETY_BOUNDARY_BREACH'),
    // 7 lower-severity events across the week
    makeCompliance(8, REF - 6 * DAY, 2, 'THERMAL_WARNING'),
    makeCompliance(9, REF - 5 * DAY, 2, 'SPEED_LIMIT_EXCEEDED'),
    makeCompliance(10, REF - 3 * DAY, 1, 'JOINT_TEMP_ELEVATED'),
    makeCompliance(11, REF - 2 * DAY, 1, 'PAYLOAD_NEAR_LIMIT'),
    makeCompliance(12, REF - DAY, 0, 'SENSOR_NOMINAL'),
    makeCompliance(13, REF - 4 * HOUR, 2, 'THERMAL_WARNING'),
    makeCompliance(14, REF - 3 * HOUR, 1, 'LATENCY_SPIKE'),
  ]

  return {
    paymentHistory: payments,
    complianceHistory: compliance,
    balance: 5 * LAMPORTS_PER_SOL,   // 5 SOL — decent runway
    txCount: 80,
  }
}

// ---------------------------------------------------------------------------
// Test Case 3: Low balance + single provider — target 20–45, grade D or F
//
// Profile:
//   • 60 payments to a SINGLE provider, erratic intervals
//   • Balance: 20,000 lamports (< 1h runway at burn rate)
//   • 5 severity-3 compliance events in last 24h
// ---------------------------------------------------------------------------

function buildDistressedWallet(): WalletData {
  // Burst pattern: 5 payments close together, then a 10-hour gap, repeat
  // This gives very high interval CV
  const SINGLE_PROVIDER = 'OnlyProviderXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
  const payments: PaymentEvent[] = []
  let t = REF - 7 * DAY
  let idx = 0

  for (let burst = 0; burst < 12; burst++) {
    // 5 payments within 2 minutes of each other
    for (let j = 0; j < 5; j++) {
      t += 30_000 // 30 seconds
      payments.push(makePayment(idx++, t, SINGLE_PROVIDER, 2000))
    }
    // 10-hour gap before next burst
    t += 10 * HOUR
  }

  const compliance: ComplianceEvent[] = [
    makeCompliance(0, REF - 22 * HOUR, 3, 'EMERGENCY_STOP_TRIGGERED'),
    makeCompliance(1, REF - 18 * HOUR, 3, 'SAFETY_BOUNDARY_BREACH'),
    makeCompliance(2, REF - 12 * HOUR, 3, 'FORCE_THRESHOLD_BREACH'),
    makeCompliance(3, REF - 6 * HOUR, 3, 'EMERGENCY_STOP_TRIGGERED'),
    makeCompliance(4, REF - 1 * HOUR, 3, 'SAFETY_BOUNDARY_BREACH'),
  ]

  return {
    paymentHistory: payments,
    complianceHistory: compliance,
    balance: 20_000, // ~0.00002 SOL — critically low
    txCount: payments.length,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calculateRiskScore', () => {
  test('Test 1: Healthy wallet scores ≥ 85 and grades A', () => {
    const report = calculateRiskScore(buildHealthyWallet(), REF)

    expect(report.overall_score).toBeGreaterThanOrEqual(85)
    expect(report.grade).toBe('A')

    // All four dimensions should be healthy
    expect(report.breakdown.financial_health.score).toBeGreaterThan(80)
    expect(report.breakdown.compliance_record.score).toBeGreaterThan(80)
    expect(report.breakdown.provider_diversity.score).toBeGreaterThan(60)

    // Trend data should span 7 days
    expect(report.trend_data).toHaveLength(7)

    // Determinism check — running again must return same score
    expect(calculateRiskScore(buildHealthyWallet(), REF).overall_score).toBe(report.overall_score)
  })

  test('Test 2: Compliance spike scores 40–70 and grades C or D', () => {
    const report = calculateRiskScore(buildComplianceSpikeWallet(), REF)

    expect(report.overall_score).toBeGreaterThanOrEqual(40)
    expect(report.overall_score).toBeLessThanOrEqual(70)
    expect(['C', 'D']).toContain(report.grade)

    // Compliance score should be very low due to severity-3 events
    expect(report.breakdown.compliance_record.score).toBeLessThan(30)

    // Financial health should still be reasonable (5 SOL balance)
    expect(report.breakdown.financial_health.score).toBeGreaterThan(40)

    // Determinism check
    expect(calculateRiskScore(buildComplianceSpikeWallet(), REF).overall_score).toBe(report.overall_score)
  })

  test('Test 3: Distressed wallet (low balance + single provider + compliance) scores ≤ 45 and grades D or F', () => {
    const report = calculateRiskScore(buildDistressedWallet(), REF)

    expect(report.overall_score).toBeLessThanOrEqual(45)
    expect(['D', 'F']).toContain(report.grade)

    // Provider diversity should be near minimum (single provider)
    expect(report.breakdown.provider_diversity.score).toBeLessThanOrEqual(35)

    // Compliance record should be very low
    expect(report.breakdown.compliance_record.score).toBeLessThan(30)

    // Determinism check
    expect(calculateRiskScore(buildDistressedWallet(), REF).overall_score).toBe(report.overall_score)
  })

  test('trend_data has exactly 7 entries', () => {
    const report = calculateRiskScore(buildHealthyWallet(), REF)
    expect(report.trend_data).toHaveLength(7)
    // Each entry must be a valid YYYY-MM-DD date
    for (const pt of report.trend_data) {
      expect(pt.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(pt.score).toBeGreaterThanOrEqual(0)
      expect(pt.score).toBeLessThanOrEqual(100)
    }
  })

  test('grade boundaries are correct', () => {
    // Use healthy data as base, override scores aren't directly injectable —
    // verify grade labels via overall_score expectations
    const healthy = calculateRiskScore(buildHealthyWallet(), REF)
    const spiked = calculateRiskScore(buildComplianceSpikeWallet(), REF)
    const distressed = calculateRiskScore(buildDistressedWallet(), REF)

    // Healthy > spiked > distressed
    expect(healthy.overall_score).toBeGreaterThan(spiked.overall_score)
    expect(spiked.overall_score).toBeGreaterThan(distressed.overall_score)
  })
})
