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
  if (!evaluation.record) {
    return {
      db,
      result: blockedResult(evaluation.reason, service, payload, matches[0]),
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

function matchingRecords(db: FestivalDb, payload: string) {
  const columns = [db.schema.codeColumn, db.schema.emailColumn, db.schema.idColumn].filter(Boolean) as string[]
  return db.records.filter((record) => {
    if (columns.length === 0) {
      return false
    }
    return columns.some((column) => normalizePayload(readColumn(record, column)) === payload)
  })
}

function evaluateMatches(db: FestivalDb, service: ScanService, matches: GuestRecord[]) {
  let unpaid = 0
  let notEntitled = 0
  let duplicate = 0

  for (const record of matches) {
    if (!isPaid(record, db)) {
      unpaid += 1
      continue
    }

    const capacity = capacityFor(record, service, db)
    if (capacity <= 0) {
      notEntitled += 1
      continue
    }

    if (consumedCount(db, record, service) >= capacity) {
      duplicate += 1
      continue
    }

    return { record }
  }

  if (duplicate > 0 && duplicate >= unpaid + notEntitled) {
    return { reason: 'duplicate' as const }
  }
  if (unpaid > 0 && unpaid >= notEntitled) {
    return { reason: 'unpaid' as const }
  }
  return { reason: 'not_entitled' as const }
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
  const localEvents = db.events.filter((event) => event.recordId === record.localId && event.serviceId === service.id)
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

function truthy(value: string) {
  const normalized = normalizePayload(value)
  if (!normalized) {
    return false
  }
  if (/^(false|no|non|0|unpaid|not paid|cancelled|canceled|refunded|invalid|ko)$/.test(normalized)) {
    return false
  }
  return true
}

function numberValue(value: string) {
  const parsed = Number.parseFloat(value.replace(',', '.'))
  if (Number.isFinite(parsed)) {
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
