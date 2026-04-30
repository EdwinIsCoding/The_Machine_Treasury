/**
 * GET /api/solana/wallet
 *
 * Fetches wallet data server-side (Node.js, no CORS or browser rate limits)
 * and caches the result for 30 seconds. The browser wallet-store calls this
 * endpoint instead of hitting the Solana RPC directly.
 */

import type { NextRequest } from 'next/server'
import { loadWalletData, type WalletData } from '@/lib/data-source'

const CACHE_TTL_MS = 30_000

let _cache: { data: WalletData; expiresAt: number } | null = null

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pubkey =
    searchParams.get('pubkey') ??
    process.env.NEXT_PUBLIC_HARDWARE_WALLET ??
    ''

  const now = Date.now()
  const bustCache = searchParams.get('bust') === '1'

  if (!bustCache && _cache && _cache.expiresAt > now) {
    return Response.json({ ..._cache.data, cached: true })
  }

  const data = await loadWalletData(pubkey)
  _cache = { data, expiresAt: now + CACHE_TTL_MS }

  return Response.json({ ...data, cached: false })
}
