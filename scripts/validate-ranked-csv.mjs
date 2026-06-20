import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const file = resolve(process.argv[2] || 'ranked_candidates_all_100000.csv')
const lines = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '').trim().split(/\r?\n/)
const header = lines.shift()
const ids = new Set()
let previousScore = Infinity
let recommended = 0
const errors = []

for (let index = 0; index < lines.length; index++) {
  const [rank, candidateId, score, isRecommended] = lines[index].split(',')
  if (Number(rank) !== index + 1) errors.push(`Rank mismatch at row ${index + 2}`)
  if (ids.has(candidateId)) errors.push(`Duplicate candidate ID ${candidateId}`)
  ids.add(candidateId)
  const numericScore = Number(score)
  if (!Number.isFinite(numericScore)) errors.push(`Invalid score at rank ${rank}`)
  if (numericScore > previousScore) errors.push(`Score order error at rank ${rank}: ${numericScore} after ${previousScore}`)
  previousScore = numericScore
  if (isRecommended === 'Yes') recommended++
  if (errors.length >= 10) break
}

const info = await stat(file)
console.log(JSON.stringify({
  valid: errors.length === 0 && lines.length === 100000 && ids.size === 100000 && recommended === 100,
  header,
  rows: lines.length,
  uniqueCandidateIds: ids.size,
  recommended,
  sizeBytes: info.size,
  sizeMB: Number((info.size / 1024 / 1024).toFixed(2)),
  errors
}, null, 2))
