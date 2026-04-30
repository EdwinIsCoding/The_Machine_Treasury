import { create } from 'zustand'
import type { PaymentEvent, ComplianceEvent } from '@/lib/solana/types'
import { loadWalletData, type DataSource } from '@/lib/data-source'

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface WalletState {
  // Data
  paymentHistory: PaymentEvent[]
  complianceHistory: ComplianceEvent[]
  balance: number    // lamports
  txCount: number
  dataSource: DataSource
  fetchedAt: number | null

  // UI state
  isLoading: boolean
  error: string | null

  // Actions
  refresh: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const WALLET_PUBKEY =
  process.env.NEXT_PUBLIC_HARDWARE_WALLET ?? ''

export const useWalletStore = create<WalletState>()((set, get) => ({
  paymentHistory: [],
  complianceHistory: [],
  balance: 0,
  txCount: 0,
  dataSource: 'mock',
  fetchedAt: null,
  isLoading: false,
  error: null,

  refresh: async () => {
    // Prevent concurrent refreshes
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
      // loadWalletData never throws (mock always succeeds), but guard anyway
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[wallet-store] refresh failed:', message)
      set({ isLoading: false, error: message })
    }
  },
}))
