import { computed, ref, watch } from 'vue'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { toDataURL } from 'qrcode'
import { exportDatabaseCsv, importExample, importFile, importSheetUrl } from '../domain/fileImport'
import {
  clearDatabase,
  getDeviceId,
  loadActiveMode,
  loadDatabase,
  loadSyncSession,
  saveActiveMode,
  purgeLegacyAiSettings,
  saveDatabase,
  saveSyncSession,
} from '../domain/localStore'
import { applyScan, mergeRemoteScanEvent, serviceStats } from '../domain/scanEngine'
import { SyncController, decodeInvite, encodeInvite } from '../domain/syncTransport'
import type { FestivalDb, ScanResult, ScanService, SchemaMapping, SyncInvite, SyncStatus } from '../domain/types'
import { askChatGpt, chatGptAvailable, connectChatGpt, currentChatGptAccount, disconnectChatGpt, type ChatGptAccount } from '../ai/chatgpt'
import { maybeRequestReview, notify, saveCsv, scanFeedback } from '../native/device'

export type RoleColumn = 'idColumn' | 'codeColumn' | 'nameColumn' | 'emailColumn' | 'paidColumn'
export type ScanLogEntry = ScanResult & { id: string; at: string; serviceLabel: string; guest?: string }

const deviceId = getDeviceId()
const db = ref<FestivalDb | null>(loadDatabase())
const chatGpt = ref<ChatGptAccount | null>(null)
const chatGptBusy = ref(false)
purgeLegacyAiSettings()
if (chatGptAvailable) {
  void currentChatGptAccount().then((account) => (chatGpt.value = account))
}
const busy = ref(false)
const savedMode = loadActiveMode()
const activeServiceId = ref<string | null>(
  db.value?.schema.services.find((service) => service.id === savedMode)?.id ?? db.value?.schema.services[0]?.id ?? null,
)
watch(activeServiceId, saveActiveMode)
const lastResult = ref<ScanResult | null>(null)
const scanLog = ref<ScanLogEntry[]>([])
const syncStatus = ref<SyncStatus>({ mode: 'off', peers: 0, message: 'Sync off' })
const syncInvite = ref<SyncInvite | null>(null)
const syncInviteText = ref('')
const syncQr = ref<string | null>(null)

const stats = computed(() => (db.value ? serviceStats(db.value) : []))
const activeService = computed(
  () => db.value?.schema.services.find((service) => service.id === activeServiceId.value) ?? db.value?.schema.services[0],
)
const activeServiceStat = computed(() => statFor(activeService.value?.id))

const sync = new SyncController({
  getDatabase: () => db.value,
  onSnapshot: (remoteDb) => {
    const isNewFestival = db.value?.id !== remoteDb.id
    setAndSaveDb(mergeDatabases(db.value, remoteDb))
    if (isNewFestival) {
      activeServiceId.value = remoteDb.schema.services[0]?.id ?? null
      notify('success', `Joined ${remoteDb.name}`, `${remoteDb.records.length} guests synced`)
    }
  },
  onScanEvent: (event) => {
    if (db.value) {
      setAndSaveDb(mergeRemoteScanEvent(db.value, event))
    }
  },
  onStatus: (status) => {
    syncStatus.value = status
    saveSyncSession(sync.currentSession)
  },
})

restoreSyncSession()

// Phones lock and switch apps mid-event: pause sync in the background and catch up on return.
if (Capacitor.isNativePlatform()) {
  void App.addListener('pause', () => sync.pause())
  void App.addListener('resume', () => sync.resume())
}

function restoreSyncSession() {
  const saved = loadSyncSession()
  if (!saved || (saved.role === 'host' && db.value?.id !== saved.invite.festivalId)) {
    saveSyncSession(null)
    return
  }
  syncInvite.value = saved.invite
  syncInviteText.value = encodeInvite(saved.invite)
  if (saved.role === 'host') {
    void toDataURL(syncInviteText.value, { width: 560, margin: 1, errorCorrectionLevel: 'M' }).then((qr) => (syncQr.value = qr))
  }
  sync.restore(saved)
}

