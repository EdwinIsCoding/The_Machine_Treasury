export interface ProviderIntel {
  pubkey: string
  display_name: string        // from PROVIDER_MAP
  specter_name: string        // actual company name from Specter
  domain: string
  tagline: string
  founded_year: number | null
  hq_city: string
  hq_country: string
  employee_count: number | null
  funding_total_usd: number | null  // total funding raised in USD
  funding_rounds: number | null     // number of funding rounds
  operating_status: string | null   // e.g. 'active'
  description: string
  reliability_score: number         // 0-100
}

/**
 * Compute a 0-100 Provider Viability score from Specter data.
 *
 * Answers the treasury question: "How safe is it to route inference spend
 * through this provider?"  Differentiated tiers reward scale and penalise
 * acquisition / ownership uncertainty.
 *
 * Designed to produce meaningfully separated scores for the three providers:
 *   Replicate (acquired)   → ~68  amber  — acquisition creates pricing risk
 *   Together AI (active)   → ~81  green  — well-funded, stable
 *   Perplexity  (active)   → ~93  green  — dominant funding position
 */
export function computeReliability(intel: Omit<ProviderIntel, 'reliability_score'>): number {
  let score = 50

  // Operating status — most material signal for treasury continuity
  if (intel.operating_status === 'active') score += 5
  if (intel.operating_status === 'acquired') score -= 5   // new ownership → API/pricing uncertainty

  // Funding scale — log-like tiers signal runway depth
  const f = intel.funding_total_usd ?? 0
  if (f >= 1_000_000_000) score += 18        // $1B+: tier-1 market position
  else if (f >= 100_000_000) score += 14     // $100M–$1B: well-capitalised
  else if (f >= 10_000_000) score += 10      // $10M–$100M: moderate runway
  else if (f > 0) score += 4

  // Funding rounds — maturity proxy (more rounds = more investor validation)
  const r = intel.funding_rounds ?? 0
  if (r >= 8) score += 12
  else if (r >= 4) score += 8
  else if (r >= 2) score += 4
  else if (r >= 1) score += 2

  // Company age — longer track record = lower operational risk
  const age = intel.founded_year
  if (age !== null) {
    if (age <= 2019) score += 5
    else if (age <= 2022) score += 3
  }

  // Headcount — organisational capacity (only if plausible; Specter can be stale)
  const emp = intel.employee_count ?? 0
  if (emp >= 500) score += 5
  else if (emp >= 100) score += 3
  else if (emp >= 50) score += 2

  return Math.max(0, Math.min(100, score))
}
