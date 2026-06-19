import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function UploadZone({ onCandidatesLoaded }) {
  const [dragging, setDragging]   = useState(false)
  const [status,   setStatus]     = useState('idle') // 'idle' | 'loaded' | 'error'
  const [count,    setCount]      = useState(0)
  const [errorMsg, setErrorMsg]   = useState('')
  const [parsed,   setParsed]     = useState(null)

  const processFile = useCallback((file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        if (!Array.isArray(data)) throw new Error('Expected a JSON array [ ... ]')
        setCount(data.length)
        setParsed(data)
        setStatus('loaded')
        setErrorMsg('')
      } catch (err) {
        setStatus('error')
        setErrorMsg(err.message)
      }
    }
    reader.readAsText(file)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const onDragOver  = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = ()  => setDragging(false)

  const onInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <motion.label
        htmlFor="file-upload"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        animate={{ scale: dragging ? 1.01 : 1 }}
        transition={{ duration: 0.15 }}
        className="block cursor-pointer"
        style={{
          border: `1px dashed ${dragging ? '#CCFF00' : '#1f1f1f'}`,
          background: '#111111',
          borderRadius: '6px',
          padding: '48px 32px',
          textAlign: 'center',
          transition: 'border-color 0.2s',
        }}
      >
        {/* Upload icon */}
        <div className="flex justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 16V4M12 4L8 8M12 4L16 8M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
              stroke="#444444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </div>

        <p className="text-white text-sm font-semibold mb-1">
          Drop <span className="font-mono text-accent">candidates.json</span> here
        </p>
        <p className="text-[#888888] text-xs">
          JSON array of candidate objects — use{' '}
          <span className="font-mono">sample_candidates.json</span> to test
        </p>

        <input
          id="file-upload"
          type="file"
          accept=".json"
          className="hidden"
          onChange={onInputChange}
        />
      </motion.label>

      {/* Status messages */}
      <AnimatePresence mode="wait">
        {status === 'loaded' && (
          <motion.div
            key="loaded"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center justify-between"
          >
            <span className="text-accent text-sm font-mono font-semibold">
              ✓ {count.toLocaleString()} candidates loaded
            </span>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onCandidatesLoaded(parsed)}
              className="bg-accent text-black font-bold text-sm px-6 py-3 rounded-[6px] leading-none"
            >
              Start Ranking →
            </motion.button>
          </motion.div>
        )}

        {status === 'error' && (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-danger text-xs font-mono"
          >
            ✗ {errorMsg}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
