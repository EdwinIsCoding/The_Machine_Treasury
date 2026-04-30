import { PublicKey } from '@solana/web3.js'
import { getConnection } from './connection'
import type { PaymentEvent, ComplianceEvent } from './types'

// ---------------------------------------------------------------------------
// reason_code u16 → human-readable label
// The on-chain ComplianceEvent stores reason_code as a u16 enum variant.
// ---------------------------------------------------------------------------

const REASON_CODE_MAP: Record<number, string> = {
  0:  'SENSOR_NOMINAL',
  1:  'HEALTH_CHECK_PASSED',
  2:  'JOINT_TEMP_ELEVATED',
  3:  'PAYLOAD_NEAR_LIMIT',
  4:  'LATENCY_SPIKE',
  5:  'SPEED_LIMIT_EXCEEDED',
  6:  'THERMAL_WARNING',
  7:  'FORCE_THRESHOLD',
  8:  'EMERGENCY_STOP_TRIGGERED',
  9:  'SAFETY_BOUNDARY_BREACH',
  10: 'JOINT_CALIBRATED',
  11: 'POWER_SUPPLY_LOW',
  12: 'COMMUNICATION_TIMEOUT',
}

// ---------------------------------------------------------------------------
// Anchor event discriminators — sha256("event:<Name>")[0:8]
// Computed once and cached; uses the Web Crypto API (browser + Node 15+).
// ---------------------------------------------------------------------------

let _discs: { payment: Uint8Array; compliance: Uint8Array } | null = null

async function getDiscriminators() {
  if (_discs) return _discs
  const enc = new TextEncoder()
  const digest = async (label: string) => {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(`event:${label}`))
    return new Uint8Array(buf, 0, 8)
  }
  _discs = {
    payment: await digest('ComputePaymentEvent'),
    compliance: await digest('ComplianceEvent'),
  }
  return _discs
}

function discMatch(data: Uint8Array, disc: Uint8Array): boolean {
  for (let i = 0; i < 8; i++) if (data[i] !== disc[i]) return false
  return true
}

// ---------------------------------------------------------------------------
// Minimal borsh decoder for our two event structs
// ---------------------------------------------------------------------------

class BorshReader {
  private buf: Uint8Array
  private pos: number

  constructor(buf: ArrayBufferLike, offset = 0) {
    this.buf = new Uint8Array(buf)
    this.pos = offset
  }

  u8(): number {
    return this.buf[this.pos++]
  }

  /** u64 as a JS number — safe for lamport values < 2^53 */
  u64(): number {
    const lo = this.u32le()
    const hi = this.u32le()
    return hi * 0x1_0000_0000 + lo
  }

  /** i64 as a JS number — safe for Unix timestamps */
  i64(): number {
    const lo = this.u32le()
    const hi = this.u32le() | 0  // reinterpret uint32 as int32
    return hi * 0x1_0000_0000 + lo
  }

  /** u16 little-endian */
  u16(): number {
    const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8)
    this.pos += 2
    return v >>> 0
  }

  private u32le(): number {
    const v =
      this.buf[this.pos] |
      (this.buf[this.pos + 1] << 8) |
      (this.buf[this.pos + 2] << 16) |
      (this.buf[this.pos + 3] << 24)
    this.pos += 4
    return v >>> 0
  }

  pubkey(): string {
    const bytes = this.buf.slice(this.pos, this.pos + 32)
    this.pos += 32
    return new PublicKey(bytes).toBase58()
  }

  string(): string {
    const len = this.u32le()
    const bytes = this.buf.slice(this.pos, this.pos + len)
    this.pos += len
    return new TextDecoder().decode(bytes)
  }
}

// ---------------------------------------------------------------------------
// Log line parser
// ---------------------------------------------------------------------------

type ParsedEvent =
  | { type: 'payment'; data: Omit<PaymentEvent, 'signature' | 'slot'> }
  | { type: 'compliance'; data: Omit<ComplianceEvent, 'signature' | 'slot'> }

