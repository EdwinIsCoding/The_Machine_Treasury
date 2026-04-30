/**
 * Unified data source.
 *
 * Strategy:
 *   1. Try Devnet with a hard 3-second wall-clock timeout.
 *   2. If Devnet is slow, unavailable, or returns no events → fall back to
 *      rich mock data that tells the demo story.
 *
 * The demo must NEVER show a loading spinner for more than 3 seconds.
 */

import type { PaymentEvent, ComplianceEvent } from '@/lib/solana/types'
import {
  fetchPaymentHistory,
  fetchComplianceHistory,
  fetchWalletBalance,
  fetchTransactionCount,
} from '@/lib/solana/fetcher'
import { generateMockData } from '@/lib/mock/generator'

export type DataSource = 'devnet' | 'mock'

export interface WalletData {
  paymentHistory: PaymentEvent[]
  complianceHistory: ComplianceEvent[]
  balance: number    // lamports
  txCount: number
  source: DataSource
  fetchedAt: number  // Date.now() when data was loaded
}

const DEVNET_TIMEOUT_MS = 3000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Devnet timeout after ${ms}ms`)), ms),
    ),
  ])
}

async function fetchFromDevnet(walletPubkey: string): Promise<WalletData> {
  // Run all four fetches concurrently; fail-fast if any rejects
  const [paymentHistory, complianceHistory, balance, txCount] = await Promise.all([
    fetchPaymentHistory(walletPubkey, 100),
    fetchComplianceHistory(walletPubkey, 50),
    fetchWalletBalance(walletPubkey),
    fetchTransactionCount(walletPubkey),
  ])

  // If the wallet has no on-chain events yet, treat as unavailable
  if (paymentHistory.length === 0 && complianceHistory.length === 0) {
    throw new Error('No on-chain events found for this wallet — falling back to mock')
  }

  return {
    paymentHistory,
    complianceHistory,
    balance,
    txCount,
    source: 'devnet',
    fetchedAt: Date.now(),
  }
}

export async function loadWalletData(walletPubkey: string): Promise<WalletData> {
  try {
    const data = await withTimeout(fetchFromDevnet(walletPubkey), DEVNET_TIMEOUT_MS)
    console.info('[data-source] DEVNET LIVE — loaded real on-chain data')
    return data
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.info(`[data-source] MOCK DATA — Devnet unavailable (${reason})`)

    const mock = generateMockData(walletPubkey)
    return {
      ...mock,
      source: 'mock',
      fetchedAt: Date.now(),
    }
  }
}
