import type { PaymentEvent, ComplianceEvent } from '@/lib/solana/types'

// ---------------------------------------------------------------------------
// Story arc
// ---------------------------------------------------------------------------
// A robot arm (R2-series) has been running normally for 6 days:
//   - Regular AI inference payments every 30-90 min during work hours
//   - Routine compliance checks (severity 0-1)
// Yesterday, 20h and 14h ago, two EMERGENCY_STOP / SAFETY_BOUNDARY events
// fired at severity 3. The burn rate spiked in the last 6 hours as the robot
// resumed work at elevated frequency. Balance is declining toward critical.
// ---------------------------------------------------------------------------

// Three realistic-looking Solana pubkeys for providers
const PROVIDERS = {
  A: 'Hoh7fqnGfuvpHzMhVEoP5K8qfcuVNSGFnJoLTBMLbdYw', // Replicate   (~60%)
  B: 'GPdnT3tRBm6RaMz1E4PKBYvY7RdtNvb1KEmRsLBJJrqA', // Together AI (~30%)
  C: '2noknFMELsRzWaFhpBrqJnxXmvZsQn1gGNmLuE5RL7E9', // Perplexity  (~10%)
}

// Static agent pubkey used when hardware wallet env var is not set
const FALLBACK_AGENT = 'DemoWaLLeT1111111111111111111111111111111111'

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32) — deterministic within a generation call
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeSignature(rng: () => number, index: number): string {
  const hex = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 64; i++) {
    s += hex[Math.floor(rng() * 16)]
  }
  return s + index.toString(16).padStart(8, '0')
}

function fakeHash(rng: () => number): string {
  const hex = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 64; i++) s += hex[Math.floor(rng() * 16)]
  return s
}

// Probability of a payment being in "work hours" (08:00-18:00 local)
function isWorkHour(date: Date): boolean {
  const h = date.getHours()
  return h >= 8 && h < 18
}

// ---------------------------------------------------------------------------
// Payment history — 200 events over 7 days
// ---------------------------------------------------------------------------

export function generateMockPayments(agentPubkey: string): PaymentEvent[] {
  const rng = mulberry32(0xdeadbeef)
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

  const events: PaymentEvent[] = []
  let cursor = sevenDaysAgo

  // Generate 200 payments with realistic inter-arrival times
  while (events.length < 200) {
    // Base interval: 30-90 min, compressed during work hours
    const baseMs = (30 + rng() * 60) * 60 * 1000
    const date = new Date(cursor)
    const multiplier = isWorkHour(date) ? 0.6 : 2.0 // faster during work hours
    cursor += baseMs * multiplier

    if (cursor > now) break

    // Provider selection weighted A>B>C
    const roll = rng()
    const provider =
      roll < 0.6 ? PROVIDERS.A : roll < 0.9 ? PROVIDERS.B : PROVIDERS.C

    // Amount: 100-10000 lamports, with clustering around typical inference costs
    // Provider A tends to charge more (complex models)
    const baseAmount = provider === PROVIDERS.A ? 1000 : provider === PROVIDERS.B ? 500 : 200
    const lamports = Math.round(baseAmount + rng() * baseAmount * 8)

    // Spike in last 6 hours (elevated burn rate after anomaly)
    const inSpike = cursor > now - 6 * 60 * 60 * 1000
    const finalLamports = inSpike ? Math.round(lamports * 1.4) : lamports

    events.push({
      signature: fakeSignature(rng, events.length),
      agent: agentPubkey,
      provider,
      lamports: finalLamports,
      timestamp: Math.round(cursor),
      slot: 250000000 + events.length * 400,
    })
  }

  return events.sort((a, b) => b.timestamp - a.timestamp)
}

// ---------------------------------------------------------------------------
// Compliance history — 15 events, 2 severity-3 in last 24h
// ---------------------------------------------------------------------------

