import type { PaymentEvent, ComplianceEvent } from '@/lib/solana/types'

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'
export type Trend = 'improving' | 'stable' | 'declining'

export interface TrendPoint {
  date: string   // YYYY-MM-DD
  score: number  // 0-100
}

export interface DimensionScore {
  score: number
  weight: number
  factors: string[]  // human-readable explanation of each sub-score
}

export interface RiskBreakdown {
  financial_health:      DimensionScore & { weight: 0.30 }
  operational_stability: DimensionScore & { weight: 0.25 }
  compliance_record:     DimensionScore & { weight: 0.25 }
  provider_diversity:    DimensionScore & { weight: 0.20 }
}

export interface RiskReport {
  overall_score: number    // 0-100, higher = healthier
  grade: Grade
  breakdown: RiskBreakdown
  trend: Trend
  trend_data: TrendPoint[] // last 7 days, one point per day
}

// Input type expected by the scorer
export interface WalletData {
  paymentHistory: PaymentEvent[]
  complianceHistory: ComplianceEvent[]
  balance: number   // lamports
  txCount: number
}
