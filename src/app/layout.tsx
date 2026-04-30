import type { Metadata } from 'next'
import { Fira_Code, Fira_Sans } from 'next/font/google'
import './globals.css'

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
})

const firaSans = Fira_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Machine Treasury — Autonomous Risk & Treasury for Machine Wallets',
  description:
    'AI-powered autonomous treasury manager and risk scorer for machine wallets on Solana. Built at Cursor × Briefcase FinTech London Hackathon 2026.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${firaCode.variable} ${firaSans.variable} h-full antialiased`}
    >
      <body className="h-full bg-[#0F172A] text-[#F8FAFC] font-sans overflow-hidden">
        {children}
      </body>
    </html>
  )
}
