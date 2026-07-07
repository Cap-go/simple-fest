import type { AiSettings, FestivalDb } from './types'

const dbKey = 'simple-festival.db.v1'
const deviceKey = 'simple-festival.device-id.v1'
const settingsKey = 'simple-festival.ai-settings.v1'

export function loadDatabase(): FestivalDb | null {
  return readJson<FestivalDb>(dbKey)
}

export function saveDatabase(db: FestivalDb) {
  localStorage.setItem(dbKey, JSON.stringify(db))
}

export function clearDatabase() {
  localStorage.removeItem(dbKey)
}

export function getDeviceId() {
  const existing = localStorage.getItem(deviceKey)
  if (existing) {
    return existing
  }
  const next = randomId('device')
  localStorage.setItem(deviceKey, next)
  return next
}

export function loadAiSettings(): AiSettings {
  return {
    apiKey: '',
    model: 'gpt-4.1-mini',
    baseUrl: 'https://api.openai.com/v1',
    ...readJson<Partial<AiSettings>>(settingsKey),
  }
}

export function saveAiSettings(settings: AiSettings) {
  localStorage.setItem(
    settingsKey,
    JSON.stringify({
      apiKey: settings.apiKey,
      model: settings.model,
      baseUrl: settings.baseUrl,
    }),
  )
}

function readJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}

function randomId(prefix: string) {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
