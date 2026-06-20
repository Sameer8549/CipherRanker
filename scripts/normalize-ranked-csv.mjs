import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const file = resolve(process.argv[2] || 'ranked_candidates_all_100000.csv')
const lines = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '').trim().split(/\r?\n/)
const header = lines.shift()
const rows = lines.map(line => {
  const [, candidateId, score] = line.split(',')
  return { candidateId, score: Number(score) }
})

rows.sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId))
const normalized = rows.map((row, index) => [
  index + 1,
  row.candidateId,
  row.score.toFixed(2),
  index < 100 ? 'Yes' : 'No'
].join(','))

await writeFile(file, `\uFEFF${header}\r\n${normalized.join('\r\n')}\r\n`, 'utf8')
console.log(`Normalized ${normalized.length} ranked rows`)
