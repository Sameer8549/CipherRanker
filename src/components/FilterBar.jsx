// FilterBar.jsx — Live search + filter controls for the results table

import { motion } from 'framer-motion'

export default function FilterBar({ query, setQuery, filters, setFilters, resultCount, totalCount }) {
  const toggle = (key) => setFilters(f => ({ ...f, [key]: !f[key] }))

  return (
    <div className="flex items-center gap-3 flex-wrap mb-5">
      {/* Search */}
      <div style={{ position: 'relative', flex: '1', minWidth: 200 }}>
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="8" stroke="#444" strokeWidth="2" />
          <path d="M21 21l-4.35-4.35" stroke="#444" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Search ID, title, location…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: '100%',
            background: '#111111',
            border: '1px solid #1f1f1f',
            borderRadius: 6,
            padding: '8px 10px 8px 30px',
            color: '#ffffff',
            fontSize: 12,
            fontFamily: 'Inter, sans-serif',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={e => (e.target.style.borderColor = '#CCFF00')}
          onBlur={e  => (e.target.style.borderColor = '#1f1f1f')}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              position: 'absolute', right: 8, top: '50%',
              transform: 'translateY(-50%)',
              color: '#444', fontSize: 14, cursor: 'pointer',
              background: 'none', border: 'none',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Filter toggles */}
      {[
        { key: 'openOnly',    label: 'Open to work' },
        { key: 'activeOnly',  label: 'Active < 30d' },
        { key: 'noHoneypots', label: 'Hide honeypots' },
        { key: 'top10',       label: 'Top 10 only' },
      ].map(({ key, label }) => (
        <motion.button
          key={key}
          whileTap={{ scale: 0.96 }}
          onClick={() => toggle(key)}
          style={{
            background: filters[key] ? 'rgba(204,255,0,0.12)' : 'transparent',
            border: `1px solid ${filters[key] ? '#CCFF00' : '#1f1f1f'}`,
            color: filters[key] ? '#CCFF00' : '#888888',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {filters[key] ? '✓ ' : ''}{label}
        </motion.button>
      ))}

      {/* Result count */}
      <span className="text-[#444] text-xs font-mono ml-auto">
        {resultCount}{totalCount !== resultCount ? ` / ${totalCount}` : ''} shown
      </span>
    </div>
  )
}
