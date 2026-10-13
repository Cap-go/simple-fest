import type { RawRow, ScanKind, ScanService, SchemaMapping } from './types'

type ColumnScore = {
  column: string
  score: number
}

const scanWords = ['scan', 'scanned', 'used', 'consumed', 'taken', 'validated', 'checked', 'arrive', 'arrived', 'arrival']
const ignoredServiceWords = ['vegetarian', 'vegetarien', 'vegan', 'allergy', 'allergies', 'comment', 'note', 'phone', 'telephone']

export function inferSchemaHeuristically(rows: RawRow[]): SchemaMapping {
  const columns = columnsFromRows(rows)
  const normalized = new Map(columns.map((column) => [column, normalizeHeader(column)]))
  const idColumn = bestColumn(columns, normalized, ['ticket id', 'ticket', 'id', 'order id', 'booking id', 'reservation id'])
  const emailColumn = bestColumn(columns, normalized, ['email', 'mail', 'e-mail', 'courriel'])
  const codeColumn = bestColumn(columns, normalized, ['qr code', 'qr', 'barcode', 'bar code', 'code', 'ticket code', 'pass code']) ?? emailColumn ?? idColumn
  const nameColumn = bestColumn(columns, normalized, ['name', 'nom', 'full name', 'prenom', 'first name', 'last name'])
  const paidColumn = bestColumn(columns, normalized, [
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
  ])
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

function inferServices(columns: string[], normalized: Map<string, string>): ScanService[] {
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

  if (!services.some((service) => service.kind === 'entrance')) {
    const arrival = columns.find((column) => /arriv|entrance|entry|check in|checkin/.test(normalized.get(column) ?? ''))
    services.unshift({
      id: 'entrance',
      label: 'Entrance',
      kind: 'entrance',
      consumedColumn: arrival,
      confidence: arrival ? 0.78 : 0.48,
      notes: arrival ? undefined : 'Generated default entrance scan mode.',
    })
  }

  return sortServices(services).slice(0, 24)
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

function bestColumn(columns: string[], normalized: Map<string, string>, targets: string[]): string | undefined {
  const scores: ColumnScore[] = columns.map((column) => {
    const header = normalized.get(column) ?? ''
    const score = targets.reduce((best, target) => {
      const normalizedTarget = normalizeHeader(target)
      if (header === normalizedTarget) {
        return Math.max(best, 100)
      }
      if (header.includes(normalizedTarget)) {
        return Math.max(best, 75)
      }
      const words = normalizedTarget.split(' ')
      if (words.every((word) => header.includes(word))) {
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

function isRoleColumn(header: string) {
  return /^(id|ticket id|order id|name|nom|prenom|first name|last name|email|mail|qr|qr code|barcode|code)$/.test(header)
}

function isConsumedColumn(header: string) {
  return scanWords.some((word) => header.includes(word)) || /scanne|valide|utilise/.test(header)
}

function looksLikeConsumedOnly(header: string) {
  return isConsumedColumn(header) && !looksLikeQuota(header)
}

function looksLikeEntitlement(header: string) {
  return /pass|meal|food|drink|token|breakfast|lunch|dinner|dejeuner|diner|petit dej|repas|bar|beer|wine|day|jour|vendredi|samedi|dimanche|lundi|friday|saturday|sunday|monday|ticket|entree|entrance/.test(
    header,
  )
}

function looksLikeQuota(header: string) {
  return /tokens?|quota|credit|credits|quantity|qty|count|number|nombre/.test(header)
}

function kindForHeader(header: string): ScanKind {
  if (/entrance|entry|admission|arriv|check in|checkin|entree/.test(header)) {
    return 'entrance'
  }
  if (/drink|bar|beer|wine|beverage|boisson|verre/.test(header)) {
    return 'drink'
  }
  if (/food|meal|breakfast|lunch|dinner|dejeuner|diner|petit dej|repas/.test(header)) {
    return 'food'
  }
  if (/day|jour|vendredi|samedi|dimanche|lundi|mardi|mercredi|jeudi|friday|saturday|sunday|monday|tuesday|wednesday|thursday/.test(header)) {
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
    if (candidate.includes(base) || base.includes(candidate)) {
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
