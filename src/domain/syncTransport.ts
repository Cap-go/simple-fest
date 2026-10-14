import type { FestivalDb, ScanEvent, SyncInvite, SyncMessage, SyncStatus } from './types'

export type SyncHandlers = {
  getDatabase: () => FestivalDb | null
  onSnapshot: (db: FestivalDb) => void
  onScanEvent: (event: ScanEvent) => void
  onStatus: (status: SyncStatus) => void
}

type ServerSyncMessage = {
  kind: 'peer-count'
  secret: string
  peers: number
}

type IncomingSyncMessage = SyncMessage | ServerSyncMessage

type SyncSocket = Pick<WebSocket, 'readyState' | 'send' | 'close'> & {
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
}

type SyncControllerOptions = {
  backendUrl?: string
  createSocket?: (url: string) => SyncSocket
}

const socketOpen = 1
const deployedSyncBackendUrl = 'https://simple-festival-sync.digitalshift-ee.workers.dev'
const defaultSyncStatus: SyncStatus = { mode: 'off', peers: 0, message: 'Sync off' }

export type SyncSession = { invite: SyncInvite; role: 'host' | 'peer'; deviceId?: string }

// Reconnect delays after an unexpected disconnect (network drop, app suspended by the OS).
const reconnectDelaysMs = [1000, 2000, 5000, 10000, 30000]

export class SyncController {
  private socket: SyncSocket | null = null
  private session: SyncSession | null = null
  private handlers: SyncHandlers
  private backendUrl: string
  private createSocket: (url: string) => SyncSocket
  private status: SyncStatus = defaultSyncStatus
  private closing = false
  private paused = false
  private attempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined

  constructor(handlers: SyncHandlers, options: SyncControllerOptions = {}) {
    this.handlers = handlers
    this.backendUrl = normalizeBackendUrl(options.backendUrl ?? defaultSyncBackendUrl())
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url))
  }

  get currentSession() {
    return this.session
  }

  async host(db: FestivalDb): Promise<SyncInvite> {
    const invite: SyncInvite = {
      type: 'simple-festival-sync',
      version: 1,
      transport: 'cloudflare',
      roomId: crypto.randomUUID(),
      backendUrl: this.backendUrl,
      festivalId: db.id,
      festivalName: db.name,
      secret: randomSecret(),
      createdAt: new Date().toISOString(),
    }
    this.start({ invite, role: 'host' })
    return invite
  }

  async join(invite: SyncInvite, deviceId: string) {
    this.start({ invite, role: 'peer', deviceId })
  }

  // Reopens a session saved before the app was closed or suspended.
  restore(session: SyncSession) {
    this.start(session)
  }

  // Called when the app goes to the background: drop the socket but keep the session.
  pause() {
    if (!this.session || this.paused) {
      return
    }
    this.paused = true
    this.disconnect()
    this.setStatus({ mode: 'paused', peers: 0, message: 'Sync paused' })
  }

  // Called when the app comes back: reconnect and catch up.
  resume() {
    if (!this.session || !this.paused) {
      return
    }
    this.paused = false
    this.attempts = 0
    this.connect()
  }

  broadcastSnapshot() {
    const db = this.handlers.getDatabase()
    if (!db || !this.session) {
      return
    }
    this.send({ kind: 'snapshot', secret: this.session.invite.secret, db })
  }

  broadcastScanEvent(event: ScanEvent) {
    if (!this.session) {
      return
    }
    this.send({ kind: 'scan-event', secret: this.session.invite.secret, event })
  }

  close() {
    this.disconnect()
    this.session = null
    this.paused = false
    this.setStatus(defaultSyncStatus)
  }

  private start(session: SyncSession) {
    this.close()
    this.session = session
    this.attempts = 0
    this.setStatus(
      session.role === 'host'
        ? { mode: 'hosting', peers: 0, message: 'Starting device sync' }
        : { mode: 'joining', peers: 0, message: 'Joining host device' },
    )
    this.connect()
  }

  private connect() {
    const session = this.session
    if (!session || this.paused) {
      return
    }
    clearTimeout(this.reconnectTimer)
    const { invite, role, deviceId } = session
    const socket = this.createSocket(syncWebSocketUrl(invite, role, deviceId))
    this.socket = socket
    socket.onopen = () => {
      this.attempts = 0
      const hasList = this.handlers.getDatabase()?.id === invite.festivalId
      this.setStatus({
        mode: role === 'host' ? 'hosting' : 'connected',
        peers: this.status.peers,
        message: role === 'host' ? 'Hosting device sync' : hasList ? 'Connected to host' : 'Connected. Waiting for the guest list',
      })
      this.send({ kind: 'hello', secret: invite.secret, deviceId: deviceId ?? 'host' })
      if (role === 'host') {
        // Peers answer a snapshot with the scans the host is missing.
        this.broadcastSnapshot()
        return
      }
      this.send({ kind: 'request-snapshot', secret: invite.secret })
      // Replay scans made while disconnected, but only those of this festival; receivers ignore events they already have.
      if (hasList) {
        this.replayEvents()
      }
    }
    socket.onmessage = (event) => {
      this.handleMessage(event.data)
    }
    socket.onclose = () => {
      if (this.socket !== socket || this.closing || this.paused || !this.session) {
        return
      }
      this.socket = null
      this.scheduleReconnect()
    }
    socket.onerror = () => {
      // onclose follows and schedules the reconnect.
    }
  }

  private scheduleReconnect() {
    const delay = reconnectDelaysMs[Math.min(this.attempts, reconnectDelaysMs.length - 1)]
    this.attempts += 1
    this.setStatus({
      mode: 'reconnecting',
      peers: 0,
      message: this.session?.role === 'host' ? 'Reconnecting. Scans are saved on this phone.' : 'Reconnecting to host. Scans are saved on this phone.',
    })
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private disconnect() {
    clearTimeout(this.reconnectTimer)
    this.closing = true
    this.socket?.close()
    this.socket = null
    this.closing = false
  }

  private handleMessage(data: unknown) {
    const message = parseIncomingMessage(data)
    if (!message || !this.session || message.secret !== this.session.invite.secret) {
      return
    }

    if (message.kind === 'peer-count') {
      this.setStatus({ ...this.status, peers: message.peers })
      return
    }

    if (message.kind === 'request-snapshot') {
      this.broadcastSnapshot()
      return
    }

    if (message.kind === 'snapshot') {
      if (message.db.id !== this.session.invite.festivalId) {
        return
      }
      this.handlers.onSnapshot(message.db)
      if (this.session.role === 'peer') {
        if (this.status.mode === 'connected') {
          this.setStatus({ ...this.status, message: 'Connected to host' })
        }
        // Send back what the host did not have, e.g. scans made while the host was offline.
        this.replayEvents(new Set(message.db.events.map((event) => event.id)))
      }
      return
    }

    if (message.kind === 'scan-event') {
      this.handlers.onScanEvent(message.event)
    }
  }

  private replayEvents(known = new Set<string>()) {
    const db = this.handlers.getDatabase()
    if (!db || !this.session || db.id !== this.session.invite.festivalId) {
      return
    }
    for (const event of db.events) {
      if (!known.has(event.id)) {
        this.broadcastScanEvent(event)
      }
    }
  }

  private send(message: SyncMessage) {
    if (this.socket?.readyState === socketOpen) {
      this.socket.send(JSON.stringify(message))
    }
  }

  private setStatus(status: SyncStatus) {
    this.status = status
    this.handlers.onStatus(status)
  }
}

