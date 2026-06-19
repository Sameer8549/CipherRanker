import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

export default function ScoringProgress({ total, onComplete }) {
  const [count, setCount]       = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!total) return

    const duration = 1500 // ms minimum for UX
    const steps    = 60
    const interval = duration / steps
    let step = 0

    const timer = setInterval(() => {
      step++
      const pct = step / steps
      setCount(Math.floor(pct * total))
      setProgress(Math.floor(pct * 100))

      if (step >= steps) {
        clearInterval(timer)
        setCount(total)
        setProgress(100)
        setTimeout(() => onComplete(), 300)
      }
    }, interval)

    return () => clearInterval(timer)
  }, [total, onComplete])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center"
      style={{ minHeight: '100vh' }}
    >
      {/* Counter */}
      <motion.span
        key={count}
        initial={{ opacity: 0.7, scale: 0.97 }}
        animate={{ opacity: 1,   scale: 1 }}
        className="font-mono text-[clamp(4rem,15vw,9rem)] font-black text-accent leading-none tabular-nums"
      >
        {count.toLocaleString()}
      </motion.span>

      <p className="text-[#888888] text-sm mt-4 tracking-widest uppercase font-mono">
        candidates scored
      </p>

      {/* Progress bar fixed at bottom */}
      <div
        style={{
          position: 'fixed',
          bottom: 0, left: 0,
          height: '3px',
          width: '100%',
          background: '#1f1f1f',
        }}
      >
        <motion.div
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ ease: 'easeInOut', duration: 0.3 }}
          style={{ height: '100%', background: '#CCFF00' }}
        />
      </div>
    </motion.div>
  )
}
