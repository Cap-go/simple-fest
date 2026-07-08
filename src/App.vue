<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { toDataURL } from 'qrcode'
import { exportDatabaseCsv, importExample, importFile, importSheetUrl } from './domain/fileImport'
import { clearDatabase, getDeviceId, loadAiSettings, loadDatabase, saveAiSettings, saveDatabase } from './domain/localStore'
import { downloadExampleCsv } from './domain/sampleSheet'
import { applyScan, displayName, mergeRemoteScanEvent, serviceStats } from './domain/scanEngine'
import { SyncController, decodeInvite, encodeInvite } from './domain/syncTransport'
import { useCapgoQrScanner } from './composables/useCapgoQrScanner'
import type { AiSettings, FestivalDb, ScanResult, SyncInvite, SyncStatus } from './domain/types'

type CameraMode = 'scan' | 'join' | null

const emptySyncStatus: SyncStatus = { mode: 'off', peers: 0, message: 'Sync off' }
const deviceId = getDeviceId()
const db = ref<FestivalDb | null>(loadDatabase())
const settings = ref<AiSettings>(loadAiSettings())
const festivalName = ref(db.value?.name ?? 'Ezfest')
const sheetUrl = ref('')
const selectedFile = ref<File | null>(null)
const busy = ref(false)
const notice = ref<string | null>(null)
const activeServiceId = ref<string | null>(db.value?.schema.services[0]?.id ?? null)
const manualPayload = ref('')
const lastResult = ref<ScanResult | null>(null)
const cameraMode = ref<CameraMode>(null)
const syncStatus = ref<SyncStatus>(emptySyncStatus)
const syncInvite = ref<SyncInvite | null>(null)
const syncInviteText = ref('')
const syncQr = ref<string | null>(null)
const joinText = ref('')
const scanViewportActiveClass = 'scan-viewport-active'

const stats = computed(() => (db.value ? serviceStats(db.value) : []))
const activeService = computed(() => db.value?.schema.services.find((service) => service.id === activeServiceId.value) ?? db.value?.schema.services[0])
const activeServiceStat = computed(() => (activeService.value ? stats.value.find((item) => item.serviceId === activeService.value?.id) : undefined))
const recentEvents = computed(() => [...(db.value?.events ?? [])].reverse().slice(0, 8))
const scanEnabled = computed(() => cameraMode.value !== null)
const scanner = useCapgoQrScanner(scanEnabled, onScannedValue)
const scanInstruction = computed(() => {
  const serviceLabel = activeService.value?.label.trim().toLowerCase() || 'entrance'
  return `Scan ${serviceLabel} ticket`
})

watch(
  () => cameraMode.value !== null,
  (isActive) => setScanViewportLock(isActive),
  { immediate: true },
)

const sync = new SyncController({
  getDatabase: () => db.value,
  onSnapshot: (remoteDb) => {
    setAndSaveDb(mergeDatabases(db.value, remoteDb))
    notice.value = `Synced ${remoteDb.records.length} rows from ${remoteDb.name}`
  },
  onScanEvent: (event) => {
    const current = db.value
    if (current) {
      setAndSaveDb(mergeRemoteScanEvent(current, event))
    }
  },
  onStatus: (status) => {
    syncStatus.value = status
  },
})

onBeforeUnmount(() => {
  sync.close()
  setScanViewportLock(false)
})

function setAndSaveDb(nextDb: FestivalDb | null) {
  db.value = nextDb
  if (nextDb) {
    saveDatabase(nextDb)
    festivalName.value = nextDb.name
    activeServiceId.value = activeServiceId.value ?? nextDb.schema.services[0]?.id ?? null
  }
}

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
}

async function runImport(source: 'file' | 'sheet' | 'example') {
  busy.value = true
  notice.value = null
  try {
    const aiSettings = settings.value.apiKey.trim() ? settings.value : undefined
    const result =
      source === 'file'
        ? selectedFile.value
          ? await importFile(selectedFile.value, festivalName.value, deviceId, aiSettings)
          : undefined
        : source === 'sheet'
          ? await importSheetUrl(sheetUrl.value, festivalName.value, deviceId, aiSettings)
          : await importExample(deviceId, aiSettings)

    if (!result) {
      notice.value = 'Choose a CSV/XLSX file first.'
      return
    }

    sync.close()
    syncInvite.value = null
    syncInviteText.value = ''
    syncQr.value = null
    setAndSaveDb(result.db)
    activeServiceId.value = result.db.schema.services[0]?.id ?? null
    lastResult.value = null
    notice.value = `Imported ${result.importedRows} rows with ${result.mapping.source} mapping.`
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'Import failed'
  } finally {
    busy.value = false
  }
}

