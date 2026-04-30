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
 * Compute a 0-100 reliability score from Specter data.
 * Higher = more reliable / established provider.
 */
export function computeReliability(intel: Omit<ProviderIntel, 'reliability_score'>): number {
  let score = 50

  if (intel.founded_year !== null && intel.founded_year <= 2020) score += 10
  if (intel.funding_rounds !== null && intel.funding_rounds >= 3) score += 15
  if (intel.funding_total_usd !== null && intel.funding_total_usd >= 10_000_000) score += 10
  if (intel.operating_status === 'active') score += 10
  if (intel.employee_count !== null && intel.employee_count >= 50) score += 5

  return Math.max(0, Math.min(100, score))
}
