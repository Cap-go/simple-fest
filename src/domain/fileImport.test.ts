import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { applyScan } from './scanEngine'
import { buildDatabase, exportDatabaseCsv, toCsvExportUrl } from './fileImport'
import type { RawRow } from './types'

describe('toCsvExportUrl', () => {
  it('turns public Google Sheet URLs into CSV export URLs and leaves CSV URLs untouched', () => {
    expect(toCsvExportUrl('https://docs.google.com/spreadsheets/d/sheet-id/edit#gid=12345')).toBe(
      'https://docs.google.com/spreadsheets/d/sheet-id/export?format=csv&gid=12345',
    )
    expect(toCsvExportUrl('https://example.com/festival.csv')).toBe('https://example.com/festival.csv')
  })
})

describe('exportDatabaseCsv', () => {
  it('writes local scans into mapped consumed columns so exports can be re-imported', async () => {
    const scanTime = '2026-06-01T10:00:00.000Z'
    const { db } = await buildDatabase(
      [
        {
          'Ticket ID': 'T-1',
          'QR Code': 'guest@example.com',
          Name: 'Guest One',
          Paid: 'yes',
          'Friday dinner': 'yes',
          'Friday dinner scanned at': '',
        },
      ],
      'Export Festival',
      'device-test',
    )
    const dinner = db.schema.services.find((service) => service.label === 'Friday dinner')
    expect(dinner).toBeDefined()

    const scanned = applyScan(db, dinner?.id ?? '', 'guest@example.com', 'device-test', scanTime)
    const csv = exportDatabaseCsv(scanned.db)
    const parsed = Papa.parse<RawRow>(csv, { header: true, skipEmptyLines: true }).data

    expect(parsed[0]?.['Friday dinner scanned at']).toBe(scanTime)
    expect(parsed[0]?.['Friday dinner local scans']).toBe(scanTime)

    const reimported = await buildDatabase(parsed, 'Reimported Festival', 'device-test')
    const reimportedDinner = reimported.db.schema.services.find((service) => service.label === 'Friday dinner')
    const duplicate = applyScan(reimported.db, reimportedDinner?.id ?? '', 'guest@example.com', 'device-test')

    expect(duplicate.result.status).toBe('duplicate')
  })

  it('exports quota consumed columns as counts when the source column is count-like', async () => {
    const { db } = await buildDatabase(
      [
        {
          'Ticket ID': 'D-1',
          'QR Code': 'drink@example.com',
          Name: 'Drink Guest',
          Paid: 'yes',
          'Drink tokens': '2',
          'Drink used': '1',
        },
      ],
      'Export Festival',
      'device-test',
    )
    const drink = db.schema.services.find((service) => service.label === 'Drink tokens')
    expect(drink).toBeDefined()

    const scanned = applyScan(db, drink?.id ?? '', 'drink@example.com', 'device-test', '2026-06-01T11:00:00.000Z')
    const parsed = Papa.parse<RawRow>(exportDatabaseCsv(scanned.db), { header: true, skipEmptyLines: true }).data

    expect(parsed[0]?.['Drink used']).toBe('2')
    expect(parsed[0]?.['Drink tokens local scans']).toBe('2026-06-01T11:00:00.000Z')
  })
})
