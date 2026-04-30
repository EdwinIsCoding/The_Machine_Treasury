export interface AnomalyFlag {
  description: string
  severity: number   // 0-3
  timestamp: string  // ISO 8601
}

export interface RecommendedAction {
  action: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  reasoning: string
}

export interface BudgetAllocation {
  inference: number  // percentage, e.g. 70
  reserve: number
  buffer: number
}

export type RunwayStatus = 'healthy' | 'warning' | 'critical'
export type AnalysisSource = 'claude' | 'heuristic'

export interface TreasuryAnalysis {
  burn_rate_per_hour: number         // lamports/hour
  runway_hours: number
  runway_status: RunwayStatus
  budget_allocation: BudgetAllocation
  recommended_actions: RecommendedAction[]
  anomaly_flags: AnomalyFlag[]
  summary: string                    // 2-3 sentences
  // Metadata (added server-side, not from Claude)
  computed_at: number                // Date.now()
  source: AnalysisSource
}
