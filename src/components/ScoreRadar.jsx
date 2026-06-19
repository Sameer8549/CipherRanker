// ScoreRadar.jsx — Canvas-based pentagon radar chart for 5 scoring components

import { useEffect, useRef } from 'react'

const LABELS = ['Career', 'Skills', 'Exp.', 'Location', 'Education']
const COLORS = {
  fill:   'rgba(204, 255, 0, 0.08)',
  stroke: 'rgba(204, 255, 0, 0.7)',
  grid:   'rgba(255,255,255,0.06)',
  label:  '#888888',
  dot:    '#CCFF00',
}

function polarToXY(angle, radius, cx, cy) {
  return {
    x: cx + radius * Math.cos(angle - Math.PI / 2),
    y: cy + radius * Math.sin(angle - Math.PI / 2),
  }
}

export default function ScoreRadar({ components, size = 220 }) {
  const canvasRef = useRef(null)

  const vals = [
    components?.career     ?? 0,
    components?.skills     ?? 0,
    components?.experience ?? 0,
    components?.location   ?? 0,
    components?.education  ?? 0,
  ]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width  = size * dpr
    canvas.height = size * dpr
    canvas.style.width  = `${size}px`
    canvas.style.height = `${size}px`

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2
    const R  = size * 0.36
    const n  = vals.length
    const step = (2 * Math.PI) / n

    ctx.clearRect(0, 0, size, size)

    // Grid rings
    for (let ring = 1; ring <= 4; ring++) {
      const r = (R * ring) / 4
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const { x, y } = polarToXY(i * step, r, cx, cy)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.strokeStyle = COLORS.grid
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Axes
    for (let i = 0; i < n; i++) {
      const { x, y } = polarToXY(i * step, R, cx, cy)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(x, y)
      ctx.strokeStyle = COLORS.grid
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Data polygon
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const { x, y } = polarToXY(i * step, vals[i] * R, cx, cy)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = COLORS.fill
    ctx.fill()
    ctx.strokeStyle = COLORS.stroke
    ctx.lineWidth = 2
    ctx.stroke()

    // Dots
    for (let i = 0; i < n; i++) {
      const { x, y } = polarToXY(i * step, vals[i] * R, cx, cy)
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, 2 * Math.PI)
      ctx.fillStyle = COLORS.dot
      ctx.fill()
    }

    // Labels
    ctx.font = `500 10px Inter, sans-serif`
    ctx.fillStyle = COLORS.label
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < n; i++) {
      const { x, y } = polarToXY(i * step, R + 18, cx, cy)
      ctx.fillText(LABELS[i], x, y)
    }

    // Center value
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    ctx.font = `bold 13px "JetBrains Mono", monospace`
    ctx.fillStyle = '#CCFF00'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(avg.toFixed(2), cx, cy)
  }, [vals, size])

  return <canvas ref={canvasRef} style={{ display: 'block' }} />
}
