import { describe, expect, it } from 'vitest'
import { buildDatabase, decodeText, exportDatabaseCsv, parseCsv, rowsFromMatrix, toCsvExportUrl } from './fileImport'
import { applyScan, isOverCapacity, mergeRemoteScanEvent, serviceStats, truthy, undoScan } from './scanEngine'
import { inferSchemaHeuristically } from './schemaInference'

const at = (minute: number) => `2026-06-01T10:${String(minute).padStart(2, '0')}:00.000Z`

describe('column detection', () => {
  it('never uses Paid or Validity as the ticket id', () => {
    const schema = inferSchemaHeuristically([{ Name: 'Ada', Email: 'ada@x.com', Paid: 'yes', Validity: 'ok' }])
    expect(schema.idColumn).toBeUndefined()
    expect(schema.codeColumn).toBe('Email')
    expect(schema.paidColumn).toBe('Paid')
  })

  it('ignores payment method and discount code columns', () => {
    const schema = inferSchemaHeuristically([{ Email: 'a@x.com', 'Payment method': 'card', 'Discount code': 'SUMMER', Amount: '10' }])
    expect(schema.paidColumn).toBe('Amount')
    expect(schema.codeColumn).toBe('Email')
  })

  it('does not bind Bar to a Barbecue scanned column', () => {
    const schema = inferSchemaHeuristically([{ Email: 'a@x.com', Bar: 'yes', 'Barbecue scanned at': '' }])
    const bar = schema.services.find((service) => service.label === 'Bar')
    expect(bar?.kind).toBe('drink')
    expect(bar?.consumedColumn).toBeUndefined()
  })

  it('does not invent an Entrance mode that would let every paid guest in', () => {
    const schema = inferSchemaHeuristically([{ Email: 'a@x.com', Paid: 'yes', 'Saturday pass': 'yes', 'Drink tokens': '2' }])
    expect(schema.services.some((service) => service.kind === 'entrance')).toBe(false)
    expect(inferSchemaHeuristically([{ Email: 'a@x.com', Paid: 'yes' }]).services.map((service) => service.label)).toEqual(['Entrance'])
  })
})

describe('payment values', () => {
  it('treats zero amounts and pending states as unpaid', () => {
    for (const value of ['0.00', '0,00 €', 'pending', 'non payé', 'Refunded', '']) {
      expect(truthy(value), value).toBe(false)
    }
    for (const value of ['yes', 'x', '12', '€5', '2026-06-01', 'paid']) {
      expect(truthy(value), value).toBe(true)
    }
  })
})

describe('matching', () => {
  it('prefers the ticket code over another guest email', async () => {
    const { db } = await buildDatabase(
      [
        { 'QR Code': 'TCK-2', Email: 'b@x.com', Name: 'B', Paid: 'yes' },
        { 'QR Code': 'TCK-1', Email: 'tck-2', Name: 'A', Paid: 'yes' },
      ],
      'Fest',
      'device',
    )
    const scan = applyScan(db, db.schema.services[0].id, 'TCK-2', 'device')
    expect(scan.result.record?.values.Name).toBe('B')
  })

  it('reads codes from links and ignores spaces', async () => {
    const { db } = await buildDatabase([{ 'QR Code': 'ABC 123', Paid: 'yes' }], 'Fest', 'device')
    const service = db.schema.services[0].id
    expect(applyScan(db, service, 'https://tickets.example.com/t/ABC123', 'device').result.status).toBe('accepted')
    expect(applyScan(db, service, 'abc123', 'device').result.status).toBe('accepted')
    expect(applyScan(db, service, 'https://tickets.example.com/check?code=abc123', 'device').result.status).toBe('accepted')
  })

  it('finds a guest by name when typed', async () => {
    const { db } = await buildDatabase([{ 'QR Code': 'TCK-9', Name: 'Ada Lovelace', Paid: 'yes' }], 'Fest', 'device')
    expect(applyScan(db, db.schema.services[0].id, 'ada lovelace', 'device').result.status).toBe('accepted')
  })

  it('names the guest the refusal applies to', async () => {
    const { db } = await buildDatabase(
      [
        { 'QR Code': 'FAM', Name: 'Unpaid', Paid: 'no', 'Friday dinner': 'yes' },
        { 'QR Code': 'FAM', Name: 'Paid no dinner', Paid: 'yes', 'Friday dinner': 'no' },
      ],
      'Fest',
      'device',
    )
    const dinner = db.schema.services.find((service) => service.label === 'Friday dinner')!
    const scan = applyScan(db, dinner.id, 'FAM', 'device')
    expect(scan.result.status).toBe('not_entitled')
    expect(scan.result.record?.values.Name).toBe('Paid no dinner')
  })
})

