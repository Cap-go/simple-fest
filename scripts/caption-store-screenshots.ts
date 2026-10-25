// Wraps the raw app screenshots in store frames with a headline. App Store indexes caption text,
// so headlines carry the search keywords. Reads store/screenshots/<target>, writes store/listing/<target>.
// Usage: bun scripts/generate-store-screenshots.ts && bun scripts/caption-store-screenshots.ts
import { mkdir, readdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const source = 'store/screenshots'
const output = 'store/listing'
const only = process.env.ONLY?.split(',')
const onlyScenes = process.env.ONLY_SCENES?.split(',')

const captions: Record<string, [string, string]> = {
  '04-camera-scan': ['Scan QR tickets\nat the door', 'Fast check-in for festivals and events'],
  '03-scan-result': ['Know in a second', 'Valid, already used or not paid, with the guest name'],
  '01-import': ['Import any guest list', 'CSV, Excel or Google Sheets. Columns are detected for you.'],
  '02-dynamic-home': ['Entry, day passes,\nmeals, drinks', 'Every checkpoint from one spreadsheet'],
  '05-device-sync': ['Sync every staff phone', 'Works offline and catches up when back online'],
}

const browser = await chromium.launch({ headless: true })
try {
  for (const target of await readdir(source)) {
    if (only && !only.includes(target)) continue
    await mkdir(`${output}/${target}`, { recursive: true })
    for (const scene of Object.keys(captions)) {
      if (onlyScenes && !onlyScenes.includes(scene)) continue
      const file = Bun.file(`${source}/${target}/${scene}.png`)
      if (!(await file.exists())) continue
      const bytes = Buffer.from(await file.arrayBuffer())
      // PNG header: width and height are big-endian at byte 16 and 20.
      const width = bytes.readUInt32BE(16)
      const height = bytes.readUInt32BE(20)
      const scale = target === 'ipad-13' ? 2 : 3
      const page = await browser.newPage({ viewport: { width: width / scale, height: height / scale }, deviceScaleFactor: scale })
      await page.setContent(frame(captions[scene], `data:image/png;base64,${bytes.toString('base64')}`, width > height))
      await page.waitForFunction(() => document.images[0]?.complete)
      await page.screenshot({ path: `${output}/${target}/${scene}.png`, scale: 'device' })
      await page.close()
    }
    console.log(`captioned ${target}`)
  }
} finally {
  await browser.close()
}

function frame([headline, detail]: [string, string], image: string, landscape: boolean) {
  return `<!doctype html><html><head><style>
    * { margin: 0; box-sizing: border-box; }
    html, body { width: 100vw; height: 100vh; overflow: hidden; }
    body {
      display: flex; flex-direction: ${landscape ? 'row' : 'column'}; align-items: center; gap: ${landscape ? '4vw' : '3vh'};
      padding: ${landscape ? '6vh 5vw' : '7vh 6vw 0'};
      background: #000; color: #f5f5f7;
      font-family: -apple-system, 'SF Pro Display', system-ui, sans-serif; -webkit-font-smoothing: antialiased;
    }
    .copy { flex: ${landscape ? '0 0 34%' : 'none'}; text-align: ${landscape ? 'left' : 'center'}; }
    h1 { font-size: ${landscape ? '5.2vw' : 'min(8.6vw, 5.4vh)'}; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
    p { margin-top: 1.2vh; font-size: ${landscape ? '2.2vw' : 'min(4.2vw, 2.5vh)'}; line-height: 1.3; color: #a1a1a6; }
    .shot { flex: 1; min-height: 0; min-width: 0; display: flex; justify-content: center; align-items: ${landscape ? 'center' : 'flex-start'}; height: 100%; }
    img {
      max-width: 100%; max-height: ${landscape ? '100%' : 'calc(100% - 5vh)'}; object-fit: contain;
      border-radius: ${landscape ? '2.4vw' : 'min(6vw, 3vh)'}; outline: 1px solid rgba(255,255,255,0.18);
    }
  </style></head><body>
    <div class="copy"><h1>${headline.replace('\n', '<br>')}</h1><p>${detail}</p></div>
    <div class="shot"><img src="${image}" alt="" /></div>
  </body></html>`
}
