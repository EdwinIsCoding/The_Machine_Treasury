import { PublicKey } from '@solana/web3.js'
import { getConnection } from './connection'
import type { PaymentEvent, ComplianceEvent } from './types'

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
      const reason_code = r.string()
      const timestamp = r.i64() * 1000
      return { type: 'compliance', data: { agent, hash, severity, reason_code, timestamp } }
    } catch {
      return null
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Public fetch functions
// ---------------------------------------------------------------------------

export async function fetchPaymentHistory(
  walletPubkey: string,
  limit = 100,
): Promise<PaymentEvent[]> {
  const conn = getConnection()
  const pubkey = new PublicKey(walletPubkey)
  const discs = await getDiscriminators()

  const sigInfos = await conn.getSignaturesForAddress(pubkey, { limit: limit * 3 })
  const sigs = sigInfos.map(s => s.signature)

  // Batch-fetch all transactions in a single RPC call
  const txs = await conn.getParsedTransactions(sigs, {
    maxSupportedTransactionVersion: 0,
  })

  const events: PaymentEvent[] = []

  for (let i = 0; i < txs.length && events.length < limit; i++) {
    const tx = txs[i]
    if (!tx?.meta?.logMessages) continue

    for (const log of tx.meta.logMessages) {
      const parsed = parseLogLine(log, discs)
      if (parsed?.type === 'payment') {
        events.push({ signature: sigs[i], slot: sigInfos[i].slot, ...parsed.data })
        break // one payment event per transaction
      }
    }
  }

  return events.sort((a, b) => b.timestamp - a.timestamp)
}

export async function fetchComplianceHistory(
  walletPubkey: string,
  limit = 50,
): Promise<ComplianceEvent[]> {
  const conn = getConnection()
  const pubkey = new PublicKey(walletPubkey)
  const discs = await getDiscriminators()

  const sigInfos = await conn.getSignaturesForAddress(pubkey, { limit: 1000 })
  const sigs = sigInfos.map(s => s.signature)

  const txs = await conn.getParsedTransactions(sigs, {
    maxSupportedTransactionVersion: 0,
  })

  const events: ComplianceEvent[] = []

  for (let i = 0; i < txs.length && events.length < limit; i++) {
    const tx = txs[i]
    if (!tx?.meta?.logMessages) continue

    for (const log of tx.meta.logMessages) {
      const parsed = parseLogLine(log, discs)
      if (parsed?.type === 'compliance') {
        events.push({ signature: sigs[i], slot: sigInfos[i].slot, ...parsed.data })
        break
      }
    }
  }

  return events.sort((a, b) => b.timestamp - a.timestamp)
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
