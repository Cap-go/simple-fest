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
import { applyScan, displayName, isOverCapacity, mergeRemoteScanEvent, serviceStats, undoScan } from '../domain/scanEngine'
import { SyncController, decodeInvite, encodeInvite } from '../domain/syncTransport'
import type { FestivalDb, ScanEvent, ScanResult, ScanService, SchemaMapping, SyncInvite, SyncStatus } from '../domain/types'
import { confirmReplace, maybeRequestReview, notify, saveCsv, scanFeedback } from '../native/device'

export type RoleColumn = 'idColumn' | 'codeColumn' | 'nameColumn' | 'emailColumn' | 'paidColumn'
export type ScanLogEntry = ScanResult & { id: string; at: string; serviceLabel: string; guest?: string }

const deviceId = getDeviceId()
const db = ref<FestivalDb | null>(loadDatabase())
purgeLegacyAiSettings()
const busy = ref(false)
const savedMode = loadActiveMode()
const activeServiceId = ref<string | null>(
  db.value?.schema.services.find((service) => service.id === savedMode)?.id ?? db.value?.schema.services[0]?.id ?? null,
)
watch(activeServiceId, saveActiveMode)
const lastResult = ref<ScanResult | null>(null)
const scanLog = ref<ScanLogEntry[]>(restoreScanLog(db.value))
// Scan events that arrive before this phone has the guest list.
let pendingEvents: ScanEvent[] = []
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
    let next = mergeDatabases(db.value, remoteDb)
    for (const event of pendingEvents) {
      next = mergeRemoteScanEvent(next, event)
    }
    pendingEvents = []
    if (!setAndSaveDb(next)) {
      return
    }
    if (isNewFestival) {
      activeServiceId.value = remoteDb.schema.services[0]?.id ?? null
      scanLog.value = []
      notify('success', `Joined ${remoteDb.name}`, `${remoteDb.records.length} guests synced`)
    }
  },
  onScanEvent: (event) => {
    const festivalId = sync.currentSession?.invite.festivalId
    if (!db.value || db.value.id !== festivalId) {
      pendingEvents = [...pendingEvents, event].slice(-5000)
      return
    }
    const known = db.value.events.some((existing) => existing.id === event.id)
    if (!setAndSaveDb(mergeRemoteScanEvent(db.value, event)) || known || event.undoOf) {
      return
    }
    warnOnDoubleScan(db.value, event)
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

// Saves first, then updates the screen: a scan is only shown as accepted once it is stored.
function setAndSaveDb(nextDb: FestivalDb) {
  try {
    saveDatabase(nextDb)
  } catch {
    notify('error', 'Phone storage is full', 'This scan was not saved. Free some space or export and remove old events.')
    return false
  }
  db.value = nextDb
  if (!nextDb.schema.services.some((service) => service.id === activeServiceId.value)) {
    activeServiceId.value = nextDb.schema.services[0]?.id ?? null
  }
  return true
}

// Two phones can both accept one ticket while offline. Tell the gate as soon as the second scan arrives.
function warnOnDoubleScan(current: FestivalDb, event: ScanEvent) {
  if (!isOverCapacity(current, event.recordId, event.serviceId)) {
    return
  }
  const record = current.records.find((item) => item.localId === event.recordId)
  const guest = record ? displayName(record, current) : event.payload
  notify('warning', 'Scanned on two phones', `${guest} was also accepted on another phone for ${event.serviceLabel}.`)
  if (lastResult.value?.event?.recordId === event.recordId && lastResult.value.event.serviceId === event.serviceId) {
    lastResult.value = { ...lastResult.value, status: 'duplicate', title: 'Also scanned on another phone' }
  }
}

function restoreScanLog(current: FestivalDb | null): ScanLogEntry[] {
  if (!current) {
    return []
  }
  const undone = new Set(current.events.flatMap((event) => (event.undoOf ? [event.undoOf] : [])))
  return current.events
    .filter((event) => event.deviceId === deviceId && !event.undoOf && !undone.has(event.id))
    .slice(-50)
    .reverse()
    .map((event) => {
      const record = current.records.find((item) => item.localId === event.recordId)
      return {
        status: 'accepted' as const,
        title: 'Accepted',
        detail: '',
        payload: event.payload,
        record,
        event,
        id: event.id,
        at: event.scannedAt,
        serviceLabel: event.serviceLabel,
        guest: record ? guestName(record.values, current.schema) : undefined,
      }
    })
}

// Replacing the list drops every scan of the current event: ask first, and offer an export.
async function confirmReplaceList(header: string) {
  if (!db.value?.events.length) {
    return true
  }
  const choice = await confirmReplace(header, `${db.value.events.length} scans of ${db.value.name} are stored on this phone and will be removed.`)
  if (choice === 'export') {
    await exportCsv()
    return false
  }
  return choice === 'replace'
}

function resetSyncState() {
  sync.close()
  syncInvite.value = null
  syncInviteText.value = ''
  syncQr.value = null
}

async function runImport(source: { kind: 'file'; file: File } | { kind: 'sheet'; url: string } | { kind: 'example' }, name: string) {
  if (!(await confirmReplaceList('Replace the guest list?'))) {
    return false
  }
  busy.value = true
  try {
    const festivalName = name.trim()
    const result =
      source.kind === 'file'
        ? await importFile(source.file, festivalName, deviceId)
        : source.kind === 'sheet'
          ? await importSheetUrl(source.url, festivalName, deviceId)
          : await importExample(deviceId)

    if (!setAndSaveDb(result.db)) {
      return false
    }
    resetSyncState()
    activeServiceId.value = result.db.schema.services[0]?.id ?? null
    lastResult.value = null
    scanLog.value = []
    const warning = result.mapping.warnings[0]
    if (warning) {
      notify('warning', `${result.importedRows} guests imported`, `${warning} Check the Event tab.`)
    } else {
      notify('success', `${result.importedRows} guests imported`, `${result.db.schema.services.length} scan modes detected`)
    }
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
          if (next.db !== current && !setAndSaveDb(next.db)) {
            return { status: 'error' as const, title: 'Scan not saved', detail: 'Phone storage is full. Nothing was recorded.', payload }
          }
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
  return result
}

// Reverts a scan made on this phone (wrong mode, wrong guest). Syncs to other phones like a scan.
function undoLastScan(eventId: string) {
  const current = db.value
  const next = current ? undoScan(current, eventId, deviceId) : null
  if (!next || !setAndSaveDb(next)) {
    return false
  }
  const undo = next.events.find((event) => event.undoOf === eventId)
  if (undo) {
    sync.broadcastScanEvent(undo)
  }
  scanLog.value = scanLog.value.map((entry) =>
    entry.event?.id === eventId ? { ...entry, status: 'error', title: 'Undone', event: undefined } : entry,
  )
  if (lastResult.value?.event?.id === eventId) {
    lastResult.value = null
  }
  notify('info', 'Scan undone', 'The ticket can be scanned again.')
  return true
}

// Only after the camera closes, never on top of a scan.
function askForReview() {
  void maybeRequestReview(db.value?.events.length ?? 0)
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
    if (db.value && db.value.id !== invite.festivalId && !(await confirmReplaceList(`Join ${invite.festivalName}?`))) {
      return false
    }
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

// Staff phones get the list from the host, which would overwrite local edits: edit on the host.
function editableHere() {
  if (sync.currentSession?.role === 'peer') {
    notify('info', 'Edit on the host phone', 'This phone follows the guest list of the host.')
    return false
  }
  return true
}

function updateSchema(patch: (schema: SchemaMapping) => Partial<SchemaMapping>) {
  const current = db.value
  if (!current || !editableHere()) {
    return
  }
  const schema = { ...current.schema, ...patch(current.schema), source: 'manual' as const, confidence: 1 }
  setAndSaveDb({ ...current, updatedAt: new Date().toISOString(), schema: { ...schema, warnings: manualWarnings(schema) } })
  sync.broadcastSnapshot()
}

function renameFestival(name: string) {
  const current = db.value
  if (!current || !name.trim() || name.trim() === current.name || !editableHere()) {
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
    undoLastScan,
    askForReview,
    hostSync,
    joinFromText,
    stopSync,
    pushSnapshot: () => sync.broadcastSnapshot(),
    exportCsv,
    resetDb,
    renameFestival,
    updateRoleColumn,
    updateService,
    addService,
    removeService,
  }
}
