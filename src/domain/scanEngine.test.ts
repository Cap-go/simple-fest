import { describe, expect, it } from 'vitest'
import { buildDatabase } from './fileImport'
import { applyScan } from './scanEngine'
import type { RawRow } from './types'

const rows: RawRow[] = [
  {
    'Ticket ID': 'A-1',
    'QR Code': 'shared@example.com',
    Name: 'First Guest',
    Email: 'shared@example.com',
    Paid: 'yes',
    'Friday dinner': 'yes',
    'Friday dinner scanned at': '',
  },
  {
    'Ticket ID': 'A-2',
    'QR Code': 'shared@example.com',
    Name: 'Second Guest',
    Email: 'shared@example.com',
    Paid: 'yes',
    'Friday dinner': 'yes',
    'Friday dinner scanned at': '',
  },
  {
    'Ticket ID': 'A-3',
    'QR Code': 'unpaid@example.com',
    Name: 'Unpaid Guest',
    Email: 'unpaid@example.com',
    Paid: 'no',
    'Friday dinner': 'yes',
    'Friday dinner scanned at': '',
  },
]

describe('applyScan', () => {
  it('consumes one eligible row at a time for duplicate ticket codes', async () => {
    const { db } = await buildDatabase(rows, 'Test Festival', 'device-test')
    const dinner = db.schema.services.find((service) => service.label === 'Friday dinner')
    expect(dinner).toBeDefined()

    const first = applyScan(db, dinner?.id ?? '', 'shared@example.com', 'device-test', '2026-06-01T10:00:00.000Z')
    const second = applyScan(first.db, dinner?.id ?? '', 'shared@example.com', 'device-test', '2026-06-01T10:01:00.000Z')
    const third = applyScan(second.db, dinner?.id ?? '', 'shared@example.com', 'device-test', '2026-06-01T10:02:00.000Z')

    expect(first.result.status).toBe('accepted')
    expect(second.result.status).toBe('accepted')
    expect(third.result.status).toBe('duplicate')
  })

  it('blocks unpaid rows', async () => {
    const { db } = await buildDatabase(rows, 'Test Festival', 'device-test')
    const dinner = db.schema.services.find((service) => service.label === 'Friday dinner')
    const scan = applyScan(db, dinner?.id ?? '', 'unpaid@example.com', 'device-test')

    expect(scan.result.status).toBe('unpaid')
  })

  it('counts existing consumed quota values plus local events', async () => {
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
      'Test Festival',
      'device-test',
    )
    const drink = db.schema.services.find((service) => service.label === 'Drink tokens')
    expect(drink).toBeDefined()

    const first = applyScan(db, drink?.id ?? '', 'drink@example.com', 'device-test', '2026-06-01T11:00:00.000Z')
    const second = applyScan(first.db, drink?.id ?? '', 'drink@example.com', 'device-test', '2026-06-01T11:01:00.000Z')

    expect(first.result.status).toBe('accepted')
    expect(second.result.status).toBe('duplicate')
  })
})
