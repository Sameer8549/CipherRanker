// RankingTable.jsx — Advanced table with click-to-open drawer, compare checkbox, sort, badges

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as Tooltip from '@radix-ui/react-tooltip'
import ScoreBar from './ScoreBar.jsx'
import FilterBar from './FilterBar.jsx'
import { daysSince } from '../lib/scorer.js'

function Badges({ result }) {
  const sig = result.candidate.redrob_signals || {}
  const badges = []
  if (daysSince(sig.last_active_date) < 30)
    badges.push(<span key="active" className="badge badge-green">ACTIVE</span>)
  if (sig.open_to_work_flag)
    badges.push(<span key="open"   className="badge badge-lime">OPEN</span>)
  if (result.isHoneypot)
    badges.push(<span key="hp"     className="badge badge-red">HONEYPOT</span>)
  if ((sig.notice_period_days || 91) <= 30)
    badges.push(<span key="notice" className="badge badge-white">&lt;30d</span>)
  return <div className="flex gap-1 flex-wrap">{badges}</div>
}

const rowVariant = {
  hidden:  { opacity: 0, y: 8 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.025, duration: 0.25 } }),
}

export default function RankingTable({ results, onSelect, compareList, onToggleCompare, explanations = {} }) {
  const [query,   setQuery]   = useState('')
  const [filters, setFilters] = useState({
    openOnly: false, activeOnly: false, noHoneypots: false, top10: false,
  })
  const [sortKey,  setSortKey]  = useState('rank')
  const [sortDir,  setSortDir]  = useState('asc')
  const [showAll,  setShowAll]  = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  // Filter
  const filtered = useMemo(() => {
    let list = results
    const q = query.toLowerCase()
    if (q) {
      list = list.filter(r => {
        const p = r.candidate.profile || {}
        return (
          String(r.candidate.candidate_id).toLowerCase().includes(q) ||
          (p.current_title || '').toLowerCase().includes(q) ||
          (p.location || '').toLowerCase().includes(q)
        )
      })
    }
    if (filters.openOnly)    list = list.filter(r => r.candidate.redrob_signals?.open_to_work_flag)
    if (filters.activeOnly)  list = list.filter(r => daysSince(r.candidate.redrob_signals?.last_active_date) < 30)
    if (filters.noHoneypots) list = list.filter(r => !r.isHoneypot)
    if (filters.top10)       list = list.slice(0, 10)
    return list
  }, [results, query, filters])

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      let va, vb
      switch (sortKey) {
        case 'rank':  va = a.rank;  vb = b.rank;  break
        case 'score': va = a.score; vb = b.score; break
        case 'yoe':
          va = a.candidate.profile?.years_of_experience ?? 0
          vb = b.candidate.profile?.years_of_experience ?? 0
          break
        case 'rr':
          va = a.candidate.redrob_signals?.recruiter_response_rate ?? 0
          vb = b.candidate.redrob_signals?.recruiter_response_rate ?? 0
          break
        default: va = a.rank; vb = b.rank
      }
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const visible = showAll ? sorted : sorted.slice(0, 20)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <span style={{ color: '#333', marginLeft: 4 }}>↕</span>
    return <span style={{ color: '#CCFF00', marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <Tooltip.Provider delayDuration={150}>
      <FilterBar
        query={query} setQuery={setQuery}
        filters={filters} setFilters={setFilters}
        resultCount={visible.length} totalCount={results.length}
      />

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('rank')}>
                RANK <SortIcon col="rank" />
              </th>
              <th>ID</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('score')}>
                SCORE <SortIcon col="score" />
              </th>
              <th>TITLE</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('yoe')}>
                EXP <SortIcon col="yoe" />
              </th>
              <th>LOCATION</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('rr')}>
                RESP% <SortIcon col="rr" />
              </th>
              <th>SIGNALS</th>
              <th style={{ minWidth: 220 }}>REASONING</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {visible.map((result, i) => {
                const { candidate, score, rank, reasoning } = result
                const profile  = candidate.profile || {}
                const signals  = candidate.redrob_signals || {}
                const isTop3   = rank <= 3
                const inCmp    = compareList?.some(r => r.candidate.candidate_id === candidate.candidate_id)
                const isExpanded = expandedId === candidate.candidate_id
                const aiExplanation = explanations[candidate.candidate_id]

                return (
                  <AnimatePresence key={candidate.candidate_id} initial={false}>
                    <motion.tr
                      custom={i}
                      variants={rowVariant}
                      initial="hidden"
                      animate="visible"
                      onClick={() => setExpandedId(isExpanded ? null : candidate.candidate_id)}
                      style={{ cursor: 'pointer', background: isExpanded ? 'rgba(204,255,0,0.04)' : 'transparent' }}
                    >
                      {/* Compare checkbox */}
                      <td onClick={e => { e.stopPropagation(); onToggleCompare(result) }}>
                        <div
                          style={{
                            width: 18, height: 18,
                            borderRadius: 4,
                            border: `1.5px solid ${inCmp ? '#CCFF00' : '#333'}`,
                            background: inCmp ? '#CCFF00' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {inCmp && <span style={{ fontSize: 10, color: '#000', fontWeight: 900 }}>✓</span>}
                        </div>
                      </td>

                      {/* RANK */}
                      <td>
                        <span
                          className="font-mono font-bold text-sm"
                          style={{ color: isTop3 ? '#CCFF00' : '#fff' }}
                        >
                          #{rank}
                        </span>
                      </td>

                      {/* ID */}
                      <td>
                        <span className="font-mono text-[10px] text-[#888]">
                          {String(candidate.candidate_id).toUpperCase().slice(0, 14)}
                        </span>
                      </td>

                      {/* SCORE */}
                      <td><ScoreBar score={score} delay={i * 0.025} /></td>

                      {/* TITLE */}
                      <td className="text-white text-xs" title={profile.current_title}>
                        {(profile.current_title || '—').slice(0, 24)}
                      </td>

                      {/* EXP */}
                      <td className="text-[#888] text-xs font-mono">
                        {profile.years_of_experience != null ? `${profile.years_of_experience}y` : '—'}
                      </td>

                      {/* LOCATION */}
                      <td className="text-[#888] text-xs">
                        {(profile.location || '—').slice(0, 14)}
                      </td>

                      {/* RESP% */}
                      <td className="font-mono text-xs"
                        style={{ color: (signals.recruiter_response_rate ?? 0) >= 0.5 ? '#00FF88' : '#888' }}
                      >
                        {((signals.recruiter_response_rate ?? 0) * 100).toFixed(0)}%
                      </td>

                      {/* SIGNALS */}
                      <td><Badges result={result} /></td>

                      {/* REASONING — truncated with tooltip */}
                      <td style={{ maxWidth: 220 }}>
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <span
                              className="text-[#888] text-[10px] cursor-default block truncate"
                              style={{ maxWidth: 220 }}
                            >
                              {aiExplanation || reasoning}
                            </span>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              side="top" align="start" sideOffset={6}
                              style={{
                                background: '#1a1a1a',
                                border: '1px solid #1f1f1f',
                                borderRadius: 6,
                                padding: '10px 14px',
                                color: '#888',
                                fontSize: 11,
                                maxWidth: 360,
                                lineHeight: 1.6,
                                zIndex: 9999,
                              }}
                            >
                              {aiExplanation || reasoning}
                              <Tooltip.Arrow style={{ fill: '#1a1a1a' }} />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      </td>
                    </motion.tr>
                    {isExpanded && (
                      <tr key={`${candidate.candidate_id}-expanded`} style={{ background: 'rgba(204,255,0,0.02)' }}>
                        <td colSpan={10} style={{ padding: '16px 24px', borderBottom: '1px solid #1f1f1f' }}>
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: '#CCFF00', fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.1em', fontWeight: 'bold' }}>
                                  AI RECRUITER ANALYSIS
                                </span>
                                {aiExplanation && (
                                  <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#888', border: '1px solid #333', padding: '1px 6px', borderRadius: 3 }}>
                                    AI Powered
                                  </span>
                                )}
                              </div>
                              <p style={{ color: '#eee', fontSize: 12, lineHeight: 1.6, margin: 0, fontFamily: 'monospace', whiteSpace: 'normal' }}>
                                {aiExplanation || reasoning}
                              </p>
                              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); onSelect(result); }}
                                  style={{
                                    background: 'transparent',
                                    border: '1px solid #333',
                                    color: '#aaa',
                                    fontSize: 10,
                                    fontFamily: 'monospace',
                                    padding: '4px 10px',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                  }}
                                  onMouseEnter={e => { e.target.style.borderColor = '#CCFF00'; e.target.style.color = '#fff'; }}
                                  onMouseLeave={e => { e.target.style.borderColor = '#333'; e.target.style.color = '#aaa'; }}
                                >
                                  Open Full Profile Drawer
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                )
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {sorted.length > 20 && (
        <div className="flex justify-center mt-5">
          <button
            onClick={() => setShowAll(v => !v)}
            className="text-[#888] text-xs border border-[#1f1f1f] px-5 py-2 rounded-[6px] hover:text-white hover:border-[#333] transition-colors"
          >
            {showAll ? '↑ Show top 20' : `↓ Show all ${sorted.length} candidates`}
          </button>
        </div>
      )}

      {sorted.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-[#444]">
          <p className="text-4xl mb-3">⌀</p>
          <p className="text-xs">No candidates match current filters</p>
        </div>
      )}
    </Tooltip.Provider>
  )
}
