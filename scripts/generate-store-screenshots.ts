import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { chromium, type Browser, type Page } from 'playwright'
import { toDataURL } from 'qrcode'

const syncBackendUrl = process.env.SYNC_BACKEND_URL ?? 'https://simple-festival-sync.digitalshift-ee.workers.dev'
const deviceId = 'device-store-demo'
const dbKey = 'simple-festival.db.v1'
const deviceKey = 'simple-festival.device-id.v1'

const iosUserAgent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1'

type Target = { name: string; directory: string; width: number; height: number; deviceScaleFactor: number; ios: boolean }

// iPhone Duo sizes from App Store Connect: outer 1398 x 2034, inner 2007 x 2853 (portrait), at 3x.
const targets: Target[] = [
  { name: 'ios-6.9', directory: 'store/screenshots/ios-6.9', width: 440, height: 956, deviceScaleFactor: 3, ios: true },
  { name: 'ios-6.7', directory: 'store/screenshots/ios-6.7', width: 430, height: 932, deviceScaleFactor: 3, ios: true },
  { name: 'ios-6.5', directory: 'store/screenshots/ios-6.5', width: 428, height: 926, deviceScaleFactor: 3, ios: true },
  { name: 'ios-5.5', directory: 'store/screenshots/ios-5.5', width: 414, height: 736, deviceScaleFactor: 3, ios: true },
  { name: 'iphone-duo-outer-portrait', directory: 'store/screenshots/iphone-duo-outer-portrait', width: 466, height: 678, deviceScaleFactor: 3, ios: true },
  { name: 'iphone-duo-outer-landscape', directory: 'store/screenshots/iphone-duo-outer-landscape', width: 678, height: 466, deviceScaleFactor: 3, ios: true },
  { name: 'iphone-duo-inner-portrait', directory: 'store/screenshots/iphone-duo-inner-portrait', width: 669, height: 951, deviceScaleFactor: 3, ios: true },
  { name: 'iphone-duo-inner-landscape', directory: 'store/screenshots/iphone-duo-inner-landscape', width: 951, height: 669, deviceScaleFactor: 3, ios: true },
  { name: 'ipad-13', directory: 'store/screenshots/ipad-13', width: 1032, height: 1376, deviceScaleFactor: 2, ios: true },
  { name: 'android-phone', directory: 'store/screenshots/android-phone', width: 360, height: 640, deviceScaleFactor: 3, ios: false },
]
const only = process.env.ONLY?.split(',')

const columns = [
  'Ticket ID',
  'QR Code',
  'Name',
  'Email',
  'Paid',
  'Entrance scanned at',
  'Friday day pass',
  'Friday day scanned at',
  'Saturday day pass',
  'Saturday day scanned at',
  'Friday dinner',
  'Friday dinner scanned at',
  'Saturday lunch',
  'Saturday lunch scanned at',
  'Drink tokens',
  'Drink scanned at',
]

const rows = [
  {
    'Ticket ID': 'TCK-1001',
    'QR Code': 'TCK-1001',
    Name: 'Ada Lovelace',
    Email: 'ada@example.com',
    Paid: 'yes',
    'Entrance scanned at': '',
    'Friday day pass': 'yes',
    'Friday day scanned at': '',
    'Saturday day pass': 'yes',
    'Saturday day scanned at': '',
    'Friday dinner': 'yes',
    'Friday dinner scanned at': '',
    'Saturday lunch': 'yes',
    'Saturday lunch scanned at': '',
    'Drink tokens': '2',
    'Drink scanned at': '',
  },
  {
    'Ticket ID': 'TCK-1002',
    'QR Code': 'TCK-1002',
    Name: 'Grace Hopper',
    Email: 'grace@example.com',
    Paid: 'yes',
    'Entrance scanned at': '',
    'Friday day pass': 'yes',
    'Friday day scanned at': '',
    'Saturday day pass': 'no',
    'Saturday day scanned at': '',
    'Friday dinner': 'no',
    'Friday dinner scanned at': '',
    'Saturday lunch': 'yes',
    'Saturday lunch scanned at': '',
    'Drink tokens': '1',
    'Drink scanned at': '',
  },
  {
    'Ticket ID': 'TCK-1003',
    'QR Code': 'TCK-1003',
    Name: 'Alan Turing',
    Email: 'alan@example.com',
    Paid: 'no',
    'Entrance scanned at': '',
    'Friday day pass': 'yes',
    'Friday day scanned at': '',
    'Saturday day pass': 'yes',
    'Saturday day scanned at': '',
    'Friday dinner': 'yes',
    'Friday dinner scanned at': '',
    'Saturday lunch': 'yes',
    'Saturday lunch scanned at': '',
    'Drink tokens': '0',
    'Drink scanned at': '',
  },
]

