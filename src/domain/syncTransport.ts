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

export class SyncController {
  private socket: SyncSocket | null = null
  private invite: SyncInvite | null = null
  private handlers: SyncHandlers
  private backendUrl: string
  private createSocket: (url: string) => SyncSocket
  private status: SyncStatus = defaultSyncStatus
  private closing = false

  constructor(handlers: SyncHandlers, options: SyncControllerOptions = {}) {
    this.handlers = handlers
    this.backendUrl = normalizeBackendUrl(options.backendUrl ?? defaultSyncBackendUrl())
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url))
  }

  async host(db: FestivalDb): Promise<SyncInvite> {
    this.close()
    const secret = randomSecret()
    const invite: SyncInvite = {
      type: 'simple-festival-sync',
      version: 1,
      transport: 'cloudflare',
      roomId: crypto.randomUUID(),
      backendUrl: this.backendUrl,
      festivalId: db.id,
      festivalName: db.name,
      secret,
      createdAt: new Date().toISOString(),
    }

    this.invite = invite
    this.setStatus({ mode: 'hosting', peers: 0, message: 'Starting device sync' })
    this.socket = this.openSocket(invite, 'host')
    return invite
  }

  async join(invite: SyncInvite, deviceId: string) {
    this.close()
    this.invite = invite
    this.setStatus({ mode: 'joining', peers: 0, message: 'Joining host device' })
    this.socket = this.openSocket(invite, 'peer', deviceId)
  }

  broadcastSnapshot() {
    const db = this.handlers.getDatabase()
    if (!db || !this.invite) {
      return
    }
    this.send({ kind: 'snapshot', secret: this.invite.secret, db })
  }

  broadcastScanEvent(event: ScanEvent) {
    if (!this.invite) {
      return
    }
    this.send({ kind: 'scan-event', secret: this.invite.secret, event })
  }

  close() {
    this.closing = true
    this.socket?.close()
    this.socket = null
    this.invite = null
    this.closing = false
    this.setStatus(defaultSyncStatus)
  }

  private openSocket(invite: SyncInvite, role: 'host' | 'peer', deviceId?: string) {
    const socket = this.createSocket(syncWebSocketUrl(invite, role, deviceId))
    socket.onopen = () => {
      this.setStatus({ mode: role === 'host' ? 'hosting' : 'connected', peers: this.status.peers, message: role === 'host' ? 'Hosting device sync' : 'Connected to host' })
      this.send({ kind: 'hello', secret: invite.secret, deviceId: deviceId ?? 'host' })
      if (role === 'host') {
        this.broadcastSnapshot()
      } else {
        this.send({ kind: 'request-snapshot', secret: invite.secret })
      }
    }
    socket.onmessage = (event) => {
      this.handleMessage(event.data)
    }
    socket.onclose = () => {
      if (!this.closing) {
        this.setStatus({ mode: 'off', peers: 0, message: role === 'host' ? 'Device sync stopped' : 'Disconnected from host' })
      }
    }
    socket.onerror = () => {
      this.setStatus({ mode: 'error', peers: this.status.peers, message: 'Device sync error' })
    }
    return socket
  }

  private handleMessage(data: unknown) {
    const message = parseIncomingMessage(data)
    if (!message || !this.invite || message.secret !== this.invite.secret) {
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
      this.handlers.onSnapshot(message.db)
      return
    }

    if (message.kind === 'scan-event') {
      this.handlers.onScanEvent(message.event)
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
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const configured = viteEnv?.VITE_SYNC_BACKEND_URL?.trim()
  if (configured) {
    return configured
  }

  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
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
