import { useEffect, useState } from 'react'

export default function ScoreBar({ score, delay = 0 }) {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setWidth(score * 100), delay * 1000 + 100)
    return () => clearTimeout(timer)
  }, [score, delay])

  const color =
    score >= 0.7 ? '#CCFF00' :
    score >= 0.5 ? '#99cc00' : '#444444'

  return (
    <div className="flex items-center gap-3 min-w-[120px]">
      <div className="score-track flex-1">
        <div
          className="score-fill"
          style={{ width: `${width}%`, background: color, transition: `width 0.6s ease-out ${delay}s` }}
        />
      </div>
      <span
        className="font-mono text-xs tabular-nums"
        style={{ color, minWidth: '44px', textAlign: 'right' }}
      >
        {score.toFixed(4)}
      </span>
    </div>
  )
}
