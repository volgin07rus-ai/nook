interface ProgressRingProps {
  /** 0–100 */
  value: number
  size?: number
  thickness?: number
  caption?: string
}

export function ProgressRing({ value, size = 116, thickness = 6, caption }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
          style={{ transition: 'stroke-dasharray 220ms var(--ease-out-quart)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="tnum text-xl leading-none font-semibold text-fg">{clamped}%</span>
        {caption && <span className="text-xs text-fg-3">{caption}</span>}
      </div>
    </div>
  )
}
