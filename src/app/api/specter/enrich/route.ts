/**
 * GET /api/specter/enrich
 *
 * Enriches the 3 known inference providers with Specter company intelligence.
 * Caches the result for 5 minutes to preserve Specter credits.
 * Falls back to hardcoded mock data if the API key is absent or any call fails.
 */

import { NextResponse } from 'next/server'
import type { ProviderIntel } from '@/lib/specter/types'
import { computeReliability } from '@/lib/specter/types'

// ---------------------------------------------------------------------------
// Provider mapping
// ---------------------------------------------------------------------------

const PROVIDER_MAP: Record<string, { displayName: string; specterQuery: string }> = {
  'Hoh7fqnGfuvpHzMhVEoP5K8qfcuVNSGFnJoLTBMLbdYw': { displayName: 'Replicate',    specterQuery: 'Replicate' },
  'GPdnT3tRBm6RaMz1E4PKBYvY7RdtNvb1KEmRsLBJJrqA': { displayName: 'Together AI',  specterQuery: 'Together AI' },
  '2noknFMELsRzWaFhpBrqJnxXmvZsQn1gGNmLuE5RL7E9': { displayName: 'Perplexity',   specterQuery: 'Perplexity' },
}

// ---------------------------------------------------------------------------
// In-process cache (5-min TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  providers: Record<string, ProviderIntel>
  source: 'specter' | 'mock'
  expiresAt: number
}

let _cache: CacheEntry | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

// ---------------------------------------------------------------------------
// Hardcoded fallback (used when SPECTER_API_KEY is absent or Specter is down)
// ---------------------------------------------------------------------------

function buildMockData(): Record<string, ProviderIntel> {
  const entries: Array<{ pubkey: string; data: Omit<ProviderIntel, 'reliability_score' | 'pubkey'> }> = [
    {
      pubkey: 'Hoh7fqnGfuvpHzMhVEoP5K8qfcuVNSGFnJoLTBMLbdYw',
      data: {
        display_name: 'Replicate', specter_name: 'Replicate',
        domain: 'replicate.com',
        tagline: 'Run AI in the cloud',
        founded_year: 2019, hq_city: 'San Francisco', hq_country: 'US',
        employee_count: 80, funding_total_usd: 60_000_000, funding_rounds: 3,
        operating_status: 'active',
        description: 'Replicate lets you run machine learning models in the cloud with a simple API.',
      },
    },
    {
      pubkey: 'GPdnT3tRBm6RaMz1E4PKBYvY7RdtNvb1KEmRsLBJJrqA',
      data: {
        display_name: 'Together AI', specter_name: 'Together AI',
        domain: 'together.ai',
        tagline: 'The AI acceleration cloud',
        founded_year: 2022, hq_city: 'San Francisco', hq_country: 'US',
        employee_count: 120, funding_total_usd: 228_000_000, funding_rounds: 4,
        operating_status: 'active',
        description: 'Together AI provides fast, scalable, and cost-effective AI inference infrastructure.',
      },
    },
    {
      pubkey: '2noknFMELsRzWaFhpBrqJnxXmvZsQn1gGNmLuE5RL7E9',
      data: {
        display_name: 'Perplexity AI', specter_name: 'Perplexity AI',
        domain: 'perplexity.ai',
        tagline: 'The answer engine',
        founded_year: 2022, hq_city: 'San Francisco', hq_country: 'US',
        employee_count: 100, funding_total_usd: 165_000_000, funding_rounds: 5,
        operating_status: 'active',
        description: 'Perplexity AI is an AI-powered answer engine that delivers real-time information.',
      },
    },
  ]

  const result: Record<string, ProviderIntel> = {}
  for (const { pubkey, data } of entries) {
    result[pubkey] = { pubkey, ...data, reliability_score: computeReliability({ pubkey, ...data }) }
  }
  return result
}

// ---------------------------------------------------------------------------
// Specter API helpers
// ---------------------------------------------------------------------------

const SPECTER_BASE = 'https://app.tryspecter.com/api/v1'

interface SpecterSearchResult {
  id: string
  name: string
  domain?: string
  hq?: { city?: string; country?: string }
  tagline?: string
  founded_year?: number
}

