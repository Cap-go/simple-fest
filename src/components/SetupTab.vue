<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSelect,
  IonSelectOption,
  alertController,
} from '@ionic/vue'
import { add, cloudUploadOutline, downloadOutline, sparklesOutline, trashOutline, warningOutline } from 'ionicons/icons'
import { useFestival, type RoleColumn } from '../composables/useFestival'
import { downloadExampleCsv } from '../domain/sampleSheet'
import type { ScanKind } from '../domain/types'
import { kindOptions, serviceIcon } from '../ui'

const emit = defineEmits<{ import: [] }>()
const { db, settings, statFor, exportCsv, resetDb, persistAiSettings, renameFestival, updateRoleColumn, updateService, addService, removeService } =
  useFestival()

const name = ref(db.value?.name ?? '')
watch(
  () => db.value?.name,
  (value) => {
    name.value = value ?? ''
  },
)

const roles: { key: RoleColumn; label: string; hint: string }[] = [
  { key: 'codeColumn', label: 'Ticket code', hint: 'Value inside the QR code' },
  { key: 'idColumn', label: 'Ticket ID', hint: 'Also accepted when typed' },
  { key: 'nameColumn', label: 'Guest name', hint: 'Shown after a scan' },
  { key: 'emailColumn', label: 'Email', hint: 'Also accepted when typed' },
  { key: 'paidColumn', label: 'Paid', hint: 'Unpaid rows are refused' },
]

async function confirmReset() {
  const alert = await alertController.create({
    header: 'Remove this event?',
    message: 'The guest list and every scan stored on this phone will be deleted. Export a CSV first if you need the scans.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Remove', role: 'destructive', handler: () => resetDb() },
    ],
  })
  await alert.present()
}

async function confirmRemoveMode(id: string, label: string) {
  const alert = await alertController.create({
    header: `Remove “${label}”?`,
    message: 'Scans already recorded for this mode stay in the export.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Remove', role: 'destructive', handler: () => removeService(id) },
    ],
  })
  await alert.present()
}
</script>

