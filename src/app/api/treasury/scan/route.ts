/**
 * POST /api/treasury/scan
 *
 * Fast anomaly scanner using Claude Haiku. Runs every 10 s on the client.
 * Returns a ScanResult — does not cache (always fresh).
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { PaymentEvent, ComplianceEvent } from '@/lib/solana/types'
import type { ScanResult } from '@/lib/treasury/types'

interface ScanRequest {
  paymentHistory: PaymentEvent[]
  complianceHistory: ComplianceEvent[]
  balance: number
}

const FALLBACK: ScanResult = {
  has_critical: false,
  alert: null,
  severity: 'none',
  scan_ms: 0,
  scanned_at: 0,
}

const SCAN_SYSTEM = `You are a financial anomaly scanner for machine wallets on Solana. Scan the wallet data and return ONLY this JSON — no markdown, no explanation:
{ "has_critical": boolean, "alert": string | null, "severity": "none" | "watch" | "alert" | "critical" }

has_critical is true ONLY if ANY of these conditions hold:
- Runway < 6 hours
- 2 or more severity-3 compliance events in the last 4 hours
- 24h burn rate > 3x the 7-day average burn rate

severity: "critical" if has_critical, "alert" if one threshold is approaching (runway < 24h, or 1 sev-3 in 4h), "watch" if minor drift, "none" otherwise.
alert: one short sentence describing the issue, or null if none.`

function buildScanContext(data: ScanRequest): string {
  const { paymentHistory, complianceHistory, balance } = data
  const now = Date.now()
  const MS = { h4: 4 * 3_600_000, h24: 86_400_000, d7: 7 * 86_400_000 }

  const last24h = paymentHistory.filter(p => p.timestamp > now - MS.h24)
  const last7d  = paymentHistory.filter(p => p.timestamp > now - MS.d7)

  const spent24h = last24h.reduce((s, p) => s + p.lamports, 0)
  const spent7d  = last7d.reduce((s, p) => s + p.lamports, 0)
  const burn24h  = spent24h / 24
  const burn7d   = spent7d / (7 * 24)

  const runway = burn24h > 0 ? balance / burn24h : 9999

  const sev3_4h = complianceHistory.filter(
    e => e.severity >= 3 && e.timestamp > now - MS.h4
  ).length

  return [
    `Balance: ${balance.toLocaleString()} lamports`,
    `Runway: ${runway.toFixed(1)} hours at current burn rate`,
    `24h burn rate: ${burn24h.toFixed(0)} lam/h  |  7-day avg: ${burn7d.toFixed(0)} lam/h`,
    `Severity-3 events in last 4h: ${sev3_4h}`,
  ].join('\n')
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ScanRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ...FALLBACK, scanned_at: Date.now() })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ...FALLBACK, scanned_at: Date.now() })
  }

  const t0 = Date.now()

  try {
    const client = new Anthropic({ apiKey })
    const context = buildScanContext(body)

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      system: SCAN_SYSTEM,
      messages: [{ role: 'user', content: context }],
    })

    const scan_ms = Date.now() - t0

    const raw = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ ...FALLBACK, scan_ms, scanned_at: Date.now() })
    }

    const p = parsed as Record<string, unknown>
    const result: ScanResult = {
      has_critical: typeof p.has_critical === 'boolean' ? p.has_critical : false,
      alert: typeof p.alert === 'string' ? p.alert : null,
      severity: (['none', 'watch', 'alert', 'critical'] as const).includes(p.severity as never)
        ? (p.severity as ScanResult['severity'])
        : 'none',
      scan_ms,
      scanned_at: Date.now(),
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[treasury/scan] error:', err)
    return NextResponse.json({ ...FALLBACK, scan_ms: Date.now() - t0, scanned_at: Date.now() })
  }
}
