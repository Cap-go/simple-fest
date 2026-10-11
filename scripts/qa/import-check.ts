// Import smoke test: CSV file, XLSX file, CSV URL, not-entitled state, export download.
// Usage: bun scripts/qa/import-check.ts [origin]
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'
import * as XLSX from 'xlsx'
import { exampleColumns, exampleCsv, exampleRows } from '../../src/domain/sampleSheet'

const origin = process.argv[2] ?? 'http://127.0.0.1:5299'
const dir = '/tmp/ff-import'
await mkdir(dir, { recursive: true })
await writeFile(`${dir}/guests.csv`, exampleCsv())
// Served by the Vite dev server for the URL import path.
await writeFile('public/__import-test.csv', exampleCsv())
const sheet = XLSX.utils.json_to_sheet(exampleRows, { header: [...exampleColumns] })
const book = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(book, sheet, 'Guests')
await writeFile(`${dir}/guests.xlsx`, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, acceptDownloads: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror:', e.message))
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()))
await page.goto(origin, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })

for (const file of ['guests.csv', 'guests.xlsx']) {
  await openImport(page)
  await page.locator('input[type=file]').setInputFiles(`${dir}/${file}`)
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.waitForTimeout(1200)
  console.log(file, '->', await page.locator('ion-title').first().innerText(), '| modes:', await page.locator('.modes button').count())
}

await openImport(page)
await page.waitForTimeout(3000)
await page.locator('ion-segment-button').nth(1).click()
  await page.waitForTimeout(300)
await page.getByLabel('Sheet or CSV link').fill(`${origin}/__import-test.csv`)
await page.getByLabel('Event name (optional)').fill('URL Fest')
await page.getByRole('button', { name: 'Import', exact: true }).click()
await page.waitForTimeout(1500)
console.log('url ->', await page.locator('ion-title').first().innerText())

await page.getByRole('radio', { name: /Saturday day pass/ }).click()
await page.getByPlaceholder(/ticket code/i).fill('TCK-1002')
await page.getByPlaceholder(/ticket code/i).press('Enter')
console.log('not entitled ->', await page.locator('.scan-screen .last strong').innerText())

await page.getByRole('button', { name: 'Event', exact: true }).click()
const download = page.waitForEvent('download')
await page.getByText('Export scans as CSV').click()
console.log('export ->', (await download).suggestedFilename())
await browser.close()
await rm('public/__import-test.csv', { force: true })

async function openImport(page: Page) {
  const first = page.getByRole('button', { name: 'Import guest list' })
  if (await first.count()) {
    await first.click()
  } else {
    await page.getByRole('button', { name: 'Event', exact: true }).click()
    await page.getByText('Import a new guest list').click()
  }
  await page.waitForTimeout(500)
}
