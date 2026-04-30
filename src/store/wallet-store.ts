import { create } from 'zustand'
import type { PaymentEvent, ComplianceEvent } from '@/lib/solana/types'
import { loadWalletData, type DataSource } from '@/lib/data-source'
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
      const data = await loadWalletData(WALLET_PUBKEY)
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
