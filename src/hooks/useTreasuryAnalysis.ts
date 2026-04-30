'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWalletStore } from '@/store/wallet-store'
import type { TreasuryAnalysis } from '@/lib/treasury/types'

const AUTO_REFRESH_MS = 30_000

export interface UseTreasuryAnalysisResult {
  analysis: TreasuryAnalysis | null
  isAnalyzing: boolean
  error: string | null
  refresh: () => void
}

export function useTreasuryAnalysis(): UseTreasuryAnalysisResult {
  // Subscribe to individual store fields to avoid spurious re-renders
  const paymentHistory = useWalletStore(s => s.paymentHistory)
  const complianceHistory = useWalletStore(s => s.complianceHistory)
  const balance = useWalletStore(s => s.balance)
  const txCount = useWalletStore(s => s.txCount)
  const fetchedAt = useWalletStore(s => s.fetchedAt)
  const dataIsLoading = useWalletStore(s => s.isLoading)

  const [analysis, setAnalysis] = useState<TreasuryAnalysis | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prevent concurrent calls
  const inFlight = useRef(false)

  const analyze = useCallback(async () => {
    // Don't call while wallet data is still loading or if no data yet
    if (dataIsLoading || paymentHistory.length === 0) return
    if (inFlight.current) return

    inFlight.current = true
    setIsAnalyzing(true)
    setError(null)

    try {
      const res = await fetch('/api/treasury/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentHistory, complianceHistory, balance, txCount }),
      })

      if (!res.ok) {
        throw new Error(`API returned ${res.status}`)
      }

      const data: TreasuryAnalysis = await res.json()
      setAnalysis(data)
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed'
      console.error('[useTreasuryAnalysis]', msg)
      setError(msg)
      // Don't clear existing analysis — keep showing stale data rather than nothing
    } finally {
      setIsAnalyzing(false)
      inFlight.current = false
    }
  }, [paymentHistory, complianceHistory, balance, txCount, dataIsLoading])

  // Trigger analysis whenever wallet data is refreshed
  useEffect(() => {
    if (fetchedAt !== null && !dataIsLoading) {
      analyze()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedAt, dataIsLoading])

  // Auto-refresh every 30 seconds (aligns with server-side cache TTL)
  useEffect(() => {
    const id = setInterval(analyze, AUTO_REFRESH_MS)
    return () => clearInterval(id)
  }, [analyze])

  return {
    analysis,
    isAnalyzing,
    error,
    refresh: analyze,
  }
}
