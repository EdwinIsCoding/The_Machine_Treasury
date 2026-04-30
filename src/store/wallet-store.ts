import { create } from 'zustand'
import type { PaymentEvent, ComplianceEvent } from '@/lib/solana/types'
import { type DataSource } from '@/lib/data-source'
import { generateMockData } from '@/lib/mock/generator'

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface WalletState {
  paymentHistory: PaymentEvent[]
  complianceHistory: ComplianceEvent[]
  balance: number    // lamports
  txCount: number
  dataSource: DataSource
  fetchedAt: number | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Pre-populate with mock data so the first render always has content.
// refresh() will attempt Devnet and overwrite with live or fresh mock data.
// ---------------------------------------------------------------------------

const WALLET_PUBKEY = process.env.NEXT_PUBLIC_HARDWARE_WALLET ?? ''

const _seed = generateMockData(WALLET_PUBKEY || undefined)

export const useWalletStore = create<WalletState>()((set, get) => ({
  paymentHistory: _seed.paymentHistory,
  complianceHistory: _seed.complianceHistory,
  balance: _seed.balance,
  txCount: _seed.txCount,
  dataSource: 'mock' as DataSource,
  fetchedAt: Date.now(),
  isLoading: false,
  error: null,

  refresh: async () => {
    if (get().isLoading) return
    set({ isLoading: true, error: null })

    try {
      // Call our server-side API route to avoid browser rate limits on the
      // public Solana devnet RPC. The route caches results for 30 seconds.
      const params = WALLET_PUBKEY ? `?pubkey=${encodeURIComponent(WALLET_PUBKEY)}` : ''
      const res = await fetch(`/api/solana/wallet${params}`)
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json() as {
        paymentHistory: PaymentEvent[]
        complianceHistory: ComplianceEvent[]
        balance: number
        txCount: number
        source: DataSource
        fetchedAt: number
      }
      set({
        paymentHistory: data.paymentHistory,
        complianceHistory: data.complianceHistory,
        balance: data.balance,
        txCount: data.txCount,
        dataSource: data.source,
        fetchedAt: data.fetchedAt,
        isLoading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[wallet-store] refresh failed:', message)
      set({ isLoading: false, error: message })
    }
  },
}))
