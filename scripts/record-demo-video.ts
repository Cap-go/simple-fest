import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, rename, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { chromium, type Page } from 'playwright'

// Records the website demo video from the web build: guests scanned at the door, a duplicate, an unpaid ticket, then device sync.
const syncBackendUrl = process.env.SYNC_BACKEND_URL ?? 'https://simple-festival-sync.digitalshift-ee.workers.dev'
const deviceId = 'device-store-demo'
const dbKey = 'simple-festival.db.v1'
const deviceKey = 'simple-festival.device-id.v1'
const outDir = 'website/public/video'
const viewport = { width: 390, height: 844 }

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

async function scan(page: Page, code: string) {
  const input = page.getByPlaceholder(/ticket code/i)
  await input.click()
  await input.pressSequentially(code, { delay: 90 })
  await input.press('Enter')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.waitForTimeout(1800)
}

async function main() {
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const server = await startVite(port)
  const browser = await chromium.launch({ headless: true })
  await rm(`${outDir}/raw`, { recursive: true, force: true })
  await mkdir(`${outDir}/raw`, { recursive: true })

  try {
    await waitForServer(origin)
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'light',
      recordVideo: { dir: `${outDir}/raw`, size: viewport },
    })
    const page = await context.newPage()
    await page.goto(origin, { waitUntil: 'networkidle' })
    await page.evaluate(({ dbKey, deviceKey }) => {
      localStorage.removeItem(dbKey)
      localStorage.setItem(deviceKey, 'device-store-demo')
    }, { dbKey, deviceKey })
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('text=Import guest list')
    await page.waitForTimeout(1500)

    await seedDemo(page)
    await page.waitForTimeout(1200)
    await scan(page, 'ada@example.com')
    await scan(page, 'TCK-1002')
    await scan(page, 'TCK-1001')
    await scan(page, 'TCK-1003')

    await page.getByText('Friday day pass', { exact: false }).first().click()
    await page.waitForTimeout(900)
    await scan(page, 'TCK-1002')

    await page.getByRole('button', { name: 'Devices', exact: true }).click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /^Host / }).click()
    await page.waitForSelector('img[alt="Device sync invite QR"]')
    await page.waitForTimeout(2500)

    const video = page.video()
    await context.close()
    const raw = await video!.path()
    await rename(raw, `${outDir}/raw/demo.webm`)
    await encode(`${outDir}/raw/demo.webm`)
    await rm(`${outDir}/raw`, { recursive: true, force: true })
  } finally {
    await browser.close()
    stopServer(server)
  }
}

async function encode(input: string) {
  const ffmpeg = (args: string[]) =>
    new Promise<void>((resolve, reject) => {
      spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }).on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))))
    })
  await ffmpeg(['-i', input, '-ss', '0.6', '-vf', 'fps=30', '-c:v', 'libx264', '-crf', '22', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', `${outDir}/demo.mp4`])
  await ffmpeg(['-ss', '6', '-i', `${outDir}/demo.mp4`, '-frames:v', '1', '-q:v', '3', `${outDir}/poster.jpg`])
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
  await page.waitForSelector('.scan-screen')
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
