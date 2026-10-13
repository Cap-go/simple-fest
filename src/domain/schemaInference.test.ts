import { describe, expect, it } from 'vitest'
import { exampleRows } from './sampleSheet'
import { inferSchemaHeuristically } from './schemaInference'

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