const demoDb = {
  id: 'simple-festival-store-demo',
  name: 'Summer Fest 2026',
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:24:00.000Z',
  deviceId,
  columns,
  records: rows.map((values, index) => ({
    localId: `row-${String(values['Ticket ID']).toLowerCase()}-${index + 1}`,
    values,
  })),
  schema: {
    version: 1,
    source: 'heuristic',
    confidence: 0.95,
    columns,
    idColumn: 'Ticket ID',
    codeColumn: 'QR Code',
    nameColumn: 'Name',
    emailColumn: 'Email',
    paidColumn: 'Paid',
    warnings: [],
    services: [
      { id: 'entrance', label: 'Entrance', kind: 'entrance', consumedColumn: 'Entrance scanned at', confidence: 0.78 },
      { id: 'friday-day-pass', label: 'Friday day pass', kind: 'day', entitlementColumn: 'Friday day pass', consumedColumn: 'Friday day scanned at', confidence: 0.78 },
      { id: 'saturday-day-pass', label: 'Saturday day pass', kind: 'day', entitlementColumn: 'Saturday day pass', consumedColumn: 'Saturday day scanned at', confidence: 0.78 },
      { id: 'friday-dinner', label: 'Friday dinner', kind: 'food', entitlementColumn: 'Friday dinner', consumedColumn: 'Friday dinner scanned at', confidence: 0.78 },
      { id: 'saturday-lunch', label: 'Saturday lunch', kind: 'food', entitlementColumn: 'Saturday lunch', consumedColumn: 'Saturday lunch scanned at', confidence: 0.78 },
      { id: 'drink-tokens', label: 'Drink tokens', kind: 'drink', quotaColumn: 'Drink tokens', consumedColumn: 'Drink scanned at', confidence: 0.78 },
    ],
  },
  events: [],
}

const scenes = [
  {
    fileName: '01-import.png',
    prepare: async (page: Page) => {
      await clearDemo(page)
      await page.waitForSelector('text=Import guest list')
    },
  },
  {
    fileName: '02-dynamic-home.png',
    prepare: async (page: Page) => {
      await seedDemo(page)
    },
  },
  {
    fileName: '03-scan-result.png',
    prepare: async (page: Page) => {
      await seedDemo(page)
      await page.getByPlaceholder(/ticket code/i).fill('TCK-1001')
      await page.getByPlaceholder(/ticket code/i).press('Enter')
      await page.waitForSelector('.result-card')
      await page.locator('.result-card').scrollIntoViewIfNeeded()
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    },
  },
  {
    fileName: '04-camera-scan.png',
    prepare: async (page: Page) => {
      await seedDemo(page)
      await page.getByRole('button', { name: /^Scan / }).first().click()
      await page.waitForSelector('.camera-screen')
      const frame = await page.locator('.camera-screen .frame').boundingBox()
      const cameraFeed = await renderCameraFeed(page, frame)
      await page.getByLabel('Ticket code').fill('TCK-1002')
      await page.getByLabel('Ticket code').press('Enter')
      await page.addStyleTag({
        content: `.camera-screen { background: #05080f url(${cameraFeed}) center / cover no-repeat !important; } .camera-screen .manual { display: none !important; }`,
      })
      await page.waitForSelector('.camera-screen .result-card')
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      await page.waitForTimeout(300)
    },
  },
  {
    fileName: '05-device-sync.png',
    prepare: async (page: Page) => {
      await seedDemo(page)
      await page.getByRole('button', { name: 'Devices', exact: true }).click()
      await page.getByRole('button', { name: /^Host / }).click()
      await page.waitForSelector('img[alt="Device sync invite QR"]')
      await page.waitForTimeout(800)
    },
  },
]

async function main() {
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const server = await startVite(port)
  const browser = await chromium.launch({ headless: true })

  try {
    await waitForServer(origin)

    for (const target of targets) {
      if (only && !only.includes(target.name)) {
        continue
      }
      await mkdir(target.directory, { recursive: true })
      const context = await browser.newContext({
        viewport: { width: target.width, height: target.height },
        deviceScaleFactor: target.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
        colorScheme: 'light',
        userAgent: target.ios ? iosUserAgent : undefined,
      })
      const page = await context.newPage()

      for (const scene of scenes) {
        await page.goto(origin, { waitUntil: 'networkidle' })
        await scene.prepare(page)
        await page.screenshot({
          path: `${target.directory}/${scene.fileName}`,
          fullPage: false,
          scale: 'device',
        })
      }

      await context.close()
      console.log(`generated ${target.name}`)
    }
  } finally {
    await browser.close()
    stopServer(server)
  }
}

