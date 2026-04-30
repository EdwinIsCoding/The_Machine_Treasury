'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWalletStore } from '@/store/wallet-store'
import type { TreasuryAnalysis, ScanResult } from '@/lib/treasury/types'
import type { ProviderIntel } from '@/lib/specter/types'

const ANALYZE_INTERVAL_MS = 30_000
const SCAN_INTERVAL_MS = 10_000

export interface UseTreasuryAnalysisResult {
  analysis: TreasuryAnalysis | null
  scanResult: ScanResult | null
  isAnalyzing: boolean
  isStreaming: boolean
  streamedSummary: string
  error: string | null
  refresh: () => void
}

interface UseTreasuryAnalysisOptions {
  providerIntel?: Record<string, ProviderIntel> | null
}

export function useTreasuryAnalysis(options?: UseTreasuryAnalysisOptions): UseTreasuryAnalysisResult {
  const providerIntel = options?.providerIntel
  const paymentHistory   = useWalletStore(s => s.paymentHistory)
  const complianceHistory = useWalletStore(s => s.complianceHistory)
  const balance          = useWalletStore(s => s.balance)
  const txCount          = useWalletStore(s => s.txCount)
  const fetchedAt        = useWalletStore(s => s.fetchedAt)
  const dataIsLoading    = useWalletStore(s => s.isLoading)

  const [analysis, setAnalysis]           = useState<TreasuryAnalysis | null>(null)
  const [scanResult, setScanResult]       = useState<ScanResult | null>(null)
  const [isAnalyzing, setIsAnalyzing]     = useState(false)
  const [isStreaming, setIsStreaming]      = useState(false)
  const [streamedSummary, setStreamedSummary] = useState('')
  const [error, setError]                 = useState<string | null>(null)

  const analyzeInFlight = useRef(false)
  const streamAbort     = useRef<AbortController | null>(null)

  // ---------------------------------------------------------------------------
  // Stream the treasury summary via SSE after a successful analysis
  // ---------------------------------------------------------------------------

  const streamSummary = useCallback(async () => {
    // Abort any previous stream
    streamAbort.current?.abort()
    const controller = new AbortController()
    streamAbort.current = controller

    const recentCritical = complianceHistory.filter(
      e => e.severity >= 3 && e.timestamp > Date.now() - 86_400_000
    ).length

    const params = new URLSearchParams({
      balance: balance.toString(),
      txCount: txCount.toString(),
      recentCritical: recentCritical.toString(),
    })

    setIsStreaming(true)
    setStreamedSummary('')

    try {
      const res = await fetch(`/api/treasury/stream?${params}`, {
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        setIsStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            setIsStreaming(false)
            return
          }
          try {
            const { text } = JSON.parse(data) as { text: string }
            accumulated += text
            setStreamedSummary(accumulated)
          } catch {
            // ignore malformed chunks
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[useTreasuryAnalysis] stream error:', err)
      }
    } finally {
      setIsStreaming(false)
    }
  }, [balance, txCount, complianceHistory])

  // ---------------------------------------------------------------------------
  // Deep analysis (Sonnet, every 30 s or on urgent scan trigger)
  // ---------------------------------------------------------------------------

  const analyze = useCallback(async () => {
    if (dataIsLoading || paymentHistory.length === 0) return
    if (analyzeInFlight.current) return

    analyzeInFlight.current = true
    setIsAnalyzing(true)
    setError(null)

    try {
      const res = await fetch('/api/treasury/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentHistory, complianceHistory, balance, txCount,
          ...(providerIntel ? { providerIntel } : {}),
        }),
      })

      if (!res.ok) throw new Error(`API returned ${res.status}`)

      const data: TreasuryAnalysis = await res.json()
      setAnalysis(data)
      setError(null)

      // Kick off streaming summary in parallel
      streamSummary()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed'
      console.error('[useTreasuryAnalysis]', msg)
      setError(msg)
    } finally {
      setIsAnalyzing(false)
      analyzeInFlight.current = false
    }
  }, [paymentHistory, complianceHistory, balance, txCount, dataIsLoading, streamSummary, providerIntel])

  // ---------------------------------------------------------------------------
  // Fast scan (Haiku, every 10 s)
  // ---------------------------------------------------------------------------

  const scan = useCallback(async () => {
    if (dataIsLoading || paymentHistory.length === 0) return

    try {
      const res = await fetch('/api/treasury/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentHistory, complianceHistory, balance }),
      })

      if (!res.ok) return

      const result: ScanResult = await res.json()
      setScanResult(result)

      // Urgency routing: critical scan → trigger deep analysis immediately
      if (result.has_critical && !analyzeInFlight.current) {
        analyze()
      }
    } catch (err) {
      console.error('[useTreasuryAnalysis] scan error:', err)
    }
  }, [paymentHistory, complianceHistory, balance, dataIsLoading, analyze])

  // Trigger analysis when wallet data arrives
  useEffect(() => {
    if (fetchedAt !== null && !dataIsLoading) {
      analyze()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedAt, dataIsLoading])

  // 30 s deep analysis interval
  useEffect(() => {
    const id = setInterval(analyze, ANALYZE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [analyze])

  // 10 s fast scan interval
  useEffect(() => {
    const id = setInterval(scan, SCAN_INTERVAL_MS)
    return () => clearInterval(id)
  }, [scan])

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      streamAbort.current?.abort()
    }
  }, [])

  return {
    analysis,
    scanResult,
    isAnalyzing,
    isStreaming,
    streamedSummary,
    error,
    refresh: analyze,
  }
}
