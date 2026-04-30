# Machine Treasury

> Autonomous treasury management and risk scoring for machine wallets on Solana.

Built at the **Cursor × Briefcase FinTech London Hackathon**, April 2026.

Reads live on-chain data from Auxin Automata's deployed Solana Devnet program (`agentic_hardware_bridge`). All original code.

## What It Does

Machine Treasury is an AI-powered CFO for robot wallets. It monitors a machine wallet's on-chain payment and compliance history, computes a real-time risk score ("Machine Credit Score"), and runs an autonomous treasury agent that manages budget allocation with no human in the loop.

**Stack:** Next.js 14 · Tailwind · shadcn/ui · Recharts · Zustand · @solana/web3.js · Claude API

## Quick Start

```bash
cp .env.local.example .env.local   # fill in ANTHROPIC_API_KEY + wallet pubkey
npm install
npm run dev
```

## Environment

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Devnet RPC (default: `https://api.devnet.solana.com`) |
| `NEXT_PUBLIC_PROGRAM_ID` | Auxin program ID on Devnet |
| `NEXT_PUBLIC_HARDWARE_WALLET` | Demo hardware wallet public key |
| `ANTHROPIC_API_KEY` | Server-side only — Claude API key |

---

*Built at Cursor × Briefcase FinTech London Hackathon, April 2026. Reads live on-chain data from [Auxin Automata](https://github.com/Auxin-Automata)'s deployed Solana Devnet program.*
