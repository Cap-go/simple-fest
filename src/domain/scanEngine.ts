import type { FestivalDb, GuestRecord, ScanEvent, ScanResult, ScanService, ServiceStats } from './types'

export function applyScan(db: FestivalDb, serviceId: string, payload: string, deviceId: string, scannedAt = new Date().toISOString()) {
  const service = db.schema.services.find((item) => item.id === serviceId)
  if (!service) {
    return {
      db,
      result: result('error', 'Unknown scan mode', 'Choose a scan mode from the home screen.', payload),
    }
  }

  const scanPayload = normalizePayload(payload)
  if (!scanPayload) {
    return {
      db,
      result: result('error', 'Empty ticket code', 'The scanned code did not contain readable text.', payload),
    }
  }

  const matches = matchingRecords(db, scanPayload)
  if (matches.length === 0) {
    return {
      db,
      result: result('unknown', 'Unknown ticket', `No imported row matches "${payload}".`, payload),
    }
  }

  const evaluation = evaluateMatches(db, service, matches)
  if (evaluation.reason) {
    return {
      db,
      result: blockedResult(evaluation.reason, service, payload, evaluation.blocked),
    }
  }

  const event: ScanEvent = {
    id: randomId('scan'),
    serviceId: service.id,
    serviceLabel: service.label,
    recordId: evaluation.record.localId,
    payload: scanPayload,
    deviceId,
    scannedAt,
  }

  const nextDb: FestivalDb = {
    ...db,
    updatedAt: scannedAt,
    events: mergeScanEvents([...db.events, event]),
  }

  return {
    db: nextDb,
    result: result(
      'accepted',
      'Accepted',
      `${displayName(evaluation.record, db)} can pass for ${service.label}.`,
      payload,
      evaluation.record,
      event,
    ),
  }
}

// Reverts one accepted scan. The undo is its own event so it syncs like any scan.
export function undoScan(db: FestivalDb, eventId: string, deviceId: string, scannedAt = new Date().toISOString()) {
  const target = db.events.find((event) => event.id === eventId && !event.undoOf)
  if (!target || undoneIds(db).has(eventId)) {
    return null
  }
  const undo: ScanEvent = { ...target, id: randomId('undo'), undoOf: target.id, deviceId, scannedAt }
  return { ...db, updatedAt: scannedAt, events: mergeScanEvents([...db.events, undo]) }
}

// True when a guest has more scans than allowed, e.g. two phones accepted the same ticket offline.
export function isOverCapacity(db: FestivalDb, recordId: string, serviceId: string) {
  const record = db.records.find((item) => item.localId === recordId)
  const service = db.schema.services.find((item) => item.id === serviceId)
  return Boolean(record && service && consumedCount(db, record, service) > capacityFor(record, service, db))
}

export function mergeRemoteScanEvent(db: FestivalDb, event: ScanEvent): FestivalDb {
  if (db.events.some((existing) => existing.id === event.id)) {
    return db
  }
  return {
    ...db,
    updatedAt: new Date().toISOString(),
    events: mergeScanEvents([...db.events, event]),
  }
}

export function serviceStats(db: FestivalDb): ServiceStats[] {
  return db.schema.services.map((service) => {
    const eligible = db.records.reduce((sum, record) => sum + capacityFor(record, service, db), 0)
    const scanned = db.records.reduce((sum, record) => sum + Math.min(capacityFor(record, service, db), consumedCount(db, record, service)), 0)
    return {
      serviceId: service.id,
      scanned,
      eligible,
      remaining: Math.max(0, eligible - scanned),
    }
  })
}

export function displayName(record: GuestRecord, db: FestivalDb) {
  const name = readColumn(record, db.schema.nameColumn)
  const email = readColumn(record, db.schema.emailColumn)
  const code = readColumn(record, db.schema.codeColumn)
  return name || email || code || record.localId
}

export function normalizePayload(value: string) {
  return value.trim().toLowerCase()
}

// Compare codes without case or spaces, so "ABC 123" and "abc123" match.
function compact(value: string) {
  return normalizePayload(value).replace(/\s+/g, '')
}

// Ticket QRs are often links: also try the last path segment and query values.
function payloadCandidates(payload: string) {
  const candidates = new Set([compact(payload)])
  try {
    const url = new URL(payload.trim())
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const segment = url.pathname.split('/').filter(Boolean).at(-1)
      if (segment) {
        candidates.add(compact(decodeURIComponent(segment)))
      }
      for (const value of url.searchParams.values()) {
        candidates.add(compact(value))
      }
    }
  } catch {
    // Not a URL.
  }
  candidates.delete('')
  return candidates
}

// The ticket code wins over email, email over ID, ID over name: one guest's email can never shadow another's code.
function matchingRecords(db: FestivalDb, payload: string) {
  const candidates = payloadCandidates(payload)
  const columns = [db.schema.codeColumn, db.schema.emailColumn, db.schema.idColumn, db.schema.nameColumn].filter(Boolean) as string[]
  for (const column of [...new Set(columns)]) {
    const matches = db.records.filter((record) => candidates.has(compact(readColumn(record, column))))
    if (matches.length > 0) {
      return matches
    }
  }
  return []
}