function handleScan(payload: string) {
  const current = db.value
  const serviceId = activeServiceId.value
  if (!current || !serviceId) {
    lastResult.value = { status: 'error', title: 'No scan mode', detail: 'Import a sheet and choose a scan mode first.', payload }
    return
  }

  const next = applyScan(current, serviceId, payload, deviceId)
  setAndSaveDb(next.db)
  lastResult.value = next.result
  if (next.result.event) {
    sync.broadcastScanEvent(next.result.event)
  }
}

async function onScannedValue(value: string) {
  if (cameraMode.value === 'join') {
    await joinFromText(value)
    return
  }
  handleScan(value)
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
    syncQr.value = await toDataURL(encoded, { width: 280, margin: 1 })
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'Could not start sync'
  } finally {
    busy.value = false
  }
}

async function joinFromText(value: string) {
  try {
    const invite = decodeInvite(value)
    syncInvite.value = invite
    syncInviteText.value = encodeInvite(invite)
    await sync.join(invite, deviceId)
    cameraMode.value = null
    notice.value = `Joining ${invite.festivalName}`
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'Invalid sync invite'
  }
}

function exportCsv() {
  if (!db.value) {
    return
  }

  const blob = new Blob([exportDatabaseCsv(db.value)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${db.value.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'simple-festival'}-scans.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function submitManualScan() {
  const payload = manualPayload.value.trim()
  if (!payload) {
    return
  }
  handleScan(payload)
  manualPayload.value = ''
}

function resetDb() {
  sync.close()
  clearDatabase()
  setAndSaveDb(null)
  syncInvite.value = null
  syncInviteText.value = ''
  syncQr.value = null
  lastResult.value = null
  cameraMode.value = null
  notice.value = 'Local festival database removed.'
}

function persistAiSettings() {
  saveAiSettings(settings.value)
}

function statusLabel(result: ScanResult | null) {
  if (!result) {
    return 'Ready'
  }
  return result.title
}

function compactScannerError(error?: string | null) {
  if (!error) {
    return undefined
  }
  if (error.includes('mobile app')) {
    return 'Use manual entry on web.'
  }
  return error
}

function setScanViewportLock(isActive: boolean) {
  document.documentElement.classList.toggle(scanViewportActiveClass, isActive)
  document.body?.classList.toggle(scanViewportActiveClass, isActive)
}

function mergeDatabases(current: FestivalDb | null, remote: FestivalDb) {
  if (!current || current.id !== remote.id) {
    return remote
  }

  const events = [...new Map([...current.events, ...remote.events].map((event) => [event.id, event])).values()]
  return {
    ...remote,
    deviceId: current.deviceId,
    events,
    updatedAt: events.length ? events[events.length - 1]?.scannedAt ?? remote.updatedAt : remote.updatedAt,
  }
}
</script>

<template>
  <main v-if="cameraMode === 'join' || (db && cameraMode === 'scan')" class="app-shell scan-session camera-active">
    <header class="scan-topbar">
      <button class="icon-button" type="button" aria-label="Back to dashboard" @click="cameraMode = null">
        Back
      </button>
    </header>

    <section class="scan-camera" :aria-label="cameraMode === 'join' ? 'Invite scanner' : 'Ticket scanner'">
      <div id="camera-preview" />
    </section>

    <aside class="status-dock" aria-live="polite">
      <div v-if="cameraMode === 'join'" class="scan-result-strip idle">
        <div>
          <strong>Scan invite</strong>
          <span>{{ compactScannerError(scanner.error.value) ?? 'Point the camera at the host invite QR.' }}</span>
        </div>
      </div>
      <div v-else :class="['scan-result-strip', lastResult?.status ?? 'idle']">
        <div>
          <strong>{{ lastResult ? statusLabel(lastResult) : scanInstruction }}</strong>
          <span v-if="lastResult?.detail || compactScannerError(scanner.error.value)">
            {{ lastResult?.detail ?? compactScannerError(scanner.error.value) }}
          </span>
        </div>
        <b>{{ activeServiceStat?.scanned ?? 0 }}/{{ activeServiceStat?.eligible ?? 0 }}</b>
      </div>
    </aside>
  </main>

  <main v-else class="app-shell">
    <section class="topbar">
      <div>
        <p class="eyebrow">Local-first event scanner</p>
        <h1>{{ db?.name ?? 'Ezfest' }}</h1>
      </div>
      <div :class="['sync-pill', syncStatus.mode]">
        <span>{{ syncStatus.message }}</span>
        <strong v-if="syncStatus.peers > 0">{{ syncStatus.peers }}</strong>
      </div>
    </section>

    <div v-if="notice" class="notice">{{ notice }}</div>

    <section class="workspace-grid">
      <aside class="panel setup-panel">
        <div class="panel-heading">
          <h2>Database</h2>
          <p>Import a guest list, pick a scan mode, and keep every scan local.</p>
        </div>

        <label>
          Festival name
          <input v-model="festivalName" placeholder="Ezfest 2026" />
        </label>

        <label>
          CSV/XLSX file
          <input accept=".csv,.tsv,.xlsx,.xls" type="file" @change="selectFile" />
        </label>

        <label>
          Public Google Sheet or CSV URL
          <input v-model="sheetUrl" placeholder="https://docs.google.com/spreadsheets/..." />
        </label>

        <div class="button-row">
          <button :disabled="busy || !selectedFile" @click="void runImport('file')">Import file</button>
          <button class="secondary" :disabled="busy || !sheetUrl.trim()" @click="void runImport('sheet')">Import URL</button>
          <button class="secondary" :disabled="busy" @click="void runImport('example')">Load example</button>
        </div>

        <details class="settings-box">
          <summary>AI mapping</summary>
          <label>
            OpenAI API key
            <input v-model="settings.apiKey" type="password" @change="persistAiSettings" />
          </label>
          <label>
            Model
            <input v-model="settings.model" @change="persistAiSettings" />
          </label>
          <label>
            API base URL
            <input v-model="settings.baseUrl" @change="persistAiSettings" />
          </label>
        </details>

        <section v-if="!db" class="join-panel">
          <h2>Join host device</h2>
          <textarea v-model="joinText" placeholder="Paste sync invite from host device" />
          <div class="button-row">
            <button class="secondary" :disabled="!joinText.trim()" @click="void joinFromText(joinText)">Join code</button>
            <button class="secondary" @click="cameraMode = 'join'">Scan invite</button>
          </div>
        </section>
      </aside>

      <section class="main-panel">
        <section v-if="db" class="status-grid">
          <div class="metric">
            <small>Rows</small>
            <strong>{{ db.records.length }}</strong>
          </div>
          <div class="metric">
            <small>Scan modes</small>
            <strong>{{ db.schema.services.length }}</strong>
          </div>
          <div class="metric">
            <small>Local scans</small>
            <strong>{{ db.events.length }}</strong>
          </div>
          <div class="metric">
            <small>Mapping</small>
            <strong>{{ Math.round(db.schema.confidence * 100) }}% {{ db.schema.source }}</strong>
          </div>
        </section>

        <section v-if="db" class="panel modes-panel">
          <div class="panel-heading inline-heading">
            <div>
              <h2>Scan modes</h2>
              <p>Choose the entitlement to validate.</p>
            </div>
            <button class="secondary" @click="downloadExampleCsv">Example CSV</button>
          </div>
          <div class="service-grid">
            <button
              v-for="service in db.schema.services"
              :key="service.id"
              :class="['service-card', activeServiceId === service.id ? 'active' : '']"
              @click="activeServiceId = service.id"
            >
              <span>{{ service.label }}</span>
              <small>{{ stats.find((item) => item.serviceId === service.id)?.scanned ?? 0 }}/{{ stats.find((item) => item.serviceId === service.id)?.eligible ?? 0 }} scanned</small>
            </button>
          </div>
        </section>

        <section v-if="db" class="scanner-layout">
          <div class="panel scanner-panel">
            <div class="panel-heading">
              <h2>{{ activeService?.label ?? 'Scanner' }}</h2>
              <p>{{ compactScannerError(scanner.error.value) ?? 'Camera scan on mobile, manual code on web.' }}</p>
            </div>
            <div class="scanner-stage">
              <div id="camera-preview" />
              <span>QR</span>
            </div>
            <div class="button-row">
              <button @click="cameraMode = 'scan'">Scan QR</button>
              <button class="secondary" @click="exportCsv">Export CSV</button>
            </div>
            <form class="manual-form" @submit.prevent="submitManualScan">
              <input v-model="manualPayload" placeholder="Ticket code or email" />
              <button type="submit">Validate</button>
            </form>
          </div>

          <div class="panel result-panel">
            <div class="panel-heading">
              <h2>Last scan</h2>
              <p>{{ lastResult ? lastResult.payload : 'No scan yet.' }}</p>
            </div>
            <div v-if="lastResult" :class="['result', lastResult.status]">
              <strong>{{ lastResult.title }}</strong>
              <p>{{ lastResult.detail }}</p>
              <small v-if="lastResult.record && db">{{ displayName(lastResult.record, db) }}</small>
            </div>
            <div class="recent-list">
              <div v-for="event in recentEvents" :key="event.id">
                <span>{{ event.serviceLabel }}</span>
                <small>{{ new Date(event.scannedAt).toLocaleTimeString() }}</small>
              </div>
            </div>
          </div>
        </section>

        <section v-if="db" class="panel sync-panel">
          <div class="panel-heading inline-heading">
            <div>
              <h2>Device sync</h2>
              <p>Host a temporary room for another phone and keep scanning locally if the network drops.</p>
            </div>
            <button class="danger" @click="resetDb">Reset</button>
          </div>
          <div class="sync-grid">
            <div>
              <div class="button-row">
                <button :disabled="busy" @click="void hostSync()">Host festival</button>
                <button class="secondary" :disabled="!syncInvite" @click="sync.broadcastSnapshot()">Push state</button>
              </div>
              <textarea v-model="joinText" placeholder="Paste invite code from another device" />
              <div class="button-row">
                <button class="secondary" :disabled="!joinText.trim()" @click="void joinFromText(joinText)">Join code</button>
                <button class="secondary" @click="cameraMode = 'join'">Scan invite</button>
              </div>
            </div>
            <div class="invite-box">
              <img v-if="syncQr" :src="syncQr" alt="Device sync invite QR" />
              <div v-else class="qr-placeholder">QR</div>
              <textarea v-model="syncInviteText" readonly placeholder="Host a festival to generate an invite" />
            </div>
          </div>
        </section>

        <section v-if="db" class="panel mapping-panel">
          <div class="panel-heading">
            <h2>Detected schema</h2>
            <p>Mapping is inferred from the imported sheet and included in sync snapshots.</p>
          </div>
          <div class="mapping-grid">
            <div><small>Ticket code</small><strong>{{ db.schema.codeColumn ?? 'Not detected' }}</strong></div>
            <div><small>Name</small><strong>{{ db.schema.nameColumn ?? 'Not detected' }}</strong></div>
            <div><small>Email</small><strong>{{ db.schema.emailColumn ?? 'Not detected' }}</strong></div>
            <div><small>Paid</small><strong>{{ db.schema.paidColumn ?? 'Not detected' }}</strong></div>
          </div>
          <ul v-if="db.schema.warnings.length" class="warning-list">
            <li v-for="warning in db.schema.warnings" :key="warning">{{ warning }}</li>
          </ul>
        </section>

        <section v-if="!db" class="empty-state">
          <h2>Import a festival sheet or join a host device.</h2>
          <p>CSV, XLSX, public Google Sheet exports, and local device sync are supported.</p>
        </section>
      </section>
    </section>
  </main>
</template>

<style scoped>
:global(:root) {
  color-scheme: light;
  --ink: #172033;
  --muted: #667085;
  --line: #d9e2ec;
  --surface: #ffffff;
  --surface-soft: #f5f7fb;
  --accent: #2364aa;
  --accent-strong: #163d67;
  --ok: #138a36;
  --warn: #b7791f;
  --bad: #bc2f2f;
}

:global(html.scan-viewport-active),
:global(html.camera-preview-active) {
  width: 100%;
  height: 100%;
  max-width: 100%;
  padding: 0 !important;
  overflow: hidden !important;
  overscroll-behavior: none;
  --ion-background-color: transparent !important;
  background: transparent !important;
}

:global(html.scan-viewport-active body),
:global(html.scan-viewport-active body #app),
:global(html.camera-preview-active body),
:global(html.camera-preview-active body #app) {
  width: 100%;
  height: 100%;
  min-height: 100%;
  max-width: 100%;
  overflow: hidden !important;
  overscroll-behavior: none;
  --ion-background-color: transparent !important;
  background: transparent !important;
}

* {
  box-sizing: border-box;
}

.app-shell {
  width: 100%;
  min-height: 100vh;
  max-width: 100%;
  overflow-x: clip;
  padding: clamp(14px, 4vw, 24px);
  color: var(--ink);
  background: var(--surface-soft);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.topbar,
.scan-topbar {
  width: min(1240px, 100%);
  max-width: 100%;
  margin: 0 auto 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.eyebrow,
.scan-title p {
  margin: 0 0 8px;
  color: var(--accent-strong);
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0;
  font-size: clamp(2.5rem, 6vw, 5rem);
  line-height: 0.96;
  overflow-wrap: anywhere;
}

h2 {
  margin-bottom: 8px;
  font-size: 1.1rem;
}

p {
  color: var(--muted);
  line-height: 1.5;
}

button,
.actions a {
  max-width: 100%;
  min-height: 42px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  padding: 0 14px;
  background: var(--accent);
  color: white;
  font-weight: 800;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.secondary {
  background: white;
  color: var(--accent-strong);
}

.danger {
  border-color: var(--bad);
  background: var(--bad);
}

.icon-button {
  width: auto;
  background: white;
  color: var(--accent-strong);
}

.sync-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: white;
  color: var(--muted);
  font-size: 0.88rem;
  white-space: nowrap;
}

.sync-pill.connected,
.sync-pill.hosting {
  border-color: rgba(19, 138, 54, 0.28);
  color: var(--ok);
}

.notice {
  width: min(1240px, 100%);
  max-width: 100%;
  margin: 0 auto 18px;
  padding: 12px 14px;
  border: 1px solid rgba(35, 100, 170, 0.25);
  border-radius: 8px;
  background: #edf5ff;
  color: var(--accent-strong);
  font-weight: 700;
}

.workspace-grid {
  width: min(1240px, 100%);
  max-width: 100%;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.panel,
.empty-state,
.metric {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 12px 32px rgba(23, 32, 51, 0.07);
}

.panel {
  padding: 18px;
}

.panel-heading {
  margin-bottom: 16px;
}

.inline-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
  min-width: 0;
}

label {
  display: grid;
  gap: 7px;
  margin-bottom: 14px;
  color: var(--ink);
  font-size: 0.9rem;
  font-weight: 800;
}

input,
select,
textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 11px 12px;
  background: white;
  color: var(--ink);
}

textarea {
  min-height: 96px;
  resize: vertical;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 14px 0;
  min-width: 0;
}

.button-row > * {
  min-width: 0;
}

.settings-box,
.join-panel {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

summary {
  color: var(--accent-strong);
  font-weight: 900;
  cursor: pointer;
}

.main-panel {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.status-grid,
.scanner-layout,
.sync-grid,
.mapping-grid {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.status-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metric {
  padding: 16px;
}

.metric small,
.mapping-grid small,
.service-card small {
  display: block;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.metric strong {
  display: block;
  margin-top: 8px;
  font-size: 1.8rem;
}

.service-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.service-card {
  min-height: 94px;
  align-items: start;
  border-color: var(--line);
  background: white;
  color: var(--ink);
  text-align: left;
}

.service-card.active {
  border-color: var(--accent);
  background: #edf5ff;
}

.service-card span {
  display: block;
  margin-bottom: 12px;
}

.scanner-layout,
.sync-grid {
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.86fr);
}

.scanner-stage {
  position: relative;
  min-width: 0;
  min-height: 280px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px dashed #9bb6d1;
  border-radius: 8px;
  background: #0f172a;
  color: white;
  font-size: 2rem;
  font-weight: 900;
}

#camera-preview {
  position: absolute;
  inset: 0;
}

.manual-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.result {
  padding: 14px;
  border-radius: 8px;
  background: #f8fafc;
}

.result.accepted {
  background: #eaf8ef;
  color: var(--ok);
}

.result.duplicate,
.result.unpaid,
.result.not_entitled {
  background: #fff8e6;
  color: var(--warn);
}

.result.unknown,
.result.error {
  background: #fff0f0;
  color: var(--bad);
}

.recent-list {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.recent-list div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--line);
}

.invite-box {
  display: grid;
  gap: 10px;
}

.invite-box img,
.qr-placeholder {
  width: min(100%, 280px);
  aspect-ratio: 1;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: white;
  justify-self: center;
}

.qr-placeholder {
  display: grid;
  place-items: center;
  color: var(--accent-strong);
  font-size: 2rem;
  font-weight: 900;
}

.mapping-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.mapping-grid div {
  min-width: 0;
  padding-top: 12px;
  border-top: 2px solid var(--accent);
}

.mapping-grid strong {
  display: block;
  overflow-wrap: anywhere;
}

.warning-list {
  margin: 16px 0 0;
  color: var(--warn);
}

.empty-state {
  min-height: 420px;
  display: grid;
  place-items: center;
  padding: 34px;
  text-align: center;
}

.empty-state h2 {
  font-size: clamp(2rem, 4vw, 3rem);
}

.join-scan {
  width: min(560px, 100%);
}

.scan-session {
  position: fixed;
  inset: 0;
  z-index: 1000;
  width: 100vw;
  max-width: 100vw;
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 0;
  overflow: hidden !important;
  overscroll-behavior: none;
  touch-action: none;
  background: transparent;
  color: white;
}

.scan-session.camera-active {
  background: transparent;
}

.scan-session p,
.scan-session .scan-title p {
  color: #aebbd0;
}

.scan-session .scan-topbar {
  position: absolute;
  z-index: 3;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: calc(env(safe-area-inset-left, 0px) + 12px);
  width: auto;
  max-width: calc(100% - 24px);
  margin: 0;
  display: flex;
  justify-content: flex-start;
}

.scan-session .icon-button {
  min-height: 44px;
  border-color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 30px rgba(7, 17, 31, 0.28);
  backdrop-filter: blur(14px);
}

.scan-camera {
  position: absolute;
  inset: 0;
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  margin: 0;
  overflow: hidden !important;
  border-radius: 0;
  background: transparent;
}

.scan-session.camera-active .scan-camera {
  background: transparent;
}

.status-dock {
  position: absolute;
  z-index: 3;
  right: calc(env(safe-area-inset-right, 0px) + 12px);
  bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
  left: calc(env(safe-area-inset-left, 0px) + 12px);
  width: auto;
  max-width: none;
  margin: 0;
}

.scan-result-strip {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
  padding: 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--ink);
  box-shadow: 0 16px 40px rgba(7, 17, 31, 0.24);
  backdrop-filter: blur(18px);
}

.scan-result-strip > div {
  min-width: 0;
}

.scan-result-strip strong,
.scan-result-strip b {
  overflow-wrap: anywhere;
}

.scan-result-strip span {
  display: block;
  color: var(--muted);
}

@media (max-width: 900px) {
  .app-shell {
    padding: 14px;
  }

  .topbar,
  .scan-topbar,
  .workspace-grid,
  .scanner-layout,
  .sync-grid {
    grid-template-columns: 1fr;
  }

  .topbar,
  .scan-topbar {
    display: grid;
  }

  .status-grid,
  .mapping-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 540px) {
  .status-grid,
  .mapping-grid,
  .manual-form {
    grid-template-columns: 1fr;
  }

  .inline-heading {
    display: grid;
  }

  .sync-pill {
    white-space: normal;
  }

  .service-grid {
    grid-template-columns: 1fr;
  }

  .panel,
  .metric,
  .empty-state {
    padding: 14px;
  }
}
</style>
