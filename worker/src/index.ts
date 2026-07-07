import { DurableObject } from 'cloudflare:workers'
import type { FestivalDb, ScanEvent, SyncMessage } from '../../src/domain/types'

export type Env = {
  SYNC_ROOMS: DurableObjectNamespace<SyncRoom>
}

type SocketAttachment = {
  role: SocketRole
  secret: string
  authorized: boolean
  deviceId?: string
}

type ServerSyncMessage = {
  kind: 'peer-count'
  secret: string
  peers: number
}

type WorkerSyncMessage = SyncMessage | ServerSyncMessage

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'simple-festival-sync' }, { headers: corsHeaders() })
    }

    const match = url.pathname.match(/^\/sync\/([^/]+)$/)
    if (!match) {
      return Response.json({ ok: false, error: 'Not found' }, { status: 404, headers: corsHeaders() })
    }

    const roomId = decodeURIComponent(match[1] ?? '')
    if (!roomId) {
      return Response.json({ ok: false, error: 'Missing sync room id' }, { status: 400, headers: corsHeaders() })
    }

    const room = env.SYNC_ROOMS.get(env.SYNC_ROOMS.idFromName(roomId))
    return room.fetch(request)
  },
} satisfies ExportedHandler<Env>

export class SyncRoom extends DurableObject<Env> {
  private roomSecret: string | null = null

  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment<SocketAttachment | undefined>()
      if (attachment?.authorized && attachment.role === 'host') {
        this.roomSecret = attachment.secret
        break
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ ok: false, error: 'Expected WebSocket upgrade' }, { status: 426, headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const secret = url.searchParams.get('secret') ?? ''
    const role = url.searchParams.get('role')
    const deviceId = url.searchParams.get('deviceId') ?? undefined

    if (!secret || (role !== 'host' && role !== 'peer')) {
      return Response.json({ ok: false, error: 'Missing sync role or secret' }, { status: 400, headers: corsHeaders() })
    }

    if (role === 'peer' && (!this.roomSecret || !secretsEqual(secret, this.roomSecret))) {
      return Response.json({ ok: false, error: 'Invalid sync room secret' }, { status: 403, headers: corsHeaders() })
    }

    if (role === 'host') {
      if (this.roomSecret && !secretsEqual(secret, this.roomSecret)) {
        return Response.json({ ok: false, error: 'Sync room already has a different host secret' }, { status: 409, headers: corsHeaders() })
      }
      this.roomSecret = secret
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ role, secret, authorized: true, deviceId } satisfies SocketAttachment)
    this.broadcastPeerCount()

    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(socket: WebSocket, rawMessage: string | ArrayBuffer): void {
    const attachment = socket.deserializeAttachment<SocketAttachment | undefined>()
    const message = parseSyncMessage(rawMessage)
    if (!attachment?.authorized || !message || !secretsEqual(message.secret, attachment.secret)) {
      socket.close(1008, 'Invalid sync message')
      return
    }

    if (message.kind === 'hello') {
      socket.serializeAttachment({ ...attachment, deviceId: message.deviceId })
      this.broadcastPeerCount()
      return
    }

    if (message.kind === 'request-snapshot') {
      if (attachment.role === 'peer') {
        this.broadcastToRole('host', message)
      }
      return
    }

    if (message.kind === 'snapshot') {
      if (attachment.role === 'host') {
        this.broadcastToRole('peer', message)
      }
      return
    }

    if (message.kind === 'scan-event') {
      this.broadcastToAuthorized(message, socket)
    }
  }

  webSocketClose(): void {
    this.refreshRoomSecret()
    this.broadcastPeerCount()
  }

  webSocketError(): void {
    this.refreshRoomSecret()
    this.broadcastPeerCount()
  }

  private broadcastToRole(role: SocketRole, message: SyncMessage): void {
    for (const socket of this.authorizedSockets()) {
      const attachment = socket.deserializeAttachment<SocketAttachment | undefined>()
      if (attachment?.role === role) {
        send(socket, message)
      }
    }
  }

  private broadcastToAuthorized(message: SyncMessage, source?: WebSocket): void {
    for (const socket of this.authorizedSockets()) {
      if (socket !== source) {
        send(socket, message)
      }
    }
  }

  private broadcastPeerCount(): void {
    const secret = this.roomSecret
    if (!secret) {
      return
    }

    const peers = this.authorizedSockets().filter((socket) => socket.deserializeAttachment<SocketAttachment | undefined>()?.role === 'peer').length
    const message: ServerSyncMessage = { kind: 'peer-count', secret, peers }
    for (const socket of this.authorizedSockets()) {
      send(socket, message)
    }
  }

  private authorizedSockets(): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((socket) => socket.deserializeAttachment<SocketAttachment | undefined>()?.authorized)
  }

  private refreshRoomSecret(): void {
    this.roomSecret = null
    for (const socket of this.authorizedSockets()) {
      const attachment = socket.deserializeAttachment<SocketAttachment | undefined>()
      if (attachment?.role === 'host') {
        this.roomSecret = attachment.secret
        return
      }
    }
  }
}

function parseSyncMessage(rawMessage: string | ArrayBuffer): SyncMessage | null {
  try {
    const text = typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage)
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const record = parsed as Record<string, unknown>
    if (typeof record.kind !== 'string' || typeof record.secret !== 'string') {
      return null
    }
    if (record.kind === 'hello' && typeof record.deviceId === 'string') {
      return parsed as SyncMessage
    }
    if (record.kind === 'request-snapshot') {
      return parsed as SyncMessage
    }
    if (record.kind === 'snapshot' && isFestivalDb(record.db)) {
      return parsed as SyncMessage
    }
    if (record.kind === 'scan-event' && isScanEvent(record.event)) {
      return parsed as SyncMessage
    }
    return null
  } catch {
    return null
  }
}

function isFestivalDb(value: unknown): value is FestivalDb {
  return !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string'
}

function isScanEvent(value: unknown): value is ScanEvent {
  return !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string'
}

function send(socket: WebSocket, message: WorkerSyncMessage): void {
  try {
    socket.send(JSON.stringify(message))
  } catch {
    socket.close(1011, 'Could not send sync message')
  }
}

function secretsEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }

  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
