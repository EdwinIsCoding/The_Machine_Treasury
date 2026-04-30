'use client'

import { useState, useEffect } from 'react'
import type { ProviderIntel } from '@/lib/specter/types'

interface EnrichResponse {
  providers: Record<string, ProviderIntel>
  enriched_at: number
  source: 'specter' | 'mock'
}

export interface UseSpecterIntelResult {
  providers: Record<string, ProviderIntel> | null
  isLoading: boolean
  source: 'specter' | 'mock' | null
}

export function useSpecterIntel(): UseSpecterIntelResult {
  const [providers, setProviders] = useState<Record<string, ProviderIntel> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [source, setSource] = useState<'specter' | 'mock' | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchIntel() {
      try {
        const res = await fetch('/api/specter/enrich')
        if (!res.ok) throw new Error(`Specter enrich returned ${res.status}`)
        const data: EnrichResponse = await res.json()
        if (!cancelled) {
          setProviders(data.providers)
          setSource(data.source)
        }
      } catch (err) {
        console.error('[useSpecterIntel]', err)
        // Leave providers as null — panel shows loading skeleton
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchIntel()
    return () => { cancelled = true }
  }, [])

  return { providers, isLoading, source }
}
