// Captures every app state at phone + tablet size, light + dark, and reports console errors.
// Usage: bun scripts/qa/audit.ts <outDir> [origin]
import { chromium, type Page } from 'playwright'
const out = process.argv[2] ?? '/tmp/ff-audit'
const origin = process.argv[3] ?? 'http://127.0.0.1:5199'
const only = process.env.ONLY?.split(',')
const browser = await chromium.launch()
const errors: string[] = []
const sizes = [['phone', { width: 430, height: 932 }], ['tablet', { width: 834, height: 1194 }]] as const
for (const [label, viewport] of sizes) {
  for (const scheme of ['light', 'dark'] as const) {
    if (only && !only.includes(`${label}-${scheme}`)) continue
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
    const page = await ctx.newPage()
    page.on('console', (m) => m.type() === 'error' && errors.push(`${label}/${scheme}: ${m.text()}`))
    page.on('pageerror', (e) => errors.push(`${label}/${scheme} pageerror: ${e.message}`))
    const shot = (n: string, fullPage = false) => page.screenshot({ path: `${out}/${label}-${scheme}-${n}.png`, fullPage })
    await page.goto(origin, { waitUntil: 'networkidle' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await shot('01-onboarding')
    await page.getByRole('button', { name: 'Import guest list' }).click()
    await page.waitForTimeout(600)
    await shot('02-import')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Try with sample data' }).click()
    await page.waitForTimeout(1200)
    await shot('03-scan-home')
    for (const [code, n] of [['TCK-1001', 'accepted'], ['TCK-1001', 'duplicate'], ['TCK-1003', 'unpaid'], ['NOPE-9', 'unknown']]) {
      await manual(page, code)
      await page.waitForTimeout(400)
      await shot(`04-${n}`)
    }
    await shot('05-recent', true)
    await page.getByRole('button', { name: /^Scan / }).first().click()
    await page.waitForTimeout(600)
    await shot('06-camera')
    await page.getByLabel('Ticket code').fill('TCK-1002')
    await page.getByLabel('Ticket code').press('Enter')
    await page.waitForTimeout(400)
    await shot('07-camera-accepted')
    await page.getByLabel('Close scanner').click()
    await page.getByRole('button', { name: 'Devices' }).click()
    await page.waitForTimeout(300)
    await shot('08-devices')
    await page.getByRole('button', { name: /^Host / }).click()
    await page.waitForSelector('img[alt="Device sync invite QR"]', { timeout: 8000 }).catch(() => errors.push('no invite QR'))
    await page.waitForTimeout(1200)
    await shot('09-hosting', true)
    await page.getByRole('button', { name: 'Event' }).click()
    await page.waitForTimeout(300)
    await shot('10-event', true)
    await ctx.close()
  }
}
console.log(errors.length ? errors.join('\n') : 'no console errors')
await browser.close()

async function manual(page: Page, code: string) {
  const input = page.getByPlaceholder(/ticket code/i).first()
  await input.fill(code)
  await input.press('Enter')
}
