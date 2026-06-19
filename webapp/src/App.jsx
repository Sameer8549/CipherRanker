// App.jsx — CipherRanker top-level with re-ranking support

import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import ShaderBackground from './components/ShaderBackground.jsx'
import HeroSection      from './components/HeroSection.jsx'
import ScoringProgress  from './components/ScoringProgress.jsx'
import ResultsView      from './components/ResultsView.jsx'

import { rankCandidates }    from './lib/scorer.js'
import { isHoneypot }        from './lib/honeypot.js'
import { generateReasoning } from './lib/reasoning.js'

function enrich(ranked) {
  return ranked.map(r => ({
    ...r,
    isHoneypot: isHoneypot(r.candidate),
    reasoning:  generateReasoning(r.candidate, r.rank, r.components),
  }))
}

export default function App() {
  const [appState,   setAppState]   = useState('IDLE')
  const [candidates, setCandidates] = useState([])
  const [results,    setResults]    = useState([])

  const handleCandidatesLoaded = useCallback((parsed) => {
    setCandidates(parsed)
    setAppState('SCORING')
  }, [])

  const handleScoringComplete = useCallback(() => {
    const ranked = rankCandidates(candidates)
    const enriched = enrich(ranked)

    console.log(
      `[CipherRanker] Done — ${enriched.length} ranked, ` +
      `${enriched.filter(r => r.isHoneypot).length} honeypots, ` +
      `top: ${enriched[0]?.score?.toFixed(4)}, ` +
      `median: ${enriched[Math.floor(enriched.length / 2)]?.score?.toFixed(4)}`
    )

    setResults(enriched)
    setAppState('RESULTS')
  }, [candidates])

  // Live re-ranking with new weights (from WeightPanel)
  const handleRerank = useCallback((weights) => {
    const ranked = rankCandidates(candidates, weights)
    const enriched = enrich(ranked)
    console.log(`[CipherRanker] Re-ranked with weights:`, weights)
    setResults(enriched)
  }, [candidates])

  const handleReset = useCallback(() => {
    setAppState('IDLE')
    setCandidates([])
    setResults([])
  }, [])

  return (
    <>
      <ShaderBackground />

      {/* Fixed nav */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: 52,
        background: 'rgba(10,10,10,0.9)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #1f1f1f',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        justifyContent: 'space-between',
      }}>
        <div className="flex items-center gap-3">
          <span
            className="font-mono font-black text-sm tracking-[0.10em] cursor-pointer"
            style={{ color: '#CCFF00' }}
            onClick={handleReset}
          >
            CIPHER<span style={{ color: '#fff' }}>RANKER</span>
          </span>
          <span className="text-[10px] text-[#444] border border-[#1f1f1f] px-2 py-0.5 rounded font-mono">
            SANDBOX
          </span>
          {appState === 'RESULTS' && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[10px] font-mono text-[#888] border border-[#1f1f1f] px-2 py-0.5 rounded"
            >
              {results.length} ranked
            </motion.span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {appState === 'RESULTS' && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-accent text-xs font-mono font-bold"
            >
              #{1} — {results[0]?.score?.toFixed(4)}
            </motion.span>
          )}
          <span className="text-[#444] text-xs font-mono">by Team Cipher</span>
        </div>
      </header>

      {/* Main content */}
      <div className="relative" style={{ zIndex: 10 }}>
        <AnimatePresence mode="wait">
          {appState === 'IDLE' && (
            <motion.div key="idle">
              <HeroSection onCandidatesLoaded={handleCandidatesLoaded} />
            </motion.div>
          )}

          {appState === 'SCORING' && (
            <motion.div key="scoring">
              <ScoringProgress
                total={candidates.length}
                onComplete={handleScoringComplete}
              />
            </motion.div>
          )}

          {appState === 'RESULTS' && (
            <motion.div key="results">
              <ResultsView
                results={results}
                onReset={handleReset}
                onRerank={handleRerank}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
