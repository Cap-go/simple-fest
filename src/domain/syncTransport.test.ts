import { afterEach, describe, expect, it, vi } from 'vitest'
import { SyncController, decodeInvite, encodeInvite } from './syncTransport'
import type { FestivalDb, ScanEvent, SyncInvite, SyncMessage, SyncStatus } from './types'

class FakeSocket {
  static instances: FakeSocket[] = []

  readyState = 0
  sent: SyncMessage[] = []
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }

  open() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }

  receive(message: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }))
  }

  send(message: string) {
    this.sent.push(JSON.parse(message) as SyncMessage)
  }

  close() {
    this.readyState = 3
    this.onclose?.(new CloseEvent('close'))
  }
}

const db: FestivalDb = {
  id: 'festival-1',
  name: 'Test Festival',
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
  deviceId: 'host-device',
  columns: ['QR Code'],
  records: [{ localId: 'row-1', values: { 'QR Code': 'TCK-1' } }],
  schema: {
    version: 1,
    source: 'manual',
    confidence: 1,
    columns: ['QR Code'],
    codeColumn: 'QR Code',
    services: [{ id: 'entrance', label: 'Entrance', kind: 'entrance', confidence: 1 }],
    warnings: [],
  },
  events: [],
}

const scanEvent: ScanEvent = {
  id: 'scan-1',
  serviceId: 'entrance',
  serviceLabel: 'Entrance',
  recordId: 'row-1',
  payload: 'tck-1',
  deviceId: 'peer-device',
  scannedAt: '2026-06-01T10:01:00.000Z',
}

function createController(overrides: Partial<{ onSnapshot: (nextDb: FestivalDb) => void; onScanEvent: (event: ScanEvent) => void; onStatus: (status: SyncStatus) => void }> = {}) {
  FakeSocket.instances = []
  const statuses: SyncStatus[] = []
  const snapshots: FestivalDb[] = []
  const scanEvents: ScanEvent[] = []
  const controller = new SyncController(
    {
      getDatabase: () => db,
      onSnapshot: overrides.onSnapshot ?? ((snapshot) => snapshots.push(snapshot)),
      onScanEvent: overrides.onScanEvent ?? ((event) => scanEvents.push(event)),
      onStatus: overrides.onStatus ?? ((status) => statuses.push(status)),
    },
    { backendUrl: 'https://sync.example.com', createSocket: (url) => new FakeSocket(url) as unknown as WebSocket },
  )
  return { controller, statuses, snapshots, scanEvents }
}

describe('sync invites', () => {
  it('round-trips device sync invite codes', async () => {
    const { controller } = createController()
    const invite = await controller.host(db)

    expect(decodeInvite(encodeInvite(invite))).toEqual(invite)
    expect(invite.transport).toBe('cloudflare')
    expect(invite.backendUrl).toBe('https://sync.example.com')
    expect(invite.roomId).toBeTruthy()
  })

  it('rejects invalid invite codes', () => {
    expect(() => decodeInvite('not-an-invite')).toThrow()
  })
})

