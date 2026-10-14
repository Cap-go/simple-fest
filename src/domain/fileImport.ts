import Papa from 'papaparse'
import { exampleCsv } from './sampleSheet'
import { inferSchemaHeuristically } from './schemaInference'
import { serviceConsumption } from './scanEngine'
import type { FestivalDb, GuestRecord, ImportResult, RawRow, ScanService, SchemaMapping } from './types'

export async function importFile(file: File, festivalName: string, deviceId: string): Promise<ImportResult> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  const rows = extension === 'xlsx' || extension === 'xls' ? await parseWorkbook(file) : await parseCsv(decodeText(await file.arrayBuffer()))
  return buildDatabase(rows, festivalName || nameFromFile(file.name), deviceId)
}

export async function importSheetUrl(url: string, festivalName: string, deviceId: string): Promise<ImportResult> {
  const response = await fetch(toCsvExportUrl(url))
  if (!response.ok) {
    throw new Error(`Sheet download failed (${response.status})`)
  }
  const rows = await parseCsv(await response.text())
  return buildDatabase(rows, festivalName || 'Festival import', deviceId)
}

export async function importExample(deviceId: string): Promise<ImportResult> {
  const rows = await parseCsv(exampleCsv())
  return buildDatabase(rows, 'Example festival', deviceId)
}

export async function buildDatabase(
  rows: RawRow[],
  festivalName: string,
  deviceId: string,
): Promise<ImportResult> {
  const normalizedRows = normalizeRows(rows)
  if (normalizedRows.length === 0) {
    throw new Error('No rows found in the uploaded sheet')
  }

  const mapping = inferSchemaHeuristically(normalizedRows)
  const now = new Date().toISOString()
  const db: FestivalDb = {
    id: cryptoRandomId('festival'),
    name: festivalName.trim() || 'Festival',
    createdAt: now,
    updatedAt: now,
    deviceId,
    columns: mapping.columns,
    records: normalizedRows.map((row, index) => toGuestRecord(row, mapping, index)),
    schema: mapping,
    events: [],
  }

  return {
    db,
    importedRows: normalizedRows.length,
    mapping,
  }
}
export function exportDatabaseCsv(db: FestivalDb) {
  // Modes removed after scanning still export their scans.
  const known = new Set(db.schema.services.map((service) => service.id))
  const removed = [...new Map(db.events.filter((event) => !known.has(event.serviceId)).map((event) => [event.serviceId, event])).values()].map(
    (event): ScanService => ({ id: event.serviceId, label: event.serviceLabel, kind: 'custom', confidence: 1 }),
  )
  const services = [...db.schema.services, ...removed]
  const scanColumns = services.map((service) => `${service.label} local scans`)
  const columns = uniqueColumns([...db.columns, ...scanColumns])
  const rows = db.records.map((record) => {
    const next: RawRow = { ...record.values }
    for (const service of services) {
      const consumption = serviceConsumption(db, record, service)
      const localTimestamps = consumption.localEvents.map((event) => event.scannedAt)
      const auditColumn = `${service.label} local scans`
      next[auditColumn] = localTimestamps.join('; ')

      if (service.consumedColumn && localTimestamps.length > 0) {
        next[service.consumedColumn] = exportedConsumedValue(
          service.consumedColumn,
          next[service.consumedColumn] ?? '',
          localTimestamps,
          consumption.sourceCount,
        )
      }
    }
    return next
  })
  return Papa.unparse(rows, { columns })
}

function exportedConsumedValue(column: string, existingValue: string, localTimestamps: string[], sourceCount: number) {
  if (shouldExportConsumedCount(column, existingValue)) {
    return String(sourceCount + localTimestamps.length)
  }

  const values = existingValue
    .split(/[;|\n]+/)
    .map((value) => value.trim())
    .filter(Boolean)
  return uniqueColumns([...values, ...localTimestamps]).join('; ')
}

function shouldExportConsumedCount(column: string, existingValue: string) {
  if (/^\s*\d+(?:[.,]\d+)?\s*$/.test(existingValue)) {
    return true
  }
  const normalizedColumn = column
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return /count|used|uses|usage|consumed|quantity|qty|nombre|utilise/.test(normalizedColumn) && !/date|time|timestamp| at\b/.test(normalizedColumn)
}

