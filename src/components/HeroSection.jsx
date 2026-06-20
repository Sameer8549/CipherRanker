import { motion } from 'framer-motion'
import UploadZone from './UploadZone.jsx'

const WORDS = ['FIND', 'THE', 'ENGINEER', 'WHO', 'SHIPS.']

const wordVariant = {
  hidden: { y: 30, opacity: 0 },
  visible: (i) => ({
    y: 0, opacity: 1,
    transition: { delay: i * 0.10, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  }),
}

const sectionVariant = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
  exit:    { opacity: 0, transition: { duration: 0.25 } },
}

export default function HeroSection({ onCandidatesLoaded }) {
  return (
    <motion.section
      variants={sectionVariant}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ minHeight: '100vh' }}
      className="flex flex-col items-center justify-center px-6 pt-24 pb-16"
    >
      {/* Eyebrow */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="text-accent text-xs font-mono font-semibold tracking-[0.25em] uppercase mb-10"
      >
        REDROB HACKATHON 2026 — SANDBOX DEMO
      </motion.p>

      {/* Giant headline */}
      <div className="overflow-hidden mb-8" aria-label="Find the engineer who ships">
        <div className="flex flex-col items-center gap-1">
          {WORDS.map((word, i) => (
            <motion.span
              key={word}
              custom={i + 1}
              variants={wordVariant}
              initial="hidden"
              animate="visible"
              className="block text-[clamp(3rem,10vw,7rem)] font-black leading-[0.92] tracking-[-0.04em] text-white"
            >
              {word}
            </motion.span>
          ))}
        </div>
      </div>

      {/* Subtext */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.75, duration: 0.5 }}
        className="text-[#888888] text-sm text-center max-w-md mb-12 leading-relaxed"
      >
        Upload a candidate file for immediate local ranking, then get independent
        Groq and Mistral evaluations with a consensus result.
      </motion.p>

      {/* Upload zone */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        className="w-full max-w-xl"
      >
        <UploadZone onCandidatesLoaded={onCandidatesLoaded} />
      </motion.div>

      {/* Stat pills */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.4 }}
        className="flex gap-3 mt-12 flex-wrap justify-center"
      >
        {['5 scoring components', '23 behavioral signals', 'Honeypot detection'].map(label => (
          <span
            key={label}
            className="border border-[#1f1f1f] bg-[#111111] text-[#888888] text-xs px-3 py-1 rounded-full"
          >
            {label}
          </span>
        ))}
      </motion.div>
    </motion.section>
  )
}
