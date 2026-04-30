export interface PaymentEvent {
  signature: string
  agent: string     // base58 pubkey — the machine wallet
  provider: string  // base58 pubkey — the inference provider
  lamports: number
  timestamp: number // Unix ms
  slot: number
}

export interface ComplianceEvent {
  signature: string
  agent: string     // base58 pubkey
  hash: string      // hex-encoded safety telemetry hash
  severity: 0 | 1 | 2 | 3
  reason_code: string
  timestamp: number // Unix ms
  slot: number
}

export interface WalletSummary {
  pubkey: string
  balance: number  // lamports
  txCount: number
}
