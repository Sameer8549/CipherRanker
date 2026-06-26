import { useState } from 'react'
import { motion } from 'framer-motion'
import { apiUrl } from '../lib/api.js'

export default function ExportButton({ jobId, participantId = 'team_cipher', type = 'official', label = 'Export Official CSV', secondary = false }) {
  const [busy, setBusy] = useState(false)
  const handleExport = async () => {
    if (!jobId || busy) return
    setBusy(true)
    try {
      const response = await fetch(apiUrl(`/api/jobs/${jobId}/export`), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, participantId })
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Export failed (${response.status})`)
      }
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') || ''
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || `${participantId}.csv`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = fileName; anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      window.alert(error.message)
    } finally { setBusy(false) }
  }

  return (
    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleExport} disabled={!jobId || busy}
      style={{
        height: 34, background: secondary ? '#121212' : '#CCFF00', color: secondary ? '#aaa' : '#000',
        fontWeight: 700, fontSize: 11, padding: '0 13px', borderRadius: 6,
        border: secondary ? '1px solid #303030' : 'none', cursor: busy ? 'wait' : 'pointer',
        opacity: !jobId ? 0.45 : 1
      }}>
      {busy ? 'Preparing…' : label}
    </motion.button>
  )
}
