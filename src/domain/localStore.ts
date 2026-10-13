import type { FestivalDb, SyncInvite } from './types'

const dbKey = 'simple-festival.db.v1'
const deviceKey = 'simple-festival.device-id.v1'
const settingsKey = 'simple-festival.ai-settings.v1'
const syncKey = 'simple-festival.sync-session.v1'
const modeKey = 'simple-festival.active-mode.v1'

export type StoredSyncSession = { invite: SyncInvite; role: 'host' | 'peer'; deviceId?: string }

export function loadDatabase(): FestivalDb | null {
  return readJson<FestivalDb>(dbKey)
}

export function saveDatabase(db: FestivalDb) {
  localStorage.setItem(dbKey, JSON.stringify(db))
}

export function clearDatabase() {
  localStorage.removeItem(dbKey)
}

// The sync session survives app restarts so staff phones reconnect on their own.
export function loadSyncSession() {
  return readJson<StoredSyncSession>(syncKey)
}

export function saveSyncSession(session: StoredSyncSession | null) {
  if (session) {
    localStorage.setItem(syncKey, JSON.stringify(session))
  } else {
    localStorage.removeItem(syncKey)
  }
}

export function loadActiveMode() {
  return localStorage.getItem(modeKey)
}

export function saveActiveMode(serviceId: string | null) {
  if (serviceId) {
    localStorage.setItem(modeKey, serviceId)
  } else {
    localStorage.removeItem(modeKey)
  }
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

// Older builds stored an OpenAI API key.
export function purgeLegacyAiSettings() {
  localStorage.removeItem(settingsKey)
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