const COMPLIANCE_PROFILES: {
  severity: 0 | 1 | 2 | 3
  reason_code: string
  description: string
}[] = [
  // Severity 0 — routine
  { severity: 0, reason_code: 'SENSOR_NOMINAL', description: 'All sensors within spec' },
  { severity: 0, reason_code: 'HEALTH_CHECK_PASSED', description: 'Scheduled health check OK' },
  { severity: 0, reason_code: 'JOINT_CALIBRATED', description: 'Joint calibration complete' },
  { severity: 0, reason_code: 'SENSOR_NOMINAL', description: 'All sensors within spec' },
  { severity: 0, reason_code: 'HEALTH_CHECK_PASSED', description: 'Scheduled health check OK' },
  { severity: 0, reason_code: 'SENSOR_NOMINAL', description: 'All sensors within spec' },
  // Severity 1 — minor warnings
  { severity: 1, reason_code: 'JOINT_TEMP_ELEVATED', description: 'Joint 3 temp 2°C above nominal' },
  { severity: 1, reason_code: 'PAYLOAD_NEAR_LIMIT', description: 'Payload at 92% rated capacity' },
  { severity: 1, reason_code: 'LATENCY_SPIKE', description: 'Inference latency >2s detected' },
  { severity: 1, reason_code: 'JOINT_TEMP_ELEVATED', description: 'Joint 5 temp 3°C above nominal' },
  // Severity 2 — moderate
  { severity: 2, reason_code: 'SPEED_LIMIT_EXCEEDED', description: 'Arm velocity exceeded zone limit briefly' },
  { severity: 2, reason_code: 'THERMAL_WARNING', description: 'Motor controller thermal limit' },
  { severity: 2, reason_code: 'FORCE_THRESHOLD', description: 'Contact force exceeded 80% threshold' },
  // Severity 3 — critical (last 24h, the anomaly events)
  { severity: 3, reason_code: 'EMERGENCY_STOP_TRIGGERED', description: 'Full stop: unexpected object in workspace' },
  { severity: 3, reason_code: 'SAFETY_BOUNDARY_BREACH', description: 'Arm entered restricted zone; immediate halt' },
]

export function generateMockCompliance(agentPubkey: string): ComplianceEvent[] {
  const rng = mulberry32(0xcafebabe)
  const now = Date.now()

  // Assign timestamps: first 13 events spread over days 1-6, last 2 in last 24h
  const events: ComplianceEvent[] = []

  const dayMs = 24 * 60 * 60 * 1000
  const sixDaysAgo = now - 6 * dayMs

  // Routine events across the first 6 days
  for (let i = 0; i < 13; i++) {
    const progress = i / 12
    const ts = sixDaysAgo + progress * 6 * dayMs + (rng() - 0.5) * 4 * 60 * 60 * 1000

    events.push({
      signature: fakeSignature(rng, 1000 + i),
      agent: agentPubkey,
      hash: fakeHash(rng),
      severity: COMPLIANCE_PROFILES[i].severity,
      reason_code: COMPLIANCE_PROFILES[i].reason_code,
      timestamp: Math.round(ts),
      slot: 249000000 + i * 10000,
    })
  }

  // Two severity-3 events in the last 24 hours
  events.push({
    signature: fakeSignature(rng, 1013),
    agent: agentPubkey,
    hash: fakeHash(rng),
    severity: 3,
    reason_code: 'EMERGENCY_STOP_TRIGGERED',
    timestamp: now - 20 * 60 * 60 * 1000, // 20 hours ago
    slot: 249980000,
  })

  events.push({
    signature: fakeSignature(rng, 1014),
    agent: agentPubkey,
    hash: fakeHash(rng),
    severity: 3,
    reason_code: 'SAFETY_BOUNDARY_BREACH',
    timestamp: now - 14 * 60 * 60 * 1000, // 14 hours ago
    slot: 249995000,
  })

  return events.sort((a, b) => b.timestamp - a.timestamp)
}

// ---------------------------------------------------------------------------
// Balance: 1.45 SOL in lamports
// ---------------------------------------------------------------------------

export const MOCK_BALANCE_LAMPORTS = 1_450_000_000 // 1.45 SOL

export const MOCK_TX_COUNT = 347

// ---------------------------------------------------------------------------
// Convenience: generate everything in one call
// ---------------------------------------------------------------------------

export function generateMockData(agentPubkey?: string) {
  const agent =
    agentPubkey ??
    process.env.NEXT_PUBLIC_HARDWARE_WALLET ??
    FALLBACK_AGENT

  return {
    paymentHistory: generateMockPayments(agent),
    complianceHistory: generateMockCompliance(agent),
    balance: MOCK_BALANCE_LAMPORTS,
    txCount: MOCK_TX_COUNT,
  }
}
