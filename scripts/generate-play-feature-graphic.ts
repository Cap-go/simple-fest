// Google Play feature graphic (1024 x 500), same black frame and type as the captioned screenshots.
// Usage: bun scripts/generate-store-screenshots.ts && bun scripts/generate-play-feature-graphic.ts
import { chromium } from 'playwright'

const dataUrl = async (path: string) => `data:image/png;base64,${Buffer.from(await Bun.file(path).arrayBuffer()).toString('base64')}`
const icon = await dataUrl('public/app-icon.png')
const shot = await dataUrl('store/screenshots/android-phone/04-camera-scan.png')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 })
await page.setContent(`<!doctype html><html><head><style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1024px; height: 500px; overflow: hidden; display: flex; align-items: center; gap: 48px; padding: 0 64px;
    background: #000; color: #f5f5f7; font-family: -apple-system, 'SF Pro Display', system-ui, sans-serif; -webkit-font-smoothing: antialiased;
  }
  .copy { flex: 1; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 600; }
  .brand img { width: 56px; height: 56px; border-radius: 13px; outline: 1px solid rgba(255,255,255,0.18); }
  h1 { margin-top: 28px; font-size: 54px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.04; }
  p { margin-top: 16px; font-size: 22px; line-height: 1.35; color: #a1a1a6; }
  .phone { align-self: flex-start; margin-top: 56px; width: 280px; border-radius: 28px; outline: 1px solid rgba(255,255,255,0.18); }
</style></head><body>
  <div class="copy">
    <div class="brand"><img src="${icon}" alt="" />Simple Fest</div>
    <h1>Scan QR tickets<br>at the door</h1>
    <p>Import a guest list from CSV, Excel or Google Sheets. Works offline, syncs every staff phone.</p>
  </div>
  <img class="phone" src="${shot}" alt="" />
</body></html>`)
await page.waitForFunction(() => [...document.images].every((image) => image.complete))
await page.screenshot({ path: 'store/assets/play-store-feature-graphic.png' })
await browser.close()
