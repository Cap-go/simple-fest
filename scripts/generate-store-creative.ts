// Renders App Store creative assets (October 2026 App Store Connect specs) from the store screenshots.
// Run `bun run store:screenshots` first. Usage: bun scripts/generate-store-creative.ts
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const outDir = 'store/creative'
const shots = 'store/screenshots/ios-6.9'

// CSS size x scale = exact pixel size required by App Store Connect.
const assets = [
  { file: 'product-page-header-21x9.png', width: 1920, height: 823, scale: 2, layout: 'header' }, // 3840 x 1646
  { file: 'universal-16x9.png', width: 2622, height: 1475, scale: 2, layout: 'header' }, // 5244 x 2950 (header + search)
  { file: 'search-results-3x2.png', width: 1920, height: 1280, scale: 2, layout: 'search' }, // 3840 x 2560
] as const

const image = async (name: string) => `data:image/png;base64,${(await readFile(`${shots}/${name}`)).toString('base64')}`
const screens = {
  camera: await image('04-camera-scan.png'),
  result: await image('03-scan-result.png'),
  sync: await image('05-device-sync.png'),
}

function page(layout: 'header' | 'search') {
  const phone = (src: string, cls: string) => `<figure class="phone ${cls}"><img src="${src}" alt="" /></figure>`
  return `<!doctype html><html><head><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; }
  body {
    overflow: hidden;
    font-family: Inter, -apple-system, 'SF Pro Display', system-ui, sans-serif;
    color: #f8fafc;
    background:
      radial-gradient(60% 90% at 85% 110%, rgba(249, 115, 22, .55), transparent 60%),
      radial-gradient(55% 80% at 10% -10%, rgba(20, 184, 166, .45), transparent 60%),
      linear-gradient(135deg, #0b1220 0%, #0f2a2c 55%, #13322f 100%);
  }
  .stage { position: absolute; inset: 0; display: grid; }
  h1 { margin: 0; font-weight: 800; letter-spacing: -0.03em; line-height: 1.02; }
  p { margin: 0; color: rgba(248, 250, 252, .78); font-weight: 500; }
  .phone { margin: 0; border-radius: 9%/4.2%; padding: 1.1%; background: #05080f; box-shadow: 0 40px 90px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08); }
  .phone img { display: block; width: 100%; border-radius: 8%/3.7%; }

  /* Header: centered focal point, phones rising from the bottom edge. */
  .header { grid-template-rows: auto 1fr; justify-items: center; text-align: center; padding-top: 6.2vh; }
  .header h1 { font-size: 7.4vh; }
  .header p { margin-top: 1.6vh; font-size: 3vh; }
  .header .row { position: relative; width: 100%; }
  .header .phone { position: absolute; width: 15vw; max-width: 46vh; }
  .header .center { left: 50%; top: 5vh; transform: translateX(-50%); z-index: 2; width: 16.5vw; max-width: 52vh; }
  .header .left { left: 50%; top: 13vh; transform: translateX(-138%) rotate(-6deg); }
  .header .right { left: 50%; top: 13vh; transform: translateX(38%) rotate(6deg); }

  /* Search results: state the purpose, show the interface large. */
  .search { grid-template-columns: 0.9fr 1.1fr; align-items: center; padding: 0 5vw; gap: 3vw; }
  .search h1 { font-size: 7.6vw; }
  .search p { margin-top: 2.4vw; font-size: 2.3vw; line-height: 1.35; }
  .search .row { position: relative; height: 100%; }
  .search .phone { position: absolute; width: 19vw; }
  .search .center { left: 3vw; top: 10vh; z-index: 2; }
  .search .right { left: 23vw; top: 17vh; transform: rotate(5deg); }
  </style></head><body>
  ${
    layout === 'header'
      ? `<main class="stage header">
          <div><h1>Every ticket, checked in a second.</h1><p>Entrance, meals and drinks from one spreadsheet. Works offline.</p></div>
          <div class="row">${phone(screens.result, 'left')}${phone(screens.camera, 'center')}${phone(screens.sync, 'right')}</div>
        </main>`
      : `<main class="stage search">
          <div><h1>Scan tickets from any spreadsheet.</h1><p>Import a CSV, Excel file or Google Sheet and check entrance, meals and drinks. Works offline across devices.</p></div>
          <div class="row">${phone(screens.camera, 'center')}${phone(screens.result, 'right')}</div>
        </main>`
  }
  </body></html>`
}

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
for (const asset of assets) {
  const tab = await browser.newPage({ viewport: { width: asset.width, height: asset.height }, deviceScaleFactor: asset.scale })
  await tab.setContent(page(asset.layout), { waitUntil: 'load' })
  await tab.screenshot({ path: `${outDir}/${asset.file}`, omitBackground: false })
  await tab.close()
  console.log(`generated ${asset.file}`)
}
await browser.close()