function parseLogLine(
  line: string,
  discs: { payment: Uint8Array; compliance: Uint8Array },
): ParsedEvent | null {
  if (!line.startsWith('Program data: ')) return null
  const b64 = line.slice('Program data: '.length).trim()

  let bytes: Uint8Array
  try {
    const binary = atob(b64)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  } catch {
    return null
  }

  if (bytes.length < 8) return null

  if (discMatch(bytes, discs.payment)) {
    try {
      const r = new BorshReader(bytes.buffer, 8)
      const agent = r.pubkey()
      const provider = r.pubkey()
      const lamports = r.u64()
      const timestamp = r.i64() * 1000 // seconds → ms
      return { type: 'payment', data: { agent, provider, lamports, timestamp } }
    } catch {
      return null
    }
  }

  if (discMatch(bytes, discs.compliance)) {
    try {
      const r = new BorshReader(bytes.buffer, 8)
      const agent = r.pubkey()
      const hash = r.string()
      const severity = r.u8() as 0 | 1 | 2 | 3
      const reason_code_num = r.u16()
      const reason_code = REASON_CODE_MAP[reason_code_num] ?? `CODE_${reason_code_num}`
      const timestamp = r.i64() * 1000
      return { type: 'compliance', data: { agent, hash, severity, reason_code, timestamp } }
    } catch {
      return null
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Shared recent-events fetcher
//
// Fetches transactions SEQUENTIALLY (not batched) to avoid the 429 rate limit
// on the public Solana devnet RPC. getParsedTransactions fires one HTTP request
// per transaction even in "batch" mode — sequential individual getTransaction
// calls are rate-limit-friendly and reliably succeed.
// ---------------------------------------------------------------------------

const RECENT_TX_LIMIT = 5  // 5 sequential getTransaction calls ≈ 1.5s total

interface RecentEvents {
  payments: PaymentEvent[]
  compliance: ComplianceEvent[]
}

export async function fetchRecentEvents(walletPubkey: string): Promise<RecentEvents> {
  const conn = getConnection()
  const pubkey = new PublicKey(walletPubkey)
  const discs = await getDiscriminators()

  // Single RPC call to get the most recent signatures
  const sigInfos = await conn.getSignaturesForAddress(pubkey, {
    limit: RECENT_TX_LIMIT,
  })

  const payments: PaymentEvent[] = []
  const compliance: ComplianceEvent[] = []

  // Fetch each transaction sequentially to stay within rate limits
  for (let i = 0; i < sigInfos.length; i++) {
    const sig = sigInfos[i].signature
    try {
      const tx = await conn.getParsedTransaction(sig, {
        maxSupportedTransactionVersion: 0,
      })
      if (!tx?.meta?.logMessages) continue

      for (const log of tx.meta.logMessages) {
        const parsed = parseLogLine(log, discs)
        if (parsed?.type === 'payment') {
          payments.push({ signature: sig, slot: sigInfos[i].slot, ...parsed.data })
          break
        }
        if (parsed?.type === 'compliance') {
          compliance.push({ signature: sig, slot: sigInfos[i].slot, ...parsed.data })
          break
        }
      }
    } catch {
      // Skip individual transaction fetch errors — we still return what we got
    }
  }

  return {
    payments: payments.sort((a, b) => b.timestamp - a.timestamp),
    compliance: compliance.sort((a, b) => b.timestamp - a.timestamp),
  }
}

// Kept for backwards-compatibility with any direct callers
export async function fetchPaymentHistory(
  walletPubkey: string,
  _limit = 100,
): Promise<PaymentEvent[]> {
  const { payments } = await fetchRecentEvents(walletPubkey)
  return payments
}

export async function fetchComplianceHistory(
  walletPubkey: string,
  _limit = 50,
): Promise<ComplianceEvent[]> {
  const { compliance } = await fetchRecentEvents(walletPubkey)
  return compliance
}

export async function fetchWalletBalance(walletPubkey: string): Promise<number> {
  const conn = getConnection()
  return conn.getBalance(new PublicKey(walletPubkey))
}

export async function fetchTransactionCount(walletPubkey: string): Promise<number> {
  const conn = getConnection()
  const sigs = await conn.getSignaturesForAddress(new PublicKey(walletPubkey), {
    limit: 1000,
  })
  return sigs.length
}
