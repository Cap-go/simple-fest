import type { RawRow, ScanKind, ScanService, SchemaMapping } from './types'

type ColumnScore = {
  column: string
  score: number
}

const scanWords = ['scan', 'scanned', 'used', 'consumed', 'taken', 'validated', 'checked', 'arrive', 'arrived', 'arrival']
const ignoredServiceWords = ['vegetarian', 'vegetarien', 'vegan', 'allergy', 'allergies', 'comment', 'note', 'phone', 'telephone']
// Our own export adds "<mode> local scans" audit columns; they are history, not new scan modes.
const auditColumnPattern = /^(.*) local scans$/

export function inferSchemaHeuristically(rows: RawRow[]): SchemaMapping {
  const columns = columnsFromRows(rows)
  const normalized = new Map(columns.map((column) => [column, normalizeHeader(column)]))
  const roleColumns = columns.filter((column) => !auditColumnPattern.test(normalized.get(column) ?? ''))
  const idColumn = bestColumn(roleColumns, normalized, ['ticket id', 'ticket', 'id', 'order id', 'booking id', 'reservation id'], /discount|promo|coupon|voucher/)
  const emailColumn = bestColumn(roleColumns, normalized, ['email', 'mail', 'e-mail', 'courriel'])
  const codeColumn =
    bestColumn(roleColumns, normalized, ['qr code', 'qr', 'barcode', 'bar code', 'code', 'ticket code', 'pass code'], /discount|promo|coupon|voucher|postal|zip/) ??
    emailColumn ??
    idColumn
  const nameColumn = bestColumn(roleColumns, normalized, ['name', 'nom', 'full name', 'prenom', 'first name', 'last name'])
  const paidColumn = bestColumn(roleColumns, normalized, [
    'paid',
    'payment',
    'payment status',
    'date paiement',
    'date payment',
    'paid at',
    'paye',
    'payee',
    'montant',
    'amount',
    'stripe',
    'mollie',
  ], /method|mode|type|moyen|means/)
  const services = inferServices(columns, normalized)
  const warnings: string[] = []

  if (!codeColumn) {
    warnings.push('No QR/code/email column detected. Scans need a column that matches the ticket code on the attendee badge.')
  }
  if (!paidColumn) {
    warnings.push('No paid/payment column detected. The app will not block unpaid rows.')
  }
  if (services.length === 0) {
    warnings.push('No entrance/day/food/drink services detected. Add columns such as "Entrance scanned at", "Friday dinner", or "Drink tokens".')
  }

  return {
    version: 1,
    source: 'heuristic',
    confidence: confidenceFor({ codeColumn, paidColumn, services }),
    columns,
    idColumn,
    codeColumn,
    nameColumn,
    emailColumn,
    paidColumn,
    services,
    warnings,
  }
}

export function columnsFromRows(rows: RawRow[]): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    for (const column of Object.keys(row)) {
      const trimmed = column.trim()
      if (trimmed) {
        seen.add(trimmed)
      }
    }
  }
  return [...seen]
}

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferServices(allColumns: string[], normalized: Map<string, string>): ScanService[] {
  const auditColumns = allColumns.filter((column) => auditColumnPattern.test(normalized.get(column) ?? ''))
  const columns = allColumns.filter((column) => !auditColumns.includes(column))
  const consumedColumns = new Map<string, string>()

  for (const column of columns) {
    const header = normalized.get(column) ?? ''
    if (isConsumedColumn(header)) {
      consumedColumns.set(serviceBaseName(header), column)
    }
  }

  const services: ScanService[] = []
  const usedConsumedColumns = new Set<string>()

  for (const column of columns) {
    const header = normalized.get(column) ?? ''
    if (isRoleColumn(header) || isConsumedColumn(header) || ignoredServiceWords.some((word) => header.includes(word))) {
      continue
    }

    const kind = kindForHeader(header)
    const maybeService = kind !== 'custom' || looksLikeEntitlement(header)
    if (!maybeService) {
      continue
    }

    const base = serviceBaseName(header)
    const consumedColumn = findMatchingConsumedColumn(base, consumedColumns)
    if (consumedColumn) {
      usedConsumedColumns.add(consumedColumn)
    }

    services.push({
      id: uniqueServiceId(services, column),
      label: labelForColumn(column),
      kind,
      entitlementColumn: looksLikeConsumedOnly(header) ? undefined : column,
      consumedColumn,
      quotaColumn: looksLikeQuota(header) ? column : undefined,
      confidence: kind === 'custom' ? 0.55 : 0.78,
    })
  }

  for (const [base, column] of consumedColumns) {
    if (usedConsumedColumns.has(column)) {
      continue
    }

    const header = normalized.get(column) ?? ''
    const kind = kindForHeader(base || header)
    services.push({
      id: uniqueServiceId(services, column),
      label: labelForColumn(column),
      kind: kind === 'custom' && header.includes('arriv') ? 'entrance' : kind,
      consumedColumn: column,
      confidence: kind === 'custom' ? 0.62 : 0.74,
    })
  }

  // A plain guest list gets one Entrance mode. When the sheet already has day passes, meals or tokens,
  // an invented Entrance would let every paid guest in, so it is only added for an explicit arrival column.
  if (!services.some((service) => service.kind === 'entrance')) {
    const arrival = columns.find((column) => /\barriv|\b(entrance|entry|check in|checkin)\b/.test(normalized.get(column) ?? ''))
    const entranceAudit = auditColumns.find((column) => auditBase(normalized.get(column)) === 'entrance')
    if (arrival || entranceAudit || services.length === 0) {
      services.unshift({
        id: 'entrance',
        label: 'Entrance',
        kind: 'entrance',
        consumedColumn: arrival ?? entranceAudit,
        confidence: arrival ? 0.78 : 0.48,
        notes: arrival ? undefined : 'Generated default entrance scan mode.',
      })
    }
  }

  // Re-imported export: a mode without its own scanned column keeps its history from the audit column.
  for (const column of auditColumns) {
    const base = auditBase(normalized.get(column))
    const service = services.find((item) => normalizeHeader(item.label) === base)
    if (service && !service.consumedColumn) {
      service.consumedColumn = column
    }
  }

  return sortServices(services)
}