function statFor(serviceId?: string) {
  return serviceId ? stats.value.find((item) => item.serviceId === serviceId) : undefined
}

function setAndSaveDb(nextDb: FestivalDb | null) {
  db.value = nextDb
  if (!nextDb) {
    return
  }
  saveDatabase(nextDb)
  if (!nextDb.schema.services.some((service) => service.id === activeServiceId.value)) {
    activeServiceId.value = nextDb.schema.services[0]?.id ?? null
  }
}

function resetSyncState() {
  sync.close()
  syncInvite.value = null
  syncInviteText.value = ''
  syncQr.value = null
}

async function runImport(source: { kind: 'file'; file: File } | { kind: 'sheet'; url: string } | { kind: 'example' }, name: string) {
  busy.value = true
  try {
    const ai = chatGpt.value ? askChatGpt : undefined
    const festivalName = name.trim()
    const result =
      source.kind === 'file'
        ? await importFile(source.file, festivalName, deviceId, ai)
        : source.kind === 'sheet'
          ? await importSheetUrl(source.url, festivalName, deviceId, ai)
          : await importExample(deviceId, ai)

    resetSyncState()
    setAndSaveDb(result.db)
    activeServiceId.value = result.db.schema.services[0]?.id ?? null
    lastResult.value = null
    scanLog.value = []
    notify('success', `${result.importedRows} guests imported`, `${result.db.schema.services.length} scan modes detected`)
    return true
  } catch (error) {
    notify('error', 'Import failed', error instanceof Error ? error.message : undefined)
    return false
  } finally {
    busy.value = false
  }
}

function handleScan(payload: string) {
  const current = db.value
  const service = activeService.value
  const result: ScanResult =
    current && service
      ? (() => {
          const next = applyScan(current, service.id, payload, deviceId)
          setAndSaveDb(next.db)
          if (next.result.event) {
            sync.broadcastScanEvent(next.result.event)
          }
          return next.result
        })()
      : { status: 'error', title: 'No scan mode', detail: 'Import a sheet and choose a scan mode first.', payload }

  lastResult.value = result
  scanLog.value = [
    {
      ...result,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      serviceLabel: service?.label ?? 'Scan',
      guest: result.record && current ? guestName(result.record.values, current.schema) : undefined,
    },
    ...scanLog.value,
  ].slice(0, 50)
  void scanFeedback(result.status)
  if (result.status === 'accepted') {
    void maybeRequestReview(db.value?.events.length ?? 0)
  }
  return result
}

function guestName(values: Record<string, string>, schema: SchemaMapping) {
  const pick = (column?: string) => (column ? values[column]?.trim() : '')
  return pick(schema.nameColumn) || pick(schema.emailColumn) || pick(schema.codeColumn) || undefined
}

async function hostSync() {
  if (!db.value) {
    return
  }
  busy.value = true
  try {
    const invite = await sync.host(db.value)
    const encoded = encodeInvite(invite)
    syncInvite.value = invite
    syncInviteText.value = encoded
    syncQr.value = await toDataURL(encoded, { width: 560, margin: 1, errorCorrectionLevel: 'M' })
  } catch (error) {
    notify('error', 'Could not start sync', error instanceof Error ? error.message : undefined)
  } finally {
    busy.value = false
  }
}

async function joinFromText(value: string) {
  try {
    const invite = decodeInvite(value)
    syncInvite.value = invite
    syncInviteText.value = encodeInvite(invite)
    syncQr.value = null
    await sync.join(invite, deviceId)
    notify('info', `Joining ${invite.festivalName}`, 'Waiting for the host device')
    return true
  } catch (error) {
    notify('error', 'Invalid invite', error instanceof Error ? error.message : undefined)
    return false
  }
}

function stopSync() {
  resetSyncState()
  syncStatus.value = { mode: 'off', peers: 0, message: 'Sync off' }
}

async function exportCsv() {
  if (!db.value) {
    return
  }
  const slug = db.value.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'simple-festival'
  try {
    await saveCsv(`${slug}-scans.csv`, exportDatabaseCsv(db.value))
  } catch (error) {
    if (!(error instanceof Error && /cancel/i.test(error.message))) {
      notify('error', 'Export failed', error instanceof Error ? error.message : undefined)
    }
  }
}