function evaluateMatches(db: FestivalDb, service: ScanService, matches: GuestRecord[]) {
  const blocked: Partial<Record<'unpaid' | 'not_entitled' | 'duplicate', GuestRecord>> = {}

  for (const record of matches) {
    if (!isPaid(record, db)) {
      blocked.unpaid ??= record
      continue
    }

    const capacity = capacityFor(record, service, db)
    if (capacity <= 0) {
      blocked.not_entitled ??= record
      continue
    }

    if (consumedCount(db, record, service) >= capacity) {
      blocked.duplicate ??= record
      continue
    }

    return { record }
  }

  // Report the most useful reason, and the guest it applies to.
  const reason = blocked.duplicate ? 'duplicate' : blocked.not_entitled ? 'not_entitled' : 'unpaid'
  return { reason, blocked: blocked[reason] } as const
}

function blockedResult(reason: 'duplicate' | 'unpaid' | 'not_entitled', service: ScanService, payload: string, record?: GuestRecord): ScanResult {
  switch (reason) {
    case 'duplicate':
      return result('duplicate', 'Already scanned', `This ticket has already been used for ${service.label}.`, payload, record)
    case 'unpaid':
      return result('unpaid', 'Not paid', 'The matching row is not marked paid.', payload, record)
    case 'not_entitled':
      return result('not_entitled', 'Not entitled', `The matching row does not include ${service.label}.`, payload, record)
  }
}

function isPaid(record: GuestRecord, db: FestivalDb) {
  if (!db.schema.paidColumn) {
    return true
  }
  return truthy(readColumn(record, db.schema.paidColumn))
}

function capacityFor(record: GuestRecord, service: ScanService, db: FestivalDb) {
  if (service.kind === 'entrance' && !service.entitlementColumn && !service.quotaColumn) {
    return isPaid(record, db) ? 1 : 0
  }

  if (service.quotaColumn) {
    return Math.max(0, numberValue(readColumn(record, service.quotaColumn)))
  }

  if (!service.entitlementColumn) {
    return isPaid(record, db) ? 1 : 0
  }

  return truthy(readColumn(record, service.entitlementColumn)) ? 1 : 0
}

export function serviceConsumption(db: FestivalDb, record: GuestRecord, service: ScanService) {
  const undone = undoneIds(db)
  const localEvents = db.events.filter(
    (event) => !event.undoOf && !undone.has(event.id) && event.recordId === record.localId && event.serviceId === service.id,
  )
  const sourceValue = service.consumedColumn ? readColumn(record, service.consumedColumn) : ''
  const sourceCount = consumedValueCount(sourceValue)
  return {
    localEvents,
    localCount: localEvents.length,
    sourceCount,
    total: sourceCount + localEvents.length,
  }
}

function consumedCount(db: FestivalDb, record: GuestRecord, service: ScanService) {
  return serviceConsumption(db, record, service).total
}

function readColumn(record: GuestRecord, column?: string) {
  return column ? record.values[column] ?? '' : ''
}

function undoneIds(db: FestivalDb) {
  return new Set(db.events.flatMap((event) => (event.undoOf ? [event.undoOf] : [])))
}

const falseWords =
  /^(false|no|non|n|none|nope|0|unpaid|not paid|non paye|impaye|pending|en attente|waiting|awaiting payment|processing|failed|declined|expired|cancelled|canceled|annule|refunded|refund|rembourse|invalid|ko|-)$/

// Reads yes/no cells: "yes", "x", a date or a positive amount count as true; "pending", "0,00 €" or "non payé" as false.
export function truthy(value: string) {
  const normalized = normalizePayload(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
  if (!normalized) {
    return false
  }
  if (falseWords.test(normalized)) {
    return false
  }
  const amount = amountValue(normalized)
  if (amount !== null) {
    return amount > 0
  }
  return true
}

// "12", "0.00", "0,00 €", "$5", "EUR 10" -> number; anything else -> null.
function amountValue(value: string) {
  const stripped = value.replace(/[€$£¥]|\b(eur|usd|gbp|chf)\b/g, '').replace(/\s+/g, '')
  if (!/^-?\d+(?:[.,]\d+)?$/.test(stripped)) {
    return null
  }
  return Number.parseFloat(stripped.replace(',', '.'))
}

function numberValue(value: string) {
  const parsed = amountValue(normalizePayload(value))
  if (parsed !== null) {
    return parsed
  }
  return truthy(value) ? 1 : 0
}

function consumedValueCount(value: string) {
  const normalized = value.trim()
  if (!truthy(normalized)) {
    return 0
  }

  const numeric = Number.parseFloat(normalized.replace(',', '.'))
  if (Number.isFinite(numeric) && /^\s*\d+(?:[.,]\d+)?\s*$/.test(normalized)) {
    return Math.max(0, numeric)
  }

  const parts = normalized
    .split(/[;|\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  return Math.max(1, parts.length)
}

function result(
  status: ScanResult['status'],
  title: string,
  detail: string,
  payload: string,
  record?: GuestRecord,
  event?: ScanEvent,
): ScanResult {
  return { status, title, detail, payload, record, event }
}

function mergeScanEvents(events: ScanEvent[]) {
  return [...new Map(events.map((event) => [event.id, event])).values()].sort((left, right) =>
    left.scannedAt.localeCompare(right.scannedAt),
  )
}

function randomId(prefix: string) {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
