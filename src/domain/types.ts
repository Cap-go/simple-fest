export type ScanKind = 'entrance' | 'day' | 'food' | 'drink' | 'custom'

export type RawRow = Record<string, string>

// Sends instructions plus input to a language model and resolves with its text answer.

export type ScanService = {
  id: string
  label: string
  kind: ScanKind
  entitlementColumn?: string
  consumedColumn?: string
  quotaColumn?: string
  confidence: number
  notes?: string
}

export type SchemaMapping = {
  version: 1
  source: 'ai' | 'heuristic' | 'manual'
  confidence: number
  columns: string[]
  idColumn?: string
  codeColumn?: string
  nameColumn?: string
  emailColumn?: string
  paidColumn?: string
  services: ScanService[]
  warnings: string[]
}

export type GuestRecord = {
  localId: string
  values: RawRow
}

export type ScanEvent = {
  id: string
  serviceId: string
  serviceLabel: string
  recordId: string
  payload: string
  deviceId: string
  scannedAt: string
}

export type FestivalDb = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  deviceId: string
  columns: string[]
  records: GuestRecord[]
  schema: SchemaMapping
  events: ScanEvent[]
}

export type ImportResult = {
  db: FestivalDb
  importedRows: number
  mapping: SchemaMapping
}

export type ScanStatus = 'accepted' | 'duplicate' | 'unknown' | 'unpaid' | 'not_entitled' | 'error'

export type ScanResult = {
  status: ScanStatus
  title: string
  detail: string
  payload: string
  record?: GuestRecord
  event?: ScanEvent
}

export type ServiceStats = {
  serviceId: string
  scanned: number
  eligible: number
  remaining: number
}

export type SyncInvite = {
  type: 'simple-festival-sync' | 'festival-scan-sync'
  version: 1
  transport: 'cloudflare'
  roomId: string
  backendUrl: string
  festivalId: string
  festivalName: string
  secret: string
  createdAt: string
}

export type SyncStatus = {
  mode: 'off' | 'hosting' | 'joining' | 'connected' | 'reconnecting' | 'paused' | 'error'
  peerId?: string
  peers: number
  message: string
}

export type SyncMessage =
  | { kind: 'hello'; secret: string; deviceId: string }
  | { kind: 'snapshot'; secret: string; db: FestivalDb }
  | { kind: 'scan-event'; secret: string; event: ScanEvent }
  | { kind: 'request-snapshot'; secret: string }
