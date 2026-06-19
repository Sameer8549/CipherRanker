// ExportButton.jsx — Inline export button with CSV generation

import { motion } from 'framer-motion'

function generateCSV(results) {
  const header = 'candidate_id,rank,score,is_honeypot,reasoning'
  const rows = results.map(r =>
    `${r.candidate.candidate_id},${r.rank},${r.score.toFixed(6)},${r.isHoneypot ? 'true' : 'false'},"${(r.reasoning || '').replace(/"/g, '""')}"`
  )
  return [header, ...rows].join('\n')
}

export default function ExportButton({ results }) {
  const handleExport = () => {
    const csv  = generateCSV(results)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'team_cipher.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={handleExport}
      style={{
        background: '#CCFF00',
        color: '#000000',
        fontWeight: 700,
        fontSize: 12,
        padding: '7px 14px',
        borderRadius: 6,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      ↓ Export CSV
    </motion.button>
  )
}
