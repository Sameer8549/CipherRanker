import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve(process.argv[2] || 'ranked_candidates_output.json')
const destination = resolve(process.argv[3] || 'ranked_candidates_submission.csv')

const data = JSON.parse(await readFile(source, 'utf8'))
if (!Array.isArray(data.rankings) || !data.rankings.length) {
  throw new Error('The ranking output does not contain any candidates')
}

const columns = [
  ['Rank', row => row.rank],
  ['Candidate ID', row => row.candidate_id],
  ['Candidate Name', row => row.name],
  ['Current Title', row => row.title],
  ['Final Score', row => row.score],
  ['Career Score', row => Number((row.components?.career * 100 || 0).toFixed(2))],
  ['Skill Score', row => Number((row.components?.skills * 100 || 0).toFixed(2))],
  ['Experience Score', row => Number((row.components?.experience * 100 || 0).toFixed(2))],
  ['Location Score', row => Number((row.components?.location * 100 || 0).toFixed(2))],
  ['Education Score', row => Number((row.components?.education * 100 || 0).toFixed(2))],
  ['Behavioral Multiplier', row => Number((row.behavioral_multiplier || 0).toFixed(4))],
  ['Honeypot Flag', row => row.honeypot ? 'Yes' : 'No'],
  ['Recommendation', row => row.rank <= 10 ? 'Strongly Recommend' : row.rank <= 30 ? 'Recommend' : row.rank <= 60 ? 'Consider' : 'Reserve'],
  ['Local Reasoning', row => row.local_reasoning],
  ['Groq Fit Score', row => row.ai_assessments?.groq?.fit_score ?? ''],
  ['Groq Explanation', row => row.ai_assessments?.groq?.explanation ?? ''],
  ['Mistral Fit Score', row => row.ai_assessments?.mistral?.fit_score ?? ''],
  ['Mistral Explanation', row => row.ai_assessments?.mistral?.explanation ?? '']
]

function cell(value) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const rows = [
  columns.map(([heading]) => cell(heading)).join(','),
  ...data.rankings.map(row => columns.map(([, getter]) => cell(getter(row))).join(','))
]

await writeFile(destination, `\uFEFF${rows.join('\r\n')}\r\n`, 'utf8')
console.log(JSON.stringify({
  destination,
  candidates: data.rankings.length,
  columns: columns.length
}))