function resetDb() {
  stopSync()
  clearDatabase()
  db.value = null
  activeServiceId.value = null
  lastResult.value = null
  scanLog.value = []
}

async function connectAi() {
  chatGptBusy.value = true
  try {
    chatGpt.value = await connectChatGpt()
    notify('success', 'ChatGPT connected', chatGpt.value.email || undefined)
  } catch (error) {
    if (!(error instanceof Error && /cancel/i.test(error.message))) {
      notify('error', 'Could not connect ChatGPT', error instanceof Error ? error.message : undefined)
    }
  } finally {
    chatGptBusy.value = false
  }
}

async function disconnectAi() {
  await disconnectChatGpt()
  chatGpt.value = null
}

function updateSchema(patch: (schema: SchemaMapping) => Partial<SchemaMapping>) {
  const current = db.value
  if (!current) {
    return
  }
  const schema = { ...current.schema, ...patch(current.schema), source: 'manual' as const, confidence: 1 }
  setAndSaveDb({ ...current, updatedAt: new Date().toISOString(), schema: { ...schema, warnings: manualWarnings(schema) } })
  sync.broadcastSnapshot()
}

function renameFestival(name: string) {
  const current = db.value
  if (!current || !name.trim() || name.trim() === current.name) {
    return
  }
  setAndSaveDb({ ...current, name: name.trim(), updatedAt: new Date().toISOString() })
  sync.broadcastSnapshot()
}

function updateRoleColumn(role: RoleColumn, value: string) {
  updateSchema(() => ({ [role]: value || undefined }))
}

function updateService(serviceId: string, patch: Partial<ScanService>) {
  updateSchema((schema) => ({
    services: schema.services.map((service) => (service.id === serviceId ? { ...service, ...patch, confidence: 1 } : service)),
  }))
}

function addService() {
  updateSchema((schema) => {
    const service: ScanService = { id: uniqueServiceId(schema.services), label: 'New scan mode', kind: 'custom', confidence: 1 }
    activeServiceId.value = service.id
    return { services: [...schema.services, service] }
  })
}

function removeService(serviceId: string) {
  updateSchema((schema) => ({ services: schema.services.filter((service) => service.id !== serviceId) }))
}

function manualWarnings(schema: SchemaMapping) {
  const warnings: string[] = []
  if (!schema.codeColumn && !schema.emailColumn && !schema.idColumn) {
    warnings.push('Choose the column that matches the code printed on tickets.')
  }
  if (schema.services.length === 0) {
    warnings.push('Add at least one scan mode.')
  }
  return warnings
}

function uniqueServiceId(services: ScanService[]) {
  let index = services.length + 1
  while (services.some((service) => service.id === `manual-mode-${index}`)) {
    index += 1
  }
  return `manual-mode-${index}`
}

function mergeDatabases(current: FestivalDb | null, remote: FestivalDb): FestivalDb {
  if (!current || current.id !== remote.id) {
    return { ...remote, deviceId }
  }
  const events = [...new Map([...current.events, ...remote.events].map((event) => [event.id, event])).values()].sort((a, b) =>
    a.scannedAt.localeCompare(b.scannedAt),
  )
  return {
    ...remote,
    deviceId: current.deviceId,
    events,
    updatedAt: events.at(-1)?.scannedAt ?? remote.updatedAt,
  }
}

export function useFestival() {
  return {
    deviceId,
    db,
    chatGpt,
    chatGptBusy,
    chatGptAvailable,
    busy,
    activeServiceId,
    activeService,
    activeServiceStat,
    stats,
    statFor,
    lastResult,
    scanLog,
    syncStatus,
    syncInvite,
    syncInviteText,
    syncQr,
    runImport,
    handleScan,
    hostSync,
    joinFromText,
    stopSync,
    pushSnapshot: () => sync.broadcastSnapshot(),
    exportCsv,
    resetDb,
    connectAi,
    disconnectAi,
    renameFestival,
    updateRoleColumn,
    updateService,
    addService,
    removeService,
  }
}