// The camera preview is native, so screenshots composite a ticket in front of the lens behind the scanner UI.
async function renderCameraFeed(appPage: Page, frame: { x: number; y: number; width: number; height: number } | null) {
  const qr = await toDataURL('TCK-1002', { width: 600, margin: 1 })
  const viewport = appPage.viewportSize() ?? { width: 430, height: 932 }
  const browser = appPage.context().browser() as Browser
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  const box = frame ?? { x: viewport.width * 0.2, y: viewport.height * 0.3, width: viewport.width * 0.6, height: viewport.width * 0.6 }
  // Ticket sized so its QR fills about 80% of the scan frame, centered on it.
  const ticketWidth = box.width * 0.95
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <div style="position:fixed;inset:0;overflow:hidden;background:radial-gradient(120% 80% at 30% 10%,#3b2a1a,#120c10 55%,#05060a)">
      <div style="position:absolute;inset:-40px;filter:blur(28px);opacity:.9">
        ${[
          [12, 8, 120, '#f59e0b'],
          [78, 14, 160, '#fb7185'],
          [55, 4, 90, '#fde68a'],
          [88, 70, 140, '#2dd4bf'],
          [6, 78, 170, '#f97316'],
          [40, 92, 120, '#a78bfa'],
        ]
          .map(([x, y, r, c]) => `<span style="position:absolute;left:${x}%;top:${y}%;width:${r}px;height:${r}px;border-radius:50%;background:${c};opacity:.55"></span>`)
          .join('')}
      </div>
      <div style="position:absolute;left:${centerX}px;top:${centerY}px;width:${ticketWidth}px;transform:translate(-50%,-50%) rotate(-4deg);font-family:system-ui;color:#1f2937;filter:blur(.4px)">
        <div style="position:absolute;left:-9%;right:-9%;top:-40%;bottom:-24%;border-radius:${ticketWidth * 0.06}px;background:#f8f5ee;box-shadow:0 30px 60px rgba(0,0,0,.55)"></div>
        <div style="position:absolute;left:0;top:-36%;font-size:${ticketWidth * 0.075}px;font-weight:800;letter-spacing:.08em">SUMMER FEST 2026</div>
        <div style="position:absolute;left:0;top:-23%;font-size:${ticketWidth * 0.05}px;opacity:.7">Weekend pass · Grace Hopper</div>
        <img src="${qr}" style="position:relative;width:84%;margin-left:8%;display:block;border-radius:4px" />
        <div style="position:absolute;left:0;bottom:-15%;font-size:${ticketWidth * 0.05}px;font-family:ui-monospace,monospace;letter-spacing:.1em">TCK-1002</div>
      </div>
    </div></body></html>`)
  const png = await page.screenshot({ type: 'jpeg', quality: 85 })
  await page.close()
  return `data:image/jpeg;base64,${png.toString('base64')}`
}

async function clearDemo(page: Page) {
  await page.evaluate(
    ({ dbKey, deviceKey }) => {
      localStorage.removeItem(dbKey)
      localStorage.setItem(deviceKey, 'device-store-demo')
    },
    { dbKey, deviceKey },
  )
  await page.reload({ waitUntil: 'networkidle' })
}

async function seedDemo(page: Page) {
  await page.evaluate(
    ({ dbKey, deviceKey, demoDb }) => {
      localStorage.setItem(deviceKey, 'device-store-demo')
      localStorage.setItem(dbKey, JSON.stringify(demoDb))
    },
    { dbKey, deviceKey, demoDb },
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.mode-card')
}

async function startVite(port: number) {
  const command = process.platform === 'win32' ? 'bunx.cmd' : 'bunx'
  const server = spawn(command, ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    env: { ...process.env, VITE_SYNC_BACKEND_URL: syncBackendUrl },
    stdio: 'pipe',
  })

  server.stderr.on('data', (chunk) => process.stderr.write(chunk))
  server.stdout.on('data', (chunk) => process.stdout.write(chunk))

  server.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`vite exited with code ${code}`)
    }
  })

  return server
}

function stopServer(server: ChildProcessWithoutNullStreams) {
  if (!server.killed) {
    server.kill('SIGTERM')
  }
}

async function waitForServer(origin: string) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin)
      if (response.ok) {
        return
      }
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${origin}`)
}

async function freePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address !== 'object' || !address) {
        server.close(() => reject(new Error('Could not allocate a local port')))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

await main()