function auditBase(header = '') {
  return header.match(auditColumnPattern)?.[1]?.trim() ?? ''
}

function sortServices(services: ScanService[]) {
  return services
    .map((service, index) => ({ service, index }))
    .sort((left, right) => serviceKindPriority(left.service.kind) - serviceKindPriority(right.service.kind) || left.index - right.index)
    .map(({ service }) => service)
}

function serviceKindPriority(kind: ScanKind) {
  switch (kind) {
    case 'entrance':
      return 0
    case 'day':
      return 1
    case 'food':
      return 2
    case 'drink':
      return 3
    case 'custom':
      return 4
  }
}

// Matches whole words only: "Paid" must not count as an "id" column, "Validity" neither.
function bestColumn(columns: string[], normalized: Map<string, string>, targets: string[], exclude?: RegExp): string | undefined {
  const scores: ColumnScore[] = columns.map((column) => {
    const header = normalized.get(column) ?? ''
    if (exclude?.test(header)) {
      return { column, score: 0 }
    }
    const headerWords = header.split(' ')
    const score = targets.reduce((best, target) => {
      const normalizedTarget = normalizeHeader(target)
      if (header === normalizedTarget) {
        return Math.max(best, 100)
      }
      if (hasPhrase(header, normalizedTarget)) {
        return Math.max(best, 75)
      }
      const words = normalizedTarget.split(' ')
      if (words.every((word) => headerWords.includes(word))) {
        return Math.max(best, 60)
      }
      return best
    }, 0)
    return { column, score }
  })

  return scores.sort((left, right) => right.score - left.score)[0]?.score ? scores[0].column : undefined
}

function confidenceFor(input: { codeColumn?: string; paidColumn?: string; services: ScanService[] }) {
  let confidence = 0.35
  if (input.codeColumn) {
    confidence += 0.25
  }
  if (input.paidColumn) {
    confidence += 0.15
  }
  if (input.services.length > 0) {
    confidence += Math.min(0.25, input.services.length * 0.04)
  }
  return Number(Math.min(0.95, confidence).toFixed(2))
}

function hasPhrase(header: string, phrase: string) {
  return ` ${header} `.includes(` ${phrase} `)
}

function isRoleColumn(header: string) {
  return /^(id|ticket id|order id|name|nom|prenom|first name|last name|email|mail|qr|qr code|barcode|code)$/.test(header)
}

function isConsumedColumn(header: string) {
  return scanWords.some((word) => header.includes(word)) || /scanne|valide|utilise/.test(header)
}

function looksLikeConsumedOnly(header: string) {
  return isConsumedColumn(header) && !looksLikeQuota(header)
}

// Header keywords are whole words (plural allowed), so "Bar" does not match "Barbecue" and "day" not "Birthday".
const wordPattern = (list: string) => new RegExp(`\\b(${list})(?:e?s)?\\b`)
const entranceWords = wordPattern('entrance|entry|admission|check ?in|entree|arrival|arrivee|arrived|arrive')
const drinkWords = wordPattern('drink|bar|beer|wine|beverage|boisson|verre')
const foodWords = wordPattern('food|meal|breakfast|lunch|dinner|dejeuner|diner|petit dej|petit dejeuner|repas|bbq|barbecue')
const dayWords = wordPattern(
  'day|jour|vendredi|samedi|dimanche|lundi|mardi|mercredi|jeudi|friday|saturday|sunday|monday|tuesday|wednesday|thursday|weekend',
)
const entitlementWords = wordPattern('pass|ticket|token')
const quotaWords = wordPattern('token|quota|credit|quantity|qty|count|number|nombre')

function looksLikeEntitlement(header: string) {
  return [entitlementWords, entranceWords, drinkWords, foodWords, dayWords].some((pattern) => pattern.test(header))
}

function looksLikeQuota(header: string) {
  return quotaWords.test(header)
}

function kindForHeader(header: string): ScanKind {
  if (entranceWords.test(header)) {
    return 'entrance'
  }
  if (drinkWords.test(header)) {
    return 'drink'
  }
  if (foodWords.test(header)) {
    return 'food'
  }
  if (dayWords.test(header)) {
    return 'day'
  }
  return 'custom'
}

function serviceBaseName(header: string) {
  return header
    .replace(/\b(scanned|scan|used|consumed|taken|validated|checked|at|date|time|timestamp|utilise|valide|scanne)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findMatchingConsumedColumn(base: string, consumedColumns: Map<string, string>) {
  if (consumedColumns.has(base)) {
    return consumedColumns.get(base)
  }

  for (const [candidate, column] of consumedColumns) {
    if (candidate && base && (hasPhrase(candidate, base) || hasPhrase(base, candidate))) {
      return column
    }
  }

  return undefined
}

function uniqueServiceId(existing: ScanService[], label: string) {
  const base = normalizeHeader(label).replace(/ /g, '-') || 'service'
  let candidate = base
  let index = 2
  while (existing.some((service) => service.id === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function labelForColumn(column: string) {
  return column
    .replace(/^scanned\s+/i, '')
    .replace(/\s+scanned\s+at$/i, '')
    .replace(/\s+scan(ned)?$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}
