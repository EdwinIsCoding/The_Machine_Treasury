'use client'

import { useEffect, useState } from 'react'

// SVG gauge geometry
const R = 96
const CX = 120
const CY = 125  // shifted down slightly so top arc is centered visually
const SIZE_W = 240
const SIZE_H = 240
const STROKE = 13
const CIRC = 2 * Math.PI * R
const ARC_FRAC = 0.75   // 270° sweep
const ARC_LEN = CIRC * ARC_FRAC
const GAP_LEN = CIRC - ARC_LEN
const ROTATION = 135    // rotates start point to 7:30 o'clock (bottom-left)

export function scoreColor(score: number): string {
  if (score >= 80) return '#22C55E'
  if (score >= 60) return '#14B8A6'
  if (score >= 40) return '#F59E0B'
  return '#EF4444'
}

interface ScoreGaugeProps {
  score: number  // 0-100
  grade: string
}

export function ScoreGauge({ score, grade }: ScoreGaugeProps) {
  // Animate from 0 on mount / on score change
  const [displayed, setDisplayed] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setDisplayed(score))
    return () => cancelAnimationFrame(id)
  }, [score])

  const color = scoreColor(score)
  const filled = (displayed / 100) * ARC_LEN

  // Track arc: full 270°
  const trackDash = `${ARC_LEN} ${GAP_LEN}`
  // Fill arc: proportional to score, then invisible gap
  const fillDash = `${filled} ${CIRC - filled}`

  const transform = `rotate(${ROTATION}, ${CX}, ${CY})`

  return (
    <div className="relative flex items-center justify-center">
      <svg
        width={SIZE_W}
        height={SIZE_H}
        viewBox={`0 0 ${SIZE_W} ${SIZE_H}`}
        aria-label={`Machine Credit Score: ${score} out of 100, grade ${grade}`}
      >
        <defs>
          <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke="#1E293B"
          strokeWidth={STROKE}
          strokeDasharray={trackDash}
          strokeLinecap="round"
          transform={transform}
        />

        {/* Score arc */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={fillDash}
          strokeLinecap="round"
          transform={transform}
          filter="url(#gauge-glow)"
          className="gauge-arc"
        />

        {/* Grade letter */}
        <text
          x={CX}
          y={CY - 10}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="52"
          fontWeight="700"
          fontFamily="var(--font-mono)"
          fill={color}
          style={{ filter: `drop-shadow(0 0 12px ${color}80)` }}
        >
          {grade}
        </text>

        {/* Score number */}
        <text
          x={CX}
          y={CY + 36}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="14"
          fontWeight="500"
          fontFamily="var(--font-mono)"
          fill="#94A3B8"
          letterSpacing="2"
        >
          {score}/100
        </text>
      </svg>
    </div>
  )
}
