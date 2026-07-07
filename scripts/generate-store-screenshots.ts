import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { chromium, type Page } from 'playwright'

const syncBackendUrl = 'https://simple-festival-sync.digitalshift-ee.workers.dev'
const deviceId = 'device-store-demo'
const dbKey = 'simple-festival.db.v1'
const deviceKey = 'simple-festival.device-id.v1'

const targets = [
  { name: 'ios-6.7', directory: 'store/screenshots/ios-6.7', width: 430, height: 932, deviceScaleFactor: 3 },
  { name: 'ios-6.5', directory: 'store/screenshots/ios-6.5', width: 428, height: 926, deviceScaleFactor: 3 },
  { name: 'ios-5.5', directory: 'store/screenshots/ios-5.5', width: 414, height: 736, deviceScaleFactor: 3 },
  { name: 'android-phone', directory: 'store/screenshots/android-phone', width: 360, height: 640, deviceScaleFactor: 3 },
]

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
  name: 'Simple Festival Demo',
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
      await page.waitForSelector('text=Import a festival sheet')
      await page.evaluate(() => window.scrollTo(0, 0))
    },
  },
  {
    fileName: '02-dynamic-home.png',
    prepare: async (page: Page) => {
      await seedDemo(page)
      await page.locator('.modes-panel').scrollIntoViewIfNeeded()
      await page.waitForSelector('text=Drink tokens')
    },
  },
  {
    fileName: '03-scan-result.png',
    prepare: async (page: Page) => {
      await seedDemo(page)
      await page.getByPlaceholder('Ticket code or email').fill('TCK-1001')
      await page.getByRole('button', { name: 'Validate' }).click()
      await page.waitForSelector('text=Accepted')
      await page.locator('.scanner-layout').scrollIntoViewIfNeeded()
    },
  },
  {
    fileName: '04-device-sync.png',
    prepare: async (page: Page) => {
      await seedDemo(page)
      await page.getByRole('button', { name: 'Host festival' }).click()
      await page.waitForSelector('img[alt="Device sync invite QR"]')
      await page.locator('.sync-panel').scrollIntoViewIfNeeded()
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
      await mkdir(target.directory, { recursive: true })
      const context = await browser.newContext({
        viewport: { width: target.width, height: target.height },
        deviceScaleFactor: target.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
        colorScheme: 'light',
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
  await page.waitForSelector('text=Festival Scan Demo')
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