<template>
  <div v-if="db" class="page-width setup-tab">
    <section class="stats">
      <div class="card">
        <strong>{{ db.records.length }}</strong><span>Guests</span>
      </div>
      <div class="card">
        <strong>{{ db.events.length }}</strong><span>Scans</span>
      </div>
      <div class="card">
        <strong>{{ db.schema.services.length }}</strong><span>Modes</span>
      </div>
    </section>

    <div v-if="db.schema.warnings.length" class="warnings card">
      <IonIcon :icon="warningOutline" aria-hidden="true" />
      <ul>
        <li v-for="warning in db.schema.warnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>

    <h2 class="section-title">Event</h2>
    <IonList class="inset" lines="none">
      <IonItem>
        <IonInput v-model="name" label="Event name" label-placement="stacked" @ion-blur="renameFestival(name)" @keyup.enter="renameFestival(name)" />
      </IonItem>
    </IonList>

    <h2 class="section-title">Ticket columns</h2>
    <IonList class="inset" lines="full">
      <IonItem v-for="role in roles" :key="role.key">
        <IonSelect
          :value="db.schema[role.key] ?? ''"
          :label="role.label"
          interface="action-sheet"
          @ion-change="updateRoleColumn(role.key, String($event.detail.value ?? ''))"
        >
          <IonSelectOption value="">Not used</IonSelectOption>
          <IonSelectOption v-for="column in db.columns" :key="column" :value="column">{{ column }}</IonSelectOption>
        </IonSelect>
      </IonItem>
    </IonList>
    <p class="caption muted">
      Detected {{ db.schema.source === 'manual' ? 'and edited by you' : `with ${Math.round(db.schema.confidence * 100)}% confidence` }}.
    </p>

    <h2 class="section-title">Scan modes</h2>
    <IonAccordionGroup class="inset-accordion">
      <IonAccordion v-for="service in db.schema.services" :key="service.id" :value="service.id">
        <IonItem slot="header">
          <IonIcon slot="start" :icon="serviceIcon(service.kind)" color="primary" aria-hidden="true" />
          <IonLabel>
            <h3>{{ service.label }}</h3>
            <p>{{ statFor(service.id)?.scanned ?? 0 }} of {{ statFor(service.id)?.eligible ?? 0 }} used</p>
          </IonLabel>
        </IonItem>
        <IonList slot="content" lines="full">
          <IonItem>
            <IonInput
              :value="service.label"
              label="Name"
              label-placement="stacked"
              @ion-change="updateService(service.id, { label: String($event.detail.value ?? '').trim() || service.label })"
            />
          </IonItem>
          <IonItem>
            <IonSelect :value="service.kind" label="Type" interface="action-sheet" @ion-change="updateService(service.id, { kind: $event.detail.value as ScanKind })">
              <IonSelectOption v-for="kind in kindOptions" :key="kind.value" :value="kind.value">{{ kind.label }}</IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect
              :value="service.entitlementColumn ?? ''"
              label="Allowed when"
              interface="action-sheet"
              @ion-change="updateService(service.id, { entitlementColumn: String($event.detail.value ?? '') || undefined })"
            >
              <IonSelectOption value="">Every paid guest</IonSelectOption>
              <IonSelectOption v-for="column in db.columns" :key="column" :value="column">{{ column }} is yes</IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect
              :value="service.quotaColumn ?? ''"
              label="Uses per guest"
              interface="action-sheet"
              @ion-change="updateService(service.id, { quotaColumn: String($event.detail.value ?? '') || undefined })"
            >
              <IonSelectOption value="">Once</IonSelectOption>
              <IonSelectOption v-for="column in db.columns" :key="column" :value="column">From {{ column }}</IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect
              :value="service.consumedColumn ?? ''"
              label="Scanned column"
              interface="action-sheet"
              @ion-change="updateService(service.id, { consumedColumn: String($event.detail.value ?? '') || undefined })"
            >
              <IonSelectOption value="">None</IonSelectOption>
              <IonSelectOption v-for="column in db.columns" :key="column" :value="column">{{ column }}</IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem button :detail="false" @click="confirmRemoveMode(service.id, service.label)">
            <IonIcon slot="start" :icon="trashOutline" color="danger" aria-hidden="true" />
            <IonLabel color="danger">Remove scan mode</IonLabel>
          </IonItem>
        </IonList>
      </IonAccordion>
    </IonAccordionGroup>
    <IonButton expand="block" fill="clear" @click="addService">
      <IonIcon slot="start" :icon="add" aria-hidden="true" />Add scan mode
    </IonButton>

    <h2 class="section-title">Data</h2>
    <IonList class="inset" lines="full">
      <IonItem button @click="exportCsv">
        <IonIcon slot="start" :icon="downloadOutline" color="primary" aria-hidden="true" />
        <IonLabel>Export scans as CSV</IonLabel>
      </IonItem>
      <IonItem button @click="emit('import')">
        <IonIcon slot="start" :icon="cloudUploadOutline" color="primary" aria-hidden="true" />
        <IonLabel>Import a new guest list</IonLabel>
      </IonItem>
      <IonItem button @click="downloadExampleCsv">
        <IonIcon slot="start" :icon="downloadOutline" color="medium" aria-hidden="true" />
        <IonLabel>Download example CSV</IonLabel>
      </IonItem>
    </IonList>

    <h2 class="section-title">AI column detection</h2>
    <IonAccordionGroup class="inset-accordion">
      <IonAccordion value="ai">
        <IonItem slot="header">
          <IonIcon slot="start" :icon="sparklesOutline" color="secondary" aria-hidden="true" />
          <IonLabel>OpenAI-compatible API</IonLabel>
          <IonNote slot="end">{{ settings.apiKey ? 'On' : 'Off' }}</IonNote>
        </IonItem>
        <IonList slot="content" lines="full">
          <IonItem>
            <IonInput v-model="settings.apiKey" type="password" label="API key" label-placement="stacked" placeholder="sk-…" @ion-change="persistAiSettings" />
          </IonItem>
          <IonItem>
            <IonInput v-model="settings.model" label="Model" label-placement="stacked" @ion-change="persistAiSettings" />
          </IonItem>
          <IonItem>
            <IonInput v-model="settings.baseUrl" label="Base URL" label-placement="stacked" inputmode="url" @ion-change="persistAiSettings" />
          </IonItem>
        </IonList>
      </IonAccordion>
    </IonAccordionGroup>
    <p class="caption muted">Used only when importing. The key stays on this device.</p>

    <IonButton class="reset" expand="block" fill="outline" color="danger" @click="confirmReset">
      <IonIcon slot="start" :icon="trashOutline" aria-hidden="true" />Remove event from this phone
    </IonButton>
  </div>
</template>

<style scoped>
.setup-tab {
  padding: 16px 16px 32px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.stats .card {
  display: grid;
  gap: 2px;
  padding: 14px;
}

.stats strong {
  font-size: 1.6rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.stats span {
  color: var(--app-muted);
  font-size: 0.85rem;
}

.warnings {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  padding: 14px;
  border-color: rgba(var(--ion-color-warning-rgb), 0.4);
  background: rgba(var(--ion-color-warning-rgb), 0.1);
}

.warnings ion-icon {
  flex: none;
  font-size: 1.3rem;
  color: var(--ion-color-warning);
}

.warnings ul {
  margin: 0;
  padding-left: 16px;
}

.caption {
  margin: 8px 4px 0;
  font-size: 0.85rem;
}

.inset-accordion {
  overflow: hidden;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius);
  box-shadow: var(--app-shadow);
}

ion-accordion ion-list {
  padding: 0 0 0 12px;
  background: var(--ion-item-background);
}

ion-item h3 {
  font-weight: 600;
}

.reset {
  margin-top: 32px;
}
</style>