function uniqueColumns(columns: string[]) {
  return [...new Set(columns.filter((column) => column.trim()))]
}

export function toCsvExportUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Sheet URL is empty')
  }

  const url = new URL(trimmed)
  if (url.hostname.includes('docs.google.com') && url.pathname.includes('/spreadsheets/d/')) {
    const gid = url.hash.match(/gid=(\d+)/)?.[1] ?? url.searchParams.get('gid') ?? '0'
    // "Publish to web" links: /spreadsheets/d/e/<id>/pubhtml
    const published = url.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/)
    if (published?.[1]) {
      return `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv&gid=${gid}`
    }
    const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/)
    if (match?.[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`
    }
  }

  return trimmed
}

// Spreadsheet apps on Windows still save CSV as Windows-1252: fall back when the bytes are not UTF-8.
export function decodeText(buffer: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

export async function parseCsv(csv: string): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(csv, {
      header: false,
      skipEmptyLines: 'greedy',
      complete: (result) => {
        // Short or long rows are kept; only a broken file (e.g. an unclosed quote) fails.
        const fatal = result.errors.find((error) => error.type !== 'FieldMismatch' && error.code !== 'UndetectableDelimiter')
        if (fatal && result.data.length === 0) {
          reject(new Error(fatal.message || 'CSV parse failed'))
          return
        }
        resolve(rowsFromMatrix(result.data))
      },
      error: (error: Error) => reject(error),
    })
  })
}

// Uses the first line that looks like a header, so a title line above the columns is skipped.
export function rowsFromMatrix(matrix: unknown[][]): RawRow[] {
  const cells = matrix.map((row) => row.map((value) => String(value ?? '').trim()))
  const filled = (row: string[]) => row.filter(Boolean).length
  const widest = Math.max(0, ...cells.slice(0, 20).map(filled))
  const headerIndex = cells.findIndex((row, index) => index < 20 && filled(row) >= Math.max(Math.min(2, widest), Math.ceil(widest * 0.6)))
  if (headerIndex < 0) {
    return []
  }
  const header = uniqueHeaders(cells[headerIndex])
  return cells
    .slice(headerIndex + 1)
    .filter((row) => filled(row) > 0)
    .map((row) => Object.fromEntries(header.flatMap((name, index) => (name ? [[name, row[index] ?? '']] : []))))
}

function uniqueHeaders(header: string[]) {
  const seen = new Map<string, number>()
  return header.map((name) => {
    if (!name) {
      return ''
    }
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    return count === 1 ? name : `${name} ${count}`
  })
}

async function parseWorkbook(file: File): Promise<RawRow[]> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  if (workbook.SheetNames.length === 0) {
    throw new Error('Workbook has no sheets')
  }
  // First sheet that has a guest list on it.
  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false })
    const rows = rowsFromMatrix(matrix)
    if (rows.length > 0) {
      return rows
    }
  }
  return []
}

function normalizeRows(rows: RawRow[]) {
  return rows.map((row) => normalizeRow(row)).filter((row) => Object.values(row).some((value) => value.trim()))
}
function normalizeRow(row: RawRow) {
  return Object.fromEntries(
    Object.entries(row)
      .map(([key, value]) => [key.trim(), String(value ?? '').trim()] as const)
      .filter(([key]) => key.length > 0),
  )
}

function toGuestRecord(row: RawRow, mapping: SchemaMapping, index: number): GuestRecord {
  const sourceId = readColumn(row, mapping.idColumn) || readColumn(row, mapping.codeColumn) || readColumn(row, mapping.emailColumn)
  return {
    localId: sourceId ? `row-${slug(sourceId)}-${index + 1}` : `row-${index + 1}`,
    values: row,
  }
}

function readColumn(row: RawRow, column?: string) {
  return column ? row[column]?.trim() : undefined
}

function nameFromFile(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Festival import'
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function cryptoRandomId(prefix: string) {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