describe('SyncController', () => {
  it('hosts through the Cloudflare sync backend and sends the current snapshot on open', async () => {
    const { controller, statuses } = createController()
    const invite = await controller.host(db)
    const socket = FakeSocket.instances[0]

    expect(socket?.url).toContain(`wss://sync.example.com/sync/${invite.roomId}`)
    expect(socket?.url).toContain('role=host')

    socket?.open()
    expect(socket?.sent).toEqual([
      { kind: 'hello', secret: invite.secret, deviceId: 'host' },
      { kind: 'snapshot', secret: invite.secret, db },
    ])
    expect(statuses.at(-1)).toMatchObject({ mode: 'hosting' })
  })

  it('joins through the invite backend, applies snapshots, and broadcasts scan events', async () => {
    const { controller, snapshots, scanEvents, statuses } = createController()
    const invite: SyncInvite = {
      type: 'festival-scan-sync',
      version: 1,
      transport: 'cloudflare',
      roomId: 'room-1',
      backendUrl: 'https://sync.example.com',
      festivalId: db.id,
      festivalName: db.name,
      secret: 'room-secret',
      createdAt: db.createdAt,
    }

    await controller.join(invite, 'peer-device')
    const socket = FakeSocket.instances[0]
    socket?.open()

    expect(socket?.url).toContain('role=peer')
    expect(socket?.url).toContain('deviceId=peer-device')
    expect(socket?.sent).toEqual([
      { kind: 'hello', secret: invite.secret, deviceId: 'peer-device' },
      { kind: 'request-snapshot', secret: invite.secret },
    ])

    socket?.receive({ kind: 'peer-count', secret: invite.secret, peers: 1 })
    socket?.receive({ kind: 'snapshot', secret: invite.secret, db })
    socket?.receive({ kind: 'scan-event', secret: invite.secret, event: scanEvent })
    controller.broadcastScanEvent(scanEvent)

    expect(statuses.at(-1)).toMatchObject({ mode: 'connected', peers: 1 })
    expect(snapshots).toEqual([db])
    expect(scanEvents).toEqual([scanEvent])
    expect(socket?.sent.at(-1)).toEqual({ kind: 'scan-event', secret: invite.secret, event: scanEvent })
  })

  describe('app lifecycle', () => {
    const invite: SyncInvite = {
      type: 'simple-festival-sync',
      version: 1,
      transport: 'cloudflare',
      roomId: 'room-2',
      backendUrl: 'https://sync.example.com',
      festivalId: db.id,
      festivalName: db.name,
      secret: 'room-secret',
      createdAt: db.createdAt,
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    it('reconnects after an unexpected disconnect', () => {
      vi.useFakeTimers()
      const { controller, statuses } = createController()
      controller.restore({ invite, role: 'host' })
      FakeSocket.instances[0]?.open()

      FakeSocket.instances[0]?.close()
      expect(statuses.at(-1)?.mode).toBe('reconnecting')
      expect(FakeSocket.instances).toHaveLength(1)

      vi.advanceTimersByTime(1000)
      expect(FakeSocket.instances).toHaveLength(2)
      FakeSocket.instances[1]?.open()
      expect(statuses.at(-1)?.mode).toBe('hosting')
      expect(FakeSocket.instances[1]?.sent.map((message) => message.kind)).toEqual(['hello', 'snapshot'])
    })

    it('pauses in the background, resumes on return, and replays offline scans', () => {
      vi.useFakeTimers()
      const offlineDb = { ...db, events: [scanEvent] }
      FakeSocket.instances = []
      const statuses: SyncStatus[] = []
      const controller = new SyncController(
        { getDatabase: () => offlineDb, onSnapshot: () => undefined, onScanEvent: () => undefined, onStatus: (status) => statuses.push(status) },
        { backendUrl: 'https://sync.example.com', createSocket: (url) => new FakeSocket(url) as unknown as WebSocket },
      )
      controller.restore({ invite, role: 'peer', deviceId: 'peer-device' })
      FakeSocket.instances[0]?.open()

      controller.pause()
      expect(statuses.at(-1)?.mode).toBe('paused')
      vi.advanceTimersByTime(60_000)
      expect(FakeSocket.instances).toHaveLength(1)
      expect(controller.currentSession?.invite.roomId).toBe('room-2')

      controller.resume()
      const socket = FakeSocket.instances[1]
      socket?.open()
      expect(statuses.at(-1)?.mode).toBe('connected')
      expect(socket?.sent).toEqual([
        { kind: 'hello', secret: invite.secret, deviceId: 'peer-device' },
        { kind: 'request-snapshot', secret: invite.secret },
        { kind: 'scan-event', secret: invite.secret, event: scanEvent },
      ])
    })

    it('does not replay scans of another festival into the room', () => {
      FakeSocket.instances = []
      const otherDb = { ...db, id: 'old-festival', events: [scanEvent] }
      const controller = new SyncController(
        { getDatabase: () => otherDb, onSnapshot: () => undefined, onScanEvent: () => undefined, onStatus: () => undefined },
        { backendUrl: 'https://sync.example.com', createSocket: (url) => new FakeSocket(url) as unknown as WebSocket },
      )
      controller.join(invite, 'peer-device')
      FakeSocket.instances[0]?.open()
      expect(FakeSocket.instances[0]?.sent.map((message) => message.kind)).toEqual(['hello', 'request-snapshot'])
    })

    it('answers a host snapshot with the scans the host is missing', () => {
      FakeSocket.instances = []
      const peerDb = { ...db, events: [scanEvent] }
      const controller = new SyncController(
        { getDatabase: () => peerDb, onSnapshot: () => undefined, onScanEvent: () => undefined, onStatus: () => undefined },
        { backendUrl: 'https://sync.example.com', createSocket: (url) => new FakeSocket(url) as unknown as WebSocket },
      )
      controller.join(invite, 'peer-device')
      const socket = FakeSocket.instances[0]
      socket?.open()
      socket!.sent = []
      socket?.receive({ kind: 'snapshot', secret: invite.secret, db })
      expect(socket?.sent).toEqual([{ kind: 'scan-event', secret: invite.secret, event: scanEvent }])
      socket!.sent = []
      socket?.receive({ kind: 'snapshot', secret: invite.secret, db: peerDb })
      expect(socket?.sent).toEqual([])
    })

    it('forgets the session when sync is stopped', () => {
      const { controller } = createController()
      controller.restore({ invite, role: 'host' })
      controller.close()
      expect(controller.currentSession).toBeNull()
    })
  })
})
