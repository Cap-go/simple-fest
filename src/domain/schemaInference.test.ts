import { afterEach, describe, expect, it, vi } from 'vitest'
import { exampleRows } from './sampleSheet'
import { inferSchema, inferSchemaHeuristically } from './schemaInference'

afterEach(() => {
  vi.unstubAllGlobals()
})
describe('inferSchemaHeuristically', () => {
  it('maps the bundled festival template into scanner services', () => {
    const schema = inferSchemaHeuristically(exampleRows)

    expect(schema.codeColumn).toBe('QR Code')
    expect(schema.nameColumn).toBe('Name')
    expect(schema.emailColumn).toBe('Email')
    expect(schema.paidColumn).toBe('Paid')
    expect(schema.services.some((service) => service.kind === 'entrance' && service.label === 'Entrance' && service.consumedColumn === 'Entrance scanned at')).toBe(true)
    expect(schema.services[0]?.label).toBe('Entrance')
    expect(schema.services.some((service) => service.kind === 'food' && service.label === 'Friday dinner')).toBe(true)
    expect(schema.services.some((service) => service.kind === 'drink' && service.quotaColumn === 'Drink tokens')).toBe(true)
  })
})

describe('inferSchema', () => {
  it('uses the AI client during parsing when one is connected', async () => {
    const ai = vi.fn(async () =>
      JSON.stringify({
        confidence: 0.94,
        codeColumn: 'Badge QR',
        nameColumn: 'Guest name',
        services: [
          {
            id: 'saturday-entry',
            label: 'Saturday entry',
            kind: 'day',
            entitlementColumn: 'Saturday wristband',
            confidence: 0.92,
          },
        ],
      }),
    )

    const schema = await inferSchema([{ 'Badge QR': 'BADGE-1', 'Guest name': 'Ada Lovelace', 'Saturday wristband': 'yes' }], ai)

    expect(ai).toHaveBeenCalledOnce()
    expect(schema.source).toBe('ai')
    expect(schema.confidence).toBe(0.94)
    expect(schema.codeColumn).toBe('Badge QR')
    expect(schema.nameColumn).toBe('Guest name')
    expect(schema.services).toEqual([
      {
        id: 'saturday-entry',
        label: 'Saturday entry',
        kind: 'day',
        entitlementColumn: 'Saturday wristband',
        consumedColumn: undefined,
        quotaColumn: undefined,
        confidence: 0.92,
        notes: undefined,
      },
    ])
  })
})
