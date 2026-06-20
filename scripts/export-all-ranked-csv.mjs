import { readFile, writeFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { rankCandidates } from '../src/lib/scorer.js'

const candidatesPath = resolve(process.argv[2] || '')
const rankingPath = resolve(process.argv[3] || 'ranked_candidates_output.json')
const outputPath = resolve(process.argv[4] || 'ranked_candidates_all_100000.csv')

if (!process.argv[2]) {
  throw new Error('Usage: node scripts/export-all-ranked-csv.mjs <candidates.jsonl> [ranking.json] [output.csv]')
}

function parseCandidates(text) {
  try {
    const payload = JSON.parse(text)
    const list = Array.isArray(payload) ? payload : payload.candidates
    if (!Array.isArray(list)) throw new Error('Invalid candidate JSON')
    return list
  } catch {
    return text.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
      try { return JSON.parse(line) }
      catch { throw new Error(`Invalid JSONL on line ${index + 1}`) }
    })
  }
}

function csvCell(value) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

console.log('Reading candidate dataset...')
const candidates = parseCandidates(await readFile(candidatesPath, 'utf8'))
const previousRun = JSON.parse(await readFile(rankingPath, 'utf8'))
if (!previousRun.rubric) throw new Error('Consensus rubric is missing from the previous ranking output')

console.log(`Ranking all ${candidates.length} candidates with the verified consensus rubric...`)
const ranked = rankCandidates(candidates, null, previousRun.rubric, null)
const lines = ['Rank,Candidate ID,Score,Recommended']
for (const result of ranked) {
  lines.push([
    result.rank,
    csvCell(result.candidate.candidate_id),
    (result.score * 100).toFixed(2),
    result.rank <= 100 ? 'Yes' : 'No'
  ].join(','))
}

await writeFile(outputPath, `\uFEFF${lines.join('\r\n')}\r\n`, 'utf8')
const info = await stat(outputPath)
console.log(JSON.stringify({
  outputPath,
  rows: ranked.length,
  bytes: info.size,
  megabytes: Number((info.size / 1024 / 1024).toFixed(2)),
  withinUploadLimit: info.size <= 5 * 1024 * 1024,
  first: ranked[0]?.candidate.candidate_id,
  last: ranked.at(-1)?.candidate.candidate_id
}, null, 2))
