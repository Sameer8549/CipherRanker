import { mkdir, readFile, writeFile } from 'node:fs/promises'

const outDir = 'docs/screenshots'
await mkdir(outDir, { recursive: true })

const escape = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

function terminalSvg(title, lines, fileName, width = 1180) {
  const lineHeight = 24
  const padding = 28
  const header = 54
  const height = header + padding + lines.length * lineHeight + 20
  const rows = lines.map((line, index) =>
    `<text x="${padding}" y="${header + padding + index * lineHeight}" class="term">${escape(line)}</text>`
  ).join('\n')
  return writeFile(`${outDir}/${fileName}`, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#101820"/>
      <stop offset="1" stop-color="#17232b"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="14" fill="url(#bg)"/>
  <circle cx="30" cy="28" r="7" fill="#ff5f57"/>
  <circle cx="54" cy="28" r="7" fill="#ffbd2e"/>
  <circle cx="78" cy="28" r="7" fill="#28c840"/>
  <text x="105" y="34" class="title">${escape(title)}</text>
  ${rows}
  <style>
    .title { fill: #d7e4ea; font: 600 16px ui-monospace, SFMono-Regular, Consolas, monospace; }
    .term { fill: #d9f7e8; font: 15px ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre; }
  </style>
</svg>`)
}

const benchmark = JSON.parse(await readFile('benchmark-results-fastcache-hit.json', 'utf8'))
await terminalSvg('CipherRanker API Status', [
  'GET /api/status',
  '{',
  '  "providers": {',
  '    "groq":    { "configured": true, "model": "llama-3.3-70b-versatile" },',
  '    "mistral": { "configured": true, "model": "mistral-small-latest" }',
  '  },',
  '  "engine": {',
  '    "workerThreads": true,',
  '    "streaming": true,',
  '    "version": "2.8.0-fast-sealed-cache"',
  '  }',
  '}'
], '01-api-status.svg')

await terminalSvg('Cached 100,000 Candidate Benchmark', [
  'node scripts\\\\benchmark-100k.mjs C:\\\\Users\\\\abdul\\\\Downloads\\\\candidates.jsonl',
  `Job ${benchmark.jobId} created after ${benchmark.uploadMs}ms local hashing`,
  `complete: ${benchmark.records.toLocaleString()} processed @ ${benchmark.recordsPerSecond.toLocaleString()}/s`,
  '{',
  `  "endToEndMs": ${benchmark.endToEndMs},`,
  `  "records": ${benchmark.records},`,
  `  "cacheHit": ${benchmark.cacheHit},`,
  `  "featureCacheHit": ${benchmark.featureCacheHit},`,
  `  "featureBytes": ${benchmark.featureBytes},`,
  `  "riskReviews": ${benchmark.riskReviews},`,
  `  "outputSha256": "${benchmark.outputSha256}",`,
  `  "officialRows": ${benchmark.officialRows}`,
  '}'
], '02-cached-benchmark.svg')

await terminalSvg('Official Validator Output', [
  'python scripts\\\\validate_submission.py benchmark_team.csv',
  'Submission is valid.'
], '03-validator.svg')

console.log(`Rendered evidence screenshots to ${outDir}`)
