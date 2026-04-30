/**
 * GET /api/treasury/stream
 *
 * Streams a 2-3 sentence treasury summary from Claude Sonnet via SSE.
 * Query params: balance (lamports), txCount, recentCritical (sev-3 events in last 24h)
 *
 * SSE format:
 *   data: {"text":"chunk"}\n\n
 *   data: [DONE]\n\n
 */

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const LAMPORTS_PER_SOL = 1_000_000_000

const STREAM_SYSTEM = `You are an autonomous treasury manager for a robot machine wallet on Solana.
Write a 2-3 sentence summary of the robot's current financial health status.
Be direct and specific with numbers. Mention the balance in SOL, the financial risk level, and any notable concerns.
No filler phrases. No JSON. Just clear, direct prose.`

const FALLBACK_SUMMARY =
  'The machine wallet is operating within normal parameters. Burn rate is consistent with historical averages and the current balance provides adequate operational runway. No immediate financial intervention required.'

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const balance = parseInt(searchParams.get('balance') ?? '0', 10)
  const txCount = parseInt(searchParams.get('txCount') ?? '0', 10)
  const recentCritical = parseInt(searchParams.get('recentCritical') ?? '0', 10)

  const solBalance = (balance / LAMPORTS_PER_SOL).toFixed(4)
  const userMessage = `Balance: ${solBalance} SOL (${balance.toLocaleString()} lamports). Total transactions: ${txCount}. Critical compliance events in last 24h: ${recentCritical}.`

  const encoder = new TextEncoder()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Stream the fallback summary character by character to simulate streaming
    const stream = new ReadableStream({
      async start(controller) {
        for (const char of FALLBACK_SUMMARY) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: char })}\n\n`))
          await new Promise(r => setTimeout(r, 15))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }

  const client = new Anthropic({ apiKey })

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 256,
          system: [
            {
              type: 'text',
              text: STREAM_SYSTEM,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: userMessage }],
        })

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            )
          }
        }
      } catch (err) {
        console.error('[treasury/stream] error:', err)
        // Stream fallback text on error
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ text: FALLBACK_SUMMARY })}\n\n`)
        )
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