describe('undo and double scans', () => {
  it('undo frees the ticket again', async () => {
    const { db } = await buildDatabase([{ 'QR Code': 'T1', Paid: 'yes' }], 'Fest', 'device')
    const service = db.schema.services[0].id
    const first = applyScan(db, service, 'T1', 'device', at(1))
    const undone = undoScan(first.db, first.result.event!.id, 'device', at(2))!
    expect(serviceStats(undone)[0].scanned).toBe(0)
    expect(applyScan(undone, service, 'T1', 'device', at(3)).result.status).toBe('accepted')
  })

  it('flags a ticket accepted on two phones', async () => {
    const { db } = await buildDatabase([{ 'QR Code': 'T1', Paid: 'yes' }], 'Fest', 'device')
    const service = db.schema.services[0].id
    const phoneA = applyScan(db, service, 'T1', 'phone-a', at(1))
    const phoneB = applyScan(db, service, 'T1', 'phone-b', at(1))
    const merged = mergeRemoteScanEvent(phoneA.db, phoneB.result.event!)
    expect(isOverCapacity(merged, phoneB.result.event!.recordId, service)).toBe(true)
  })
})

describe('import', () => {
  it('skips a title line, short rows and blank lines', async () => {
    const rows = await parseCsv('Summer Fest guest list\nCode,Name,Paid\nT1,Ada,yes\n   \nT2,Bea\n')
    expect(rows).toEqual([
      { Code: 'T1', Name: 'Ada', Paid: 'yes' },
      { Code: 'T2', Name: 'Bea', Paid: '' },
    ])
  })

  it('accepts a single-column email list', () => {
    expect(rowsFromMatrix([['Email'], ['a@x.com']])).toEqual([{ Email: 'a@x.com' }])
  })

  it('decodes Windows-1252 files', () => {
    expect(decodeText(new Uint8Array([0x41, 0x64, 0xe9]).buffer)).toBe('Adé')
  })

  it('handles published Google Sheet links', () => {
    expect(toCsvExportUrl('https://docs.google.com/spreadsheets/d/e/2PACX-abc/pubhtml')).toBe(
      'https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?output=csv&gid=0',
    )
  })

  it('re-imports its own export without extra modes or lost entrance scans', async () => {
    const { db } = await buildDatabase([{ 'QR Code': 'T1', Paid: 'yes' }, { 'QR Code': 'T2', Paid: 'yes' }], 'Fest', 'device')
    const scanned = applyScan(db, db.schema.services[0].id, 'T1', 'device', at(1))
    const rows = await parseCsv(exportDatabaseCsv(scanned.db))
    const again = await buildDatabase(rows, 'Fest', 'device')
    expect(again.db.schema.services.map((service) => service.label)).toEqual(['Entrance'])
    const entrance = again.db.schema.services[0].id
    expect(applyScan(again.db, entrance, 'T1', 'device').result.status).toBe('duplicate')
    expect(applyScan(again.db, entrance, 'T2', 'device').result.status).toBe('accepted')
  })

  it('keeps scans of a removed mode in the export', async () => {
    const { db } = await buildDatabase([{ 'QR Code': 'T1', Paid: 'yes', 'Friday dinner': 'yes' }], 'Fest', 'device')
    const dinner = db.schema.services.find((service) => service.label === 'Friday dinner')!
    const scanned = applyScan(db, dinner.id, 'T1', 'device', at(1)).db
    const removed = { ...scanned, schema: { ...scanned.schema, services: scanned.schema.services.filter((service) => service.id !== dinner.id) } }
    const rows = await parseCsv(exportDatabaseCsv(removed))
    expect(rows[0]['Friday dinner local scans']).toBe(at(1))
  })
})
