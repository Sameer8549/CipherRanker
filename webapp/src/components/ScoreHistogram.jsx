// ScoreHistogram.jsx — Canvas score distribution histogram

import { useEffect, useRef } from 'react'

export default function ScoreHistogram({ results }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !results?.length) return

    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth  || 400
    const H = 96
    canvas.width  = W * dpr
    canvas.height = H * dpr
    canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    // Build 20 bins [0, 0.05, 0.10, … 1.0]
    const BINS = 20
    const bins = new Array(BINS).fill(0)
    for (const r of results) {
      const idx = Math.min(Math.floor(r.score * BINS), BINS - 1)
      bins[idx]++
    }
    const maxBin = Math.max(...bins, 1)

    const padL = 4, padR = 4, padT = 10, padB = 18
    const plotW = W - padL - padR
    const plotH = H - padT - padB
    const barW  = plotW / BINS

    ctx.clearRect(0, 0, W, H)

    // Bars
    bins.forEach((count, i) => {
      const bh = (count / maxBin) * plotH
      const x  = padL + i * barW
      const y  = padT + plotH - bh
      const score = (i + 0.5) / BINS

      // Colour gradient: red → amber → lime
      const color =
        score >= 0.70 ? '#CCFF00' :
        score >= 0.50 ? '#99cc00' :
        score >= 0.30 ? '#F0883E' : '#444444'

      ctx.fillStyle = count > 0 ? color : '#1f1f1f'
      ctx.fillRect(x + 1, y, barW - 2, bh)
    })

    // X-axis labels
    ctx.fillStyle = '#444444'
    ctx.font = `9px Inter, sans-serif`
    ctx.textAlign = 'center'
    for (const pct of [0, 0.25, 0.5, 0.75, 1.0]) {
      const x = padL + pct * plotW
      ctx.fillText(pct.toFixed(2), x, H - 4)
    }

    // Median line
    const scores  = results.map(r => r.score).sort((a, b) => a - b)
    const median  = scores[Math.floor(scores.length / 2)]
    const mx = padL + median * plotW
    ctx.strokeStyle = 'rgba(204,255,0,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(mx, padT)
    ctx.lineTo(mx, padT + plotH)
    ctx.stroke()
    ctx.setLineDash([])

    // Median label
    ctx.fillStyle = '#CCFF00'
    ctx.font = `bold 8px "JetBrains Mono", monospace`
    ctx.textAlign = mx > W * 0.7 ? 'right' : 'left'
    ctx.fillText(`med ${median.toFixed(2)}`, mx + (mx > W * 0.7 ? -4 : 4), padT + 4)
  }, [results])

  return (
    <div>
      <p className="text-[10px] font-mono text-[#444] uppercase tracking-widest mb-2">
        Score distribution
      </p>
      <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
    </div>
  )
}