export function encodeInvite(invite: SyncInvite) {
  return `simple-festival://${base64UrlEncode(JSON.stringify(invite))}`
}

export function decodeInvite(value: string): SyncInvite {
  const trimmed = value.trim()
  const encoded = trimmed.startsWith('simple-festival://')
    ? trimmed.slice('simple-festival://'.length)
    : trimmed.startsWith('festival-scan://')
      ? trimmed.slice('festival-scan://'.length)
      : trimmed
  const parsed = JSON.parse(base64UrlDecode(encoded)) as SyncInvite
  if (
    !['simple-festival-sync', 'festival-scan-sync'].includes(parsed.type) ||
    parsed.version !== 1 ||
    parsed.transport !== 'cloudflare' ||
    !parsed.roomId ||
    !parsed.backendUrl ||
    !parsed.secret
  ) {
    throw new Error('Invalid festival sync invite')
  }
  return parsed
}

export function defaultSyncBackendUrl() {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env
  const configured = String(viteEnv?.VITE_SYNC_BACKEND_URL ?? '').trim()
  if (configured) {
    return configured
  }

  // Native WebViews also run on localhost, so only the Vite dev server targets the local worker.
  if (viteEnv?.DEV && typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return 'http://127.0.0.1:8787'
  }
  return deployedSyncBackendUrl
}

function syncWebSocketUrl(invite: SyncInvite, role: 'host' | 'peer', deviceId?: string) {
  const url = new URL(`/sync/${encodeURIComponent(invite.roomId)}`, normalizeBackendUrl(invite.backendUrl))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('role', role)
  url.searchParams.set('secret', invite.secret)
  url.searchParams.set('festivalId', invite.festivalId)
  url.searchParams.set('festivalName', invite.festivalName)
  if (deviceId) {
    url.searchParams.set('deviceId', deviceId)
  }
  return url.toString()
}

function normalizeBackendUrl(value: string) {
  return value.replace(/\/+$/, '')
}

function parseIncomingMessage(data: unknown): IncomingSyncMessage | null {
  if (typeof data !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(data) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const record = parsed as Record<string, unknown>
    if (typeof record.kind !== 'string' || typeof record.secret !== 'string') {
      return null
    }
    if (record.kind === 'peer-count' && typeof record.peers === 'number') {
      return parsed as ServerSyncMessage
    }
    if (record.kind === 'request-snapshot' || record.kind === 'snapshot' || record.kind === 'scan-event' || record.kind === 'hello') {
      return parsed as SyncMessage
    }
    return null
  } catch {
    return null
  }
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function randomSecret() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
