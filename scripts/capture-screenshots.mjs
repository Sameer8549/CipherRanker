import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const baseUrl = process.env.CIPHERRANKER_URL || 'http://127.0.0.1:5173'
const datasetPath = process.argv[2] || 'C:\\Users\\abdul\\Downloads\\candidates.jsonl'
const outDir = 'docs/screenshots'

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 })

await page.goto(baseUrl, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${outDir}/01-upload-flow.png`, fullPage: true })

await page.getByPlaceholder('Or enter a local .jsonl path for the fastest demo').fill(datasetPath)
await page.getByRole('button', { name: /run local/i }).click()
await page.waitForSelector('.result-shell', { timeout: 60000 })
await page.waitForTimeout(1000)
await page.screenshot({ path: `${outDir}/02-ranked-results.png`, fullPage: true })

const firstRow = page.locator('tbody tr').first()
if (await firstRow.count()) {
  await firstRow.click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${outDir}/03-evidence-drawer.png`, fullPage: true })
}

await browser.close()
console.log(JSON.stringify({
  screenshots: [
    `${outDir}/01-upload-flow.png`,
    `${outDir}/02-ranked-results.png`,
    `${outDir}/03-evidence-drawer.png`
  ]
}, null, 2))
