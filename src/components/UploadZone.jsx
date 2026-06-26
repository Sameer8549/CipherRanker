import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'

export default function UploadZone({ onFileSelected, disabled = false }) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [selectedName, setSelectedName] = useState('')

  const selectFile = useCallback(file => {
    if (!file || disabled) return
    if (!/\.(jsonl|json|csv)$/i.test(file.name)) {
      setError('Upload JSONL, JSON, or CSV. For XLSX, save the sheet as CSV first.')
      return
    }
    setSelectedName(file.name)
    setError('')
    onFileSelected(file)
  }, [disabled, onFileSelected])

  return (
    <div className="flex flex-col gap-3">
      <motion.label htmlFor="file-upload" className="block cursor-pointer"
        onDrop={event => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer?.files?.[0]) }}
        onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
        animate={{ scale: dragging ? 1.01 : 1 }}
        style={{ border: `1px dashed ${dragging ? '#CCFF00' : '#2a2a2a'}`, background: '#101010', borderRadius: 6, padding: '44px 28px', textAlign: 'center', opacity: disabled ? 0.5 : 1 }}>
        <div className="upload-symbol" aria-hidden="true">↑</div>
        <p className="text-white text-sm font-semibold mb-1">{selectedName || 'Drop a candidate dataset here'}</p>
        <p className="text-[#888] text-xs">{selectedName ? 'Upload accepted. Starting the ranking pipeline...' : 'JSONL/JSON/CSV dataset · streamed into the ranking engine'}</p>
        <input id="file-upload" type="file" accept=".json,.jsonl,.csv,application/json,application/x-ndjson,text/csv" className="hidden"
          disabled={disabled} onChange={event => selectFile(event.target.files?.[0])} />
      </motion.label>
      {error && <p className="text-danger text-xs font-mono">{error}</p>}
    </div>
  )
}
