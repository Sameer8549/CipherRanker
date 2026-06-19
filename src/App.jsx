// App.jsx — Hybrid AI-powered CipherRanker React App

import { useState, useCallback, useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import ShaderBackground from './components/ShaderBackground.jsx'
import UploadZone       from './components/UploadZone.jsx'
import RankingTable     from './components/RankingTable.jsx'
import StatCards        from './components/StatCards.jsx'
import ExportButton     from './components/ExportButton.jsx'
import CandidateDrawer  from './components/CandidateDrawer.jsx'
import CompareModal     from './components/CompareModal.jsx'
import WeightPanel      from './components/WeightPanel.jsx'

import { rankCandidates }    from './lib/scorer.js'
import { isHoneypot }        from './lib/honeypot.js'
import { generateReasoning } from './lib/reasoning.js'
import { analyzeJobDescription, explainCandidates, chatWithResults } from './lib/groq.js'

// Fallback default rubric matching jd_analyzer.py
const DEFAULT_RUBRIC = {
  weights: {
    career_track: 0.30,
    skill_match: 0.25,
    experience_years: 0.15,
    location: 0.15,
    education: 0.15
  },
  must_have_skills: ["python", "pytorch", "tensorflow", "machine learning", "deep learning"],
  nice_to_have_skills: ["aws", "gcp", "azure", "mlops", "docker", "kubernetes", "fastapi", "flask"],
  ideal_experience_years: { min: 5, max: 9 },
  preferred_locations: ["bangalore", "pune", "noida", "gurugram", "india"],
  red_flag_titles: ["recruiter", "hr", "sales", "marketing", "accountant"],
  red_flag_skills: ["typing", "accounting", "photoshop"],
  career_track_keywords: ["shipped", "production", "real users", "deployment", "ml engineer", "data scientist", "backend engineer"],
  notes: "Fallback default rubric"
}

const DEFAULT_JD = `Job Description: Senior ML Engineer / Data Scientist

We are looking for a Senior Machine Learning Engineer to join our team in India (Bangalore, Pune, Gurugram, or Noida preferred).

Requirements:
- 5 to 9 years of hands-on experience in software development and machine learning.
- Strong proficiency in Python and deep learning frameworks (PyTorch or TensorFlow).
- Experience with Cloud platforms (AWS, GCP, or Azure) and containerization (Docker, Kubernetes).
- Strong track record of shipping production code and real-world system deployments.

Nice-to-Have:
- Experience with MLOps pipelines.
- Knowledge of NLP and Large Language Models (LLMs).`

export default function App() {
  // Navigation & Settings State
  const [activeTab, setActiveTab] = useState('JD_ANALYZER') // 'JD_ANALYZER' | 'RANKINGS' | 'ASK_RESULTS'
  const [apiKey, setApiKey] = useState('')
  const [provider, setProvider] = useState('groq') // 'groq' | 'mistral'
  const [showKeyInput, setShowKeyInput] = useState(false)

  // Pipeline Data State
  const [jdText, setJdText] = useState(DEFAULT_JD)
  const [rubric, setRubric] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)

  const [candidates, setCandidates] = useState([])
  const [results, setResults] = useState([])
  const [isScoring, setIsScoring] = useState(false)
  const [explanations, setExplanations] = useState({})
  const [isExplaining, setIsExplaining] = useState(false)

  // Detail Modal / Drawer state
  const [selectedResult, setSelectedResult] = useState(null)
  const [compareList, setCompareList] = useState([])
  const [showCompare, setShowCompare] = useState(false)
  const [showWeightsOverride, setShowWeightsOverride] = useState(false)

  // Chat State
  const [chatQuery, setChatQuery] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [isChatLoading, setIsChatLoading] = useState(false)

  // Auto-detect environment API keys
  useEffect(() => {
    const envGroq = import.meta.env?.VITE_GROQ_API_KEY
    const envMistral = import.meta.env?.VITE_MISTRAL_API_KEY
    if (envGroq) {
      setApiKey(envGroq)
      setProvider('groq')
    } else if (envMistral) {
      setApiKey(envMistral)
      setProvider('mistral')
    }
  }, [])

  // Analyze JD
  const handleAnalyzeJD = async () => {
    if (!apiKey) {
      setAnalysisError('API Key is required. Enter your key in the top-right settings.')
      return
    }
    setIsAnalyzing(true)
    setAnalysisError(null)
    try {
      const parsedRubric = await analyzeJobDescription(jdText, apiKey, provider)
      setRubric(parsedRubric)
      setActiveTab('RANKINGS')
    } catch (e) {
      console.error(e)
      setAnalysisError(`Analysis failed: ${e.message}. Double-check your API key and provider.`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Fallback Rubric
  const handleUseFallback = () => {
    setRubric(DEFAULT_RUBRIC)
    setAnalysisError(null)
    setActiveTab('RANKINGS')
  }

  // Load Candidates
  const handleCandidatesLoaded = (parsed) => {
    setCandidates(parsed)
    setIsScoring(true)
    // Add small timeout to simulate pipeline scoring
    setTimeout(() => {
      const activeRubric = rubric || DEFAULT_RUBRIC
      const ranked = rankCandidates(parsed, null, activeRubric)
      const enriched = ranked.map(r => ({
        ...r,
        isHoneypot: isHoneypot(r.candidate),
        reasoning: generateReasoning(r.candidate, r.rank, r.components)
      }))
      setResults(enriched)
      setIsScoring(false)

      // Trigger background explanations for top 10 candidates if key is present
      if (apiKey && enriched.length > 0) {
        generateTopExplanations(enriched.slice(0, 10), activeRubric)
      }
    }, 1500)
  }

  // Generate AI explanations for top 10
  const generateTopExplanations = async (topCandidates, activeRubric) => {
    setIsExplaining(true)
    try {
      const simplifiedCandidates = topCandidates.map(r => ({
        candidate_id: r.candidate.candidate_id,
        current_title: r.candidate.profile?.current_title,
        years_of_experience: r.candidate.profile?.years_of_experience,
        location: r.candidate.profile?.location,
        skills: (r.candidate.skills || []).map(s => `${s.name} (${s.proficiency})`)
      }))
      
      const newExplanations = await explainCandidates(simplifiedCandidates, activeRubric, apiKey, provider)
      const expMap = {}
      newExplanations.forEach(exp => {
        if (exp.candidate_id) {
          expMap[exp.candidate_id] = exp.explanation
        }
      })
      setExplanations(prev => ({ ...prev, ...expMap }))
    } catch (e) {
      console.error("AI explanations failed:", e)
    } finally {
      setIsExplaining(false)
    }
  }

  // Ask Results Chat
  const handleChatSubmit = async (e) => {
    e.preventDefault()
    if (!chatQuery.trim() || isChatLoading) return

    const userMessage = { role: 'user', content: chatQuery }
    setChatHistory(prev => [...prev, userMessage])
    setChatQuery('')
    setIsChatLoading(true)

    try {
      // Summarize candidate details for LLM context
      const summaries = results.slice(0, 20).map(r => {
        const exp = explanations[r.candidate.candidate_id] || r.reasoning
        return `- Rank #${r.rank}: ID ${r.candidate.candidate_id}, Title: ${r.candidate.profile?.current_title || '—'}, Location: ${r.candidate.profile?.location || '—'}, Exp: ${r.candidate.profile?.years_of_experience || 0}y, Score: ${r.score.toFixed(4)}. Recruiter analysis: ${exp}`
      }).join('\n')

      const formattedHistory = chatHistory.map(h => ({ role: h.role, content: h.content }))
      const activeRubric = rubric || DEFAULT_RUBRIC
      
      const response = await chatWithResults(chatQuery, summaries, activeRubric, apiKey, provider, formattedHistory)
      setChatHistory(prev => [...prev, { role: 'assistant', content: response }])
    } catch (err) {
      console.error(err)
      setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}. Make sure your API key is correct.` }])
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleToggleCompare = (result) => {
    setCompareList(prev => {
      const exists = prev.some(r => r.candidate.candidate_id === result.candidate.candidate_id)
      if (exists) return prev.filter(r => r.candidate.candidate_id !== result.candidate.candidate_id)
      if (prev.length >= 2) return [prev[1], result]
      return [...prev, result]
    })
  }

  const handleRerank = (weightsOverride) => {
    const activeRubric = rubric || DEFAULT_RUBRIC
    const customRubric = { ...activeRubric, weights: {
      career_track: weightsOverride.career,
      skill_match: weightsOverride.skills,
      experience_years: weightsOverride.experience,
      location: weightsOverride.location,
      education: weightsOverride.education
    }}
    const ranked = rankCandidates(candidates, null, customRubric)
    const enriched = ranked.map(r => ({
      ...r,
      isHoneypot: isHoneypot(r.candidate),
      reasoning: generateReasoning(r.candidate, r.rank, r.components)
    }))
    setResults(enriched)
  }

  const handleReset = () => {
    setCandidates([])
    setResults([])
    setExplanations({})
    setChatHistory([])
  }

  return (
    <>
      <ShaderBackground />

      {/* Header Navigation */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: 56, background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(16px)', borderBottom: '1px solid #1f1f1f',
        zIndex: 100, display: 'flex', alignItems: 'center',
        padding: '0 24px', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span
            className="font-mono font-black text-sm tracking-[0.10em] cursor-pointer"
            style={{ color: '#CCFF00' }}
            onClick={handleReset}
          >
            CIPHER<span style={{ color: '#fff' }}>RANKER</span>
          </span>
          
          {/* Navigation Tabs */}
          <nav style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'JD_ANALYZER', label: '1. JD Analyzer' },
              { id: 'RANKINGS', label: '2. Rankings' },
              { id: 'ASK_RESULTS', label: '3. Ask the Results', disabled: results.length === 0 }
            ].map(tab => (
              <button
                key={tab.id}
                disabled={tab.disabled}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: activeTab === tab.id ? 'rgba(204,255,0,0.08)' : 'transparent',
                  border: 'none',
                  color: tab.disabled ? '#333' : (activeTab === tab.id ? '#CCFF00' : '#888'),
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  cursor: tab.disabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  fontWeight: activeTab === tab.id ? 'bold' : 'normal'
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* API Settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => setShowKeyInput(v => !v)}
            style={{
              background: apiKey ? 'rgba(0,255,136,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${apiKey ? '#00FF88' : '#333'}`,
              color: apiKey ? '#00FF88' : '#888',
              padding: '5px 12px',
              borderRadius: 6,
              fontSize: 10,
              fontFamily: 'monospace',
              cursor: 'pointer'
            }}
          >
            {apiKey ? 'API KEY CONFIGURED ✓' : 'SETTINGS (KEYS)'}
          </button>
        </div>
      </header>

      {/* API Key Modal Panel */}
      <AnimatePresence>
        {showKeyInput && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'fixed', top: 62, right: 24,
              background: '#111', border: '1px solid #222',
              borderRadius: 8, padding: 16, zIndex: 99,
              width: 320, boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}
          >
            <h4 style={{ color: '#fff', fontSize: 12, fontFamily: 'monospace', margin: '0 0 12px 0' }}>API CONFIGURATION</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ color: '#666', fontSize: 9, fontFamily: 'monospace', display: 'block', marginBottom: 4 }}>PROVIDER</label>
                <select
                  value={provider}
                  onChange={e => setProvider(e.target.value)}
                  style={{
                    width: '100%', background: '#1a1a1a', border: '1px solid #333',
                    color: '#fff', borderRadius: 4, padding: 6, fontSize: 11, fontFamily: 'monospace'
                  }}
                >
                  <option value="groq">Groq (Llama 3.3 70B)</option>
                  <option value="mistral">Mistral AI (Mistral Large)</option>
                </select>
              </div>

              <div>
                <label style={{ color: '#666', fontSize: 9, fontFamily: 'monospace', display: 'block', marginBottom: 4 }}>API KEY</label>
                <input
                  type="password"
                  placeholder="Enter secret API key"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  style={{
                    width: '100%', background: '#1a1a1a', border: '1px solid #333',
                    color: '#fff', borderRadius: 4, padding: 6, fontSize: 11, fontFamily: 'monospace'
                  }}
                />
              </div>

              <button
                onClick={() => setShowKeyInput(false)}
                style={{
                  background: '#CCFF00', color: '#000', border: 'none',
                  borderRadius: 4, padding: 6, fontSize: 11, fontFamily: 'monospace',
                  fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                SAVE & CLOSE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Tab Content */}
      <main style={{ padding: '80px 24px 40px 24px', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <AnimatePresence mode="wait">
          
          {/* TAB 1: JD ANALYZER */}
          {activeTab === 'JD_ANALYZER' && (
            <motion.div
              key="jd-analyzer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{ display: 'flex', gap: 24, flexDirection: 'row', flexWrap: 'wrap' }}
            >
              <div style={{ flex: '1 1 500px', minWidth: 320 }}>
                <p className="text-accent text-[10px] font-mono tracking-widest uppercase mb-1">STEP 1</p>
                <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 900, margin: '0 0 16px 0' }}>Job Description Input</h2>
                
                <textarea
                  value={jdText}
                  onChange={e => setJdText(e.target.value)}
                  placeholder="Paste target job description here..."
                  style={{
                    width: '100%', height: 350, background: 'rgba(255,255,255,0.02)',
                    border: '1px solid #1f1f1f', borderRadius: 8, padding: 16,
                    color: '#eee', fontSize: 13, fontFamily: 'monospace', lineHeight: 1.6,
                    resize: 'none', outline: 'none'
                  }}
                />
                
                {analysisError && (
                  <p style={{ color: '#FF4444', fontSize: 11, fontFamily: 'monospace', margin: '8px 0' }}>
                    {analysisError}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button
                    onClick={handleAnalyzeJD}
                    disabled={isAnalyzing}
                    style={{
                      background: '#CCFF00', color: '#000', border: 'none',
                      borderRadius: 6, padding: '10px 20px', fontSize: 12, fontFamily: 'monospace',
                      fontWeight: 800, cursor: isAnalyzing ? 'wait' : 'pointer',
                      boxShadow: '0 0 20px rgba(204,255,0,0.15)'
                    }}
                  >
                    {isAnalyzing ? 'ANALYZING WITH AI...' : 'ANALYZE WITH AI'}
                  </button>
                  <button
                    onClick={handleUseFallback}
                    style={{
                      background: 'rgba(255,255,255,0.03)', color: '#888', border: '1px solid #222',
                      borderRadius: 6, padding: '10px 20px', fontSize: 12, fontFamily: 'monospace',
                      cursor: 'pointer'
                    }}
                  >
                    USE FALLBACK RULE
                  </button>
                </div>
              </div>

              {/* Rubric View Panel */}
              <div style={{ flex: '1 1 400px', minWidth: 320, background: 'rgba(10,10,10,0.4)', border: '1px solid #1f1f1f', borderRadius: 8, padding: 24 }}>
                <p className="text-[#888] text-[10px] font-mono tracking-widest uppercase mb-1">ACTIVE AI RUBRIC</p>
                
                {rubric ? (
                  <div>
                    <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>Extracted Weights</h3>
                    
                    {/* Weights Bar Chart */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                      {Object.entries(rubric.weights).map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace', width: 130, textTransform: 'capitalize' }}>
                            {k.replace('_', ' ')}
                          </span>
                          <div style={{ flex: 1, height: 6, background: '#111', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${v * 100}%`, height: '100%', background: '#CCFF00' }} />
                          </div>
                          <span style={{ color: '#CCFF00', fontSize: 11, fontFamily: 'monospace', width: 40, textAlign: 'right' }}>
                            {(v * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Tags List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <span style={{ color: '#555', fontSize: 10, fontFamily: 'monospace', display: 'block', marginBottom: 4 }}>MUST HAVE SKILLS</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {rubric.must_have_skills.map(s => (
                            <span key={s} className="badge badge-lime">{s}</span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: '#555', fontSize: 10, fontFamily: 'monospace', display: 'block', marginBottom: 4 }}>NICE TO HAVE SKILLS</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {rubric.nice_to_have_skills.map(s => (
                            <span key={s} className="badge badge-white">{s}</span>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 24 }}>
                        <div>
                          <span style={{ color: '#555', fontSize: 10, fontFamily: 'monospace', display: 'block', marginBottom: 4 }}>EXPERIENCE RANGE</span>
                          <span style={{ color: '#fff', fontSize: 12, fontFamily: 'monospace' }}>
                            {rubric.ideal_experience_years?.min} - {rubric.ideal_experience_years?.max} Years
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#555', fontSize: 10, fontFamily: 'monospace', display: 'block', marginBottom: 4 }}>LOCATIONS</span>
                          <span style={{ color: '#fff', fontSize: 12, fontFamily: 'monospace', textTransform: 'capitalize' }}>
                            {rubric.preferred_locations?.join(', ')}
                          </span>
                        </div>
                      </div>

                      {rubric.red_flag_titles.length > 0 && (
                        <div>
                          <span style={{ color: '#555', fontSize: 10, fontFamily: 'monospace', display: 'block', marginBottom: 4 }}>RED FLAG TITLES</span>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {rubric.red_flag_titles.map(t => (
                              <span key={t} className="badge badge-red">{t}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', itemsCenter: 'center', justifyContent: 'center', height: '100%', minHeight: 250, color: '#444' }}>
                    <p style={{ textAlign: 'center', fontSize: 32, margin: '0 0 8px 0' }}>⚙</p>
                    <p style={{ textAlign: 'center', fontSize: 11, fontFamily: 'monospace' }}>
                      Analyze a job description using Groq or Mistral to extract the custom ranking rubric.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 2: RANKINGS */}
          {activeTab === 'RANKINGS' && (
            <motion.div
              key="rankings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {candidates.length === 0 ? (
                <div style={{ maxWidth: 600, margin: '60px auto' }}>
                  <p className="text-accent text-[10px] font-mono tracking-widest uppercase mb-1 text-center">STEP 2</p>
                  <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 900, textAlign: 'center', margin: '0 0 8px 0' }}>Upload Candidates</h2>
                  <p style={{ color: '#888', fontSize: 12, textAlign: 'center', margin: '0 0 24px 0', fontFamily: 'monospace' }}>
                    Using scoring rubric extracted from: {rubric?.notes || 'Default Rubric'}
                  </p>
                  <UploadZone onCandidatesLoaded={handleCandidatesLoaded} />
                </div>
              ) : isScoring ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                  <div style={{ width: 40, height: 40, border: '2px solid #333', borderTopColor: '#CCFF00', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <p style={{ color: '#CCFF00', fontSize: 12, fontFamily: 'monospace', marginTop: 16, letterSpacing: '0.1em' }}>
                    SCORING CANDIDATES WITH AI RUBRIC...
                  </p>
                </div>
              ) : (
                <div>
                  {/* Top results bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                    <div>
                      <p className="text-accent text-[10px] font-mono tracking-widest uppercase mb-1">STAGE 2 RESULTS</p>
                      <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 900, margin: 0 }}>
                        {results.length} Candidates Ranked
                      </h2>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {isExplaining && (
                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#CCFF00', border: '1px solid rgba(204,255,0,0.3)', padding: '4px 10px', borderRadius: 4 }}>
                          GENERATE EXPLANATIONS IN BACKGROUND...
                        </span>
                      )}
                      
                      {compareList.length === 2 && (
                        <button
                          onClick={() => setShowCompare(true)}
                          style={{
                            background: 'rgba(204,255,0,0.1)', border: '1px solid #CCFF00',
                            color: '#CCFF00', borderRadius: 6, padding: '7px 14px', fontSize: 12,
                            fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          ⇄ Compare ({compareList.length})
                        </button>
                      )}

                      <button
                        onClick={() => setShowWeightsOverride(true)}
                        style={{
                          background: 'transparent', border: '1px solid #222', color: '#888',
                          borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}
                      >
                        Adjust Weights
                      </button>

                      <ExportButton results={results} />
                      
                      <button
                        onClick={handleReset}
                        style={{
                          background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.2)', color: '#FF4444',
                          borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <StatCards results={results} />
                  
                  {/* Results table */}
                  <div style={{ marginTop: 24 }}>
                    <RankingTable
                      results={results}
                      onSelect={setSelectedResult}
                      compareList={compareList}
                      onToggleCompare={handleToggleCompare}
                      explanations={explanations}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 3: ASK THE RESULTS */}
          {activeTab === 'ASK_RESULTS' && (
            <motion.div
              key="ask-results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{ maxWidth: 800, margin: '0 auto' }}
            >
              <p className="text-accent text-[10px] font-mono tracking-widest uppercase mb-1">INTERACTIVE JUDGE PANEL</p>
              <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 900, margin: '0 0 16px 0' }}>Ask the Results</h2>
              
              <div style={{
                height: 450, background: 'rgba(10,10,10,0.6)', border: '1px solid #1f1f1f',
                borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
                overflowY: 'auto', marginBottom: 16
              }}>
                {chatHistory.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#444' }}>
                    <p style={{ fontSize: 36, margin: '0 0 8px 0' }}>💬</p>
                    <p style={{ fontSize: 12, fontFamily: 'monospace', textAlign: 'center', maxWidth: 450, lineHeight: 1.5 }}>
                      Ask questions about the rankings, such as:<br />
                      "Why is candidate 3 ranked above candidate 12?"<br />
                      "Which candidates have PyTorch experience?"<br />
                      "Who is the safest hire and why?"
                    </p>
                  </div>
                )}

                {chatHistory.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      background: msg.role === 'user' ? '#CCFF00' : '#1e1e1e',
                      color: msg.role === 'user' ? '#000' : '#eee',
                      borderRadius: 8, padding: '10px 14px',
                      maxWidth: '75%', fontSize: 12, lineHeight: 1.6,
                      fontFamily: 'monospace', whiteSpace: 'pre-wrap'
                    }}
                  >
                    {msg.content}
                  </div>
                ))}

                {isChatLoading && (
                  <div style={{ alignSelf: 'flex-start', background: '#1e1e1e', color: '#888', borderRadius: 8, padding: '10px 14px', fontSize: 11, fontFamily: 'monospace' }}>
                    Thinking...
                  </div>
                )}
              </div>

              <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={chatQuery}
                  onChange={e => setChatQuery(e.target.value)}
                  placeholder="Ask a question about candidates..."
                  style={{
                    flex: 1, background: '#161616', border: '1px solid #333',
                    color: '#fff', borderRadius: 6, padding: 12, fontSize: 12, fontFamily: 'monospace',
                    outline: 'none'
                  }}
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !chatQuery.trim()}
                  style={{
                    background: '#CCFF00', color: '#000', border: 'none',
                    borderRadius: 6, padding: '0 20px', fontSize: 12, fontFamily: 'monospace',
                    fontWeight: 'bold', cursor: 'pointer'
                  }}
                >
                  SEND
                </button>
              </form>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Slide-over Profile Drawer */}
      <AnimatePresence>
        {selectedResult && (
          <CandidateDrawer
            result={selectedResult}
            onClose={() => setSelectedResult(null)}
            onCompare={handleToggleCompare}
            compareList={compareList}
          />
        )}
      </AnimatePresence>

      {/* Comparison Modal */}
      {showCompare && (
        <CompareModal
          compareList={compareList}
          onClose={() => setShowCompare(false)}
          onRemove={handleToggleCompare}
        />
      )}

      {/* Weights Override Adjustment Panel */}
      {showWeightsOverride && (
        <WeightPanel
          onRerank={handleRerank}
          onClose={() => setShowWeightsOverride(false)}
        />
      )}
    </>
  )
}
