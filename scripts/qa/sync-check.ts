// Two-device sync smoke test: host on A, join on B via invite code, scan on B, verify A updates.
// Usage: bun scripts/qa/sync-check.ts [origin]
import { chromium } from 'playwright'
const origin = process.argv[2] ?? 'http://127.0.0.1:5299'
const browser = await chromium.launch()
const opts = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const ctxA = await browser.newContext({ ...opts, permissions: ['clipboard-read', 'clipboard-write'] })
const ctxB = await browser.newContext(opts)
const [a, b] = [await ctxA.newPage(), await ctxB.newPage()]
for (const [n, p] of [['A', a], ['B', b]] as const) {
  p.on('console', (m) => m.type() === 'error' && console.log(n, 'console:', m.text()))
  p.on('pageerror', (e) => console.log(n, 'pageerror:', e.message))
  await p.goto(origin, { waitUntil: 'networkidle' })
  await p.evaluate(() => localStorage.clear())
  await p.reload({ waitUntil: 'networkidle' })
}
await a.getByRole('button', { name: 'Try with sample data' }).click()
await a.getByRole('button', { name: 'Devices' }).click()
await a.getByRole('button', { name: /^Host / }).click()
await a.waitForSelector('img[alt="Device sync invite QR"]')
await a.getByRole('button', { name: 'Copy code' }).click()
const invite = await a.evaluate(() => navigator.clipboard.readText())
console.log('invite length', invite.length)

await b.getByRole('button', { name: 'Join another device' }).click()
await b.getByPlaceholder('Paste invite code').fill(invite)
await b.getByPlaceholder('Paste invite code').press('Enter')
await b.waitForSelector('text=Scan mode', { timeout: 10000 })
console.log('B joined:', await b.locator('ion-title').innerText())
await b.screenshot({ path: '/tmp/ff-after/sync-b-joined.png' })
await b.getByPlaceholder(/ticket code/i).fill('TCK-1002')
await b.getByPlaceholder(/ticket code/i).press('Enter')
await b.waitForTimeout(1500)
await a.getByRole('button', { name: 'Scan' }).first().click()
const count = await a.locator('.mode-card.active .mode-count').innerText()
console.log('A entrance count after B scan:', count, count.startsWith('1') ? 'OK' : 'FAIL')
await a.screenshot({ path: '/tmp/ff-after/sync-a-hosting.png' })
// duplicate across devices
await a.getByPlaceholder(/ticket code/i).fill('TCK-1002')
await a.getByPlaceholder(/ticket code/i).press('Enter')
await a.waitForTimeout(300)
console.log('A rescans same ticket:', await a.locator('.result-card strong').innerText())
await browser.close()
