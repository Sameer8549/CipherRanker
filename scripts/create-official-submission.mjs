import { createReadStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { scoreCandidate } from '../src/lib/scorer.js'
import { generateReasoning } from '../src/lib/reasoning.js'

const candidatesPath = resolve(process.argv[2] || '')
const rankedCsvPath = resolve(process.argv[3] || 'ranked_candidates_all_100000.csv')
const rankingJsonPath = resolve(process.argv[4] || 'ranked_candidates_output.json')
const outputPath = resolve(process.argv[5] || 'team_cipher.csv')

if (!process.argv[2]) {
  throw new Error('Usage: node scripts/create-official-submission.mjs <candidates.jsonl> [ranked.csv] [ranking.json] [team_cipher.csv]')
}

const rankedLines = (await readFile(rankedCsvPath, 'utf8')).replace(/^\uFEFF/, '').trim().split(/\r?\n/)
rankedLines.shift()
const shortlist = rankedLines.slice(0, 100).map(line => {
  const [rank, candidateId, score] = line.split(',')
  return { rank: Number(rank), candidateId, score: Number(score) / 100 }
})

const wantedIds = new Set(shortlist.map(item => item.candidateId))
const candidates = new Map()
const lines = createInterface({ input: createReadStream(candidatesPath, { encoding: 'utf8' }), crlfDelay: Infinity })
for await (const line of lines) {
  if (!line.trim()) continue
  const candidate = JSON.parse(line)
  if (wantedIds.has(candidate.candidate_id)) candidates.set(candidate.candidate_id, candidate)
}

if (candidates.size !== 100) {
  const missing = [...wantedIds].filter(id => !candidates.has(id))
  throw new Error(`Could not find all shortlisted candidates. Missing: ${missing.join(', ')}`)
}

const rankingRun = JSON.parse(await readFile(rankingJsonPath, 'utf8'))
const rubric = rankingRun.rubric
if (!rubric) throw new Error('Consensus rubric is missing')

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const rows = ['candidate_id,rank,score,reasoning']
for (const item of shortlist) {
  const candidate = candidates.get(item.candidateId)
  const { components } = scoreCandidate(candidate, null, rubric)
  const reasoning = generateReasoning(candidate, item.rank, components)
  rows.push([
    item.candidateId,
    item.rank,
    item.score.toFixed(6),
    csvCell(reasoning)
  ].join(','))
}

await writeFile(outputPath, `${rows.join('\r\n')}\r\n`, 'utf8')
console.log(JSON.stringify({ outputPath, rows: shortlist.length }, null, 2))
