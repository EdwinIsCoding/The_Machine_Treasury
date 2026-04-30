'use client'

import { useEffect, useMemo } from 'react'
import { useWalletStore } from '@/store/wallet-store'
import { useTreasuryAnalysis } from '@/hooks/useTreasuryAnalysis'
import { calculateRiskScore } from '@/lib/risk/scorer'
import { Header } from '@/components/dashboard/Header'
import { RiskScorePanel } from '@/components/dashboard/RiskScorePanel'
import { TreasuryPanel } from '@/components/dashboard/TreasuryPanel'
import { ActivityPanel } from '@/components/dashboard/ActivityPanel'
import { SpecterPanel } from '@/components/dashboard/SpecterPanel'
import { useSpecterIntel } from '@/hooks/useSpecterIntel'

const WALLET_PUBKEY = process.env.NEXT_PUBLIC_HARDWARE_WALLET ?? ''

// ---------------------------------------------------------------------------
// Column wrappers
// ---------------------------------------------------------------------------

function LeftColumn({ children }: { children: React.ReactNode }) {
  return (
    <aside className="w-[300px] shrink-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-5 py-5">
      {children}
    </aside>
  )
}

function CentreColumn({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-5 py-5">
      {children}
    </main>
  )
}

function RightColumn({ children }: { children: React.ReactNode }) {
  return (
    <aside className="w-[320px] shrink-0 flex flex-col min-h-0 overflow-hidden px-5 py-5">
      {children}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const {
    paymentHistory,
    complianceHistory,
    balance,
    txCount,
    dataSource,
    fetchedAt,
    isLoading,
    refresh,
  } = useWalletStore()

  const { providers: specterProviders, isLoading: specterLoading, source: specterSource } = useSpecterIntel()
  const { analysis, scanResult, isAnalyzing, isStreaming, streamedSummary } = useTreasuryAnalysis({
    providerIntel: specterProviders,
  })

  // Compute provider spend concentration from payment history (links Auxin → Specter)
  const spendByPubkey = useMemo(() => {
    const totals: Record<string, number> = {}
    let grandTotal = 0
    for (const p of paymentHistory) {
      totals[p.provider] = (totals[p.provider] ?? 0) + p.lamports
      grandTotal += p.lamports
    }
    if (grandTotal === 0) return {}
    const pct: Record<string, number> = {}
    for (const [k, v] of Object.entries(totals)) {
      pct[k] = Math.round((v / grandTotal) * 100)
    }
    return pct
  }, [paymentHistory])

  // Compute risk score client-side from store data
  const riskReport = useMemo(() => {
    if (!paymentHistory.length && !complianceHistory.length) return null
    try {
      return calculateRiskScore({ paymentHistory, complianceHistory, balance, txCount })
    } catch {
      return null
    }
  }, [paymentHistory, complianceHistory, balance, txCount])

  // Initial fetch on mount + 30s auto-refresh
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div className="flex flex-col h-screen min-h-0 bg-[#0B1524]">
      {/* Header */}
      <Header
        walletPubkey={WALLET_PUBKEY}
        balance={balance}
        dataSource={dataSource}
        fetchedAt={fetchedAt}
        isLoading={isLoading}
        onRefresh={refresh}
        isAnalyzing={isAnalyzing}
        isStreaming={isStreaming}
        lastScannedAt={scanResult?.scanned_at ?? null}
      />

      {/* 3-column layout */}
      <div className="flex flex-1 min-h-0 divide-x divide-[#1E2D3D]">

        {/* Left — Machine Credit Score */}
        <LeftColumn>
          <RiskScorePanel report={riskReport} />
        </LeftColumn>

        {/* Centre — AI Treasury Analysis */}
        <CentreColumn>
          <TreasuryPanel
            analysis={analysis}
            isAnalyzing={isAnalyzing}
            scanResult={scanResult}
            isStreaming={isStreaming}
            streamedSummary={streamedSummary}
          />
          <SpecterPanel
            providers={specterProviders}
            isLoading={specterLoading}
            source={specterSource}
            spendByPubkey={spendByPubkey}
          />
        </CentreColumn>

        {/* Right — Live Activity */}
        <RightColumn>
          <ActivityPanel
            payments={paymentHistory}
            compliance={complianceHistory}
            providerIntel={specterProviders}
          />
        </RightColumn>
      </div>
    </div>
  )
}