interface SpecterCompanyDetail {
  id: string
  // Specter detail endpoint uses organization_name, not name
  organization_name?: string
  name?: string
  website?: { domain?: string; url?: string }
  domain?: string
  description?: string
  tagline?: string
  founded_year?: number
  operating_status?: string
  employee_count?: number
  hq?: { city?: string; country?: string; state?: string }
  funding?: {
    // Specter uses total_funding_usd and round_count (not the names in the plan)
    total_funding_usd?: number
    total_funding_amount_usd?: number  // fallback alias
    round_count?: number
    no_of_funding_rounds?: number      // fallback alias
  }
}

async function specterSearch(query: string, apiKey: string): Promise<SpecterSearchResult | null> {
  const url = `${SPECTER_BASE}/companies/search?query=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: { 'X-API-Key': apiKey },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return null
  const data = await res.json() as SpecterSearchResult[]
  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

async function specterLookup(id: string, apiKey: string): Promise<SpecterCompanyDetail | null> {
  const res = await fetch(`${SPECTER_BASE}/companies/${encodeURIComponent(id)}`, {
    headers: { 'X-API-Key': apiKey },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return null
  return res.json() as Promise<SpecterCompanyDetail>
}

function buildProviderIntel(
  pubkey: string,
  displayName: string,
  detail: SpecterCompanyDetail,
): ProviderIntel {
  // Specter's detail endpoint uses organization_name; search uses name
  const specterName = detail.organization_name ?? detail.name ?? ''
  // Domain is nested under website.domain in the detail response
  const domain = detail.website?.domain ?? detail.domain ?? ''
  // Funding fields use different names than the hackathon plan specified
  const fundingTotal =
    detail.funding?.total_funding_usd ??
    detail.funding?.total_funding_amount_usd ??
    null
  const fundingRounds =
    detail.funding?.round_count ??
    detail.funding?.no_of_funding_rounds ??
    null

  const partial: Omit<ProviderIntel, 'reliability_score'> = {
    pubkey,
    display_name: displayName,
    specter_name: specterName,
    domain,
    tagline: detail.tagline ?? '',
    founded_year: detail.founded_year ?? null,
    hq_city: detail.hq?.city ?? '',
    hq_country: detail.hq?.country ?? '',
    employee_count: detail.employee_count ?? null,
    funding_total_usd: fundingTotal,
    funding_rounds: fundingRounds,
    operating_status: detail.operating_status ?? null,
    description: detail.description ?? '',
  }
  return { ...partial, reliability_score: computeReliability(partial) }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const bustCache = searchParams.get('bust') === '1'

  // Serve from cache if fresh
  if (!bustCache && _cache && Date.now() < _cache.expiresAt) {
    return NextResponse.json({
      providers: _cache.providers,
      enriched_at: _cache.expiresAt - CACHE_TTL_MS,
      source: _cache.source,
    })
  }

  const apiKey = process.env.SPECTER_API_KEY
  if (!apiKey) {
    const providers = buildMockData()
    return NextResponse.json({ providers, enriched_at: Date.now(), source: 'mock' })
  }

  try {
    const providers: Record<string, ProviderIntel> = {}

    for (const [pubkey, { displayName, specterQuery }] of Object.entries(PROVIDER_MAP)) {
      try {
        const searchResult = await specterSearch(specterQuery, apiKey)
        if (!searchResult) {
          // Fall back to mock for this provider
          const mock = buildMockData()
          providers[pubkey] = mock[pubkey]
          continue
        }

        const detail = await specterLookup(searchResult.id, apiKey)
        if (!detail) {
          const mock = buildMockData()
          providers[pubkey] = mock[pubkey]
          continue
        }

        providers[pubkey] = buildProviderIntel(pubkey, displayName, detail)
      } catch {
        // Per-provider fallback
        const mock = buildMockData()
        providers[pubkey] = mock[pubkey]
      }
    }

    const allFromSpecter = Object.values(providers).every(p => p.specter_name !== '')
    const source: 'specter' | 'mock' = allFromSpecter ? 'specter' : 'mock'

    _cache = { providers, source, expiresAt: Date.now() + CACHE_TTL_MS }

    return NextResponse.json({ providers, enriched_at: Date.now(), source })
  } catch (err) {
    console.error('[specter/enrich] fatal error:', err)
    const providers = buildMockData()
    return NextResponse.json({ providers, enriched_at: Date.now(), source: 'mock' })
  }
}
