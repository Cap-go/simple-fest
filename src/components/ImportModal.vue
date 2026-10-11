<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { cloudUploadOutline, documentTextOutline, linkOutline, sparklesOutline } from 'ionicons/icons'
import { useFestival } from '../composables/useFestival'
import { downloadExampleCsv } from '../domain/sampleSheet'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; imported: [] }>()

const { busy, runImport, chatGpt } = useFestival()
const source = ref<'file' | 'sheet'>('file')
const name = ref('')
const url = ref('')
const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const canImport = computed(() => !busy.value && (source.value === 'file' ? Boolean(file.value) : Boolean(url.value.trim())))

function pickFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

async function submit() {
  const ok =
    source.value === 'file' && file.value
      ? await runImport({ kind: 'file', file: file.value }, name.value)
      : await runImport({ kind: 'sheet', url: url.value.trim() }, name.value)
  if (ok) {
    file.value = null
    url.value = ''
    emit('imported')
  }
}
</script>

<template>
  <IonModal :is-open="open" @did-dismiss="emit('close')">
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonButton @click="emit('close')">Cancel</IonButton>
        </IonButtons>
        <IonTitle>Import guest list</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <div class="page-width">
        <IonSegment :value="source" @ion-change="source = ($event.detail.value as 'file' | 'sheet')">
          <IonSegmentButton value="file">
            <IonLabel>File</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="sheet">
            <IonLabel>Google Sheet</IonLabel>
          </IonSegmentButton>
        </IonSegment>

        <template v-if="source === 'file'">
          <button class="drop-zone" type="button" @click="fileInput?.click()">
            <IonIcon :icon="file ? documentTextOutline : cloudUploadOutline" aria-hidden="true" />
            <strong>{{ file ? file.name : 'Choose a CSV or Excel file' }}</strong>
            <span>{{ file ? `${Math.max(1, Math.round(file.size / 1024))} KB · tap to change` : 'CSV, TSV, XLSX or XLS' }}</span>
          </button>
          <input ref="fileInput" class="sr-only" accept=".csv,.tsv,.xlsx,.xls,text/csv" type="file" @change="pickFile" />
        </template>

        <IonList v-else class="inset field-list" lines="none">
          <IonItem>
            <IonIcon slot="start" :icon="linkOutline" aria-hidden="true" />
            <IonInput
              v-model="url"
              label="Sheet or CSV link"
              label-placement="stacked"
              inputmode="url"
              placeholder="https://docs.google.com/spreadsheets/…"
            />
          </IonItem>
        </IonList>
        <p v-if="source === 'sheet'" class="hint">Share the sheet as “Anyone with the link can view”, then paste the link.</p>

        <IonList class="inset field-list" lines="none">
          <IonItem>
            <IonInput v-model="name" label="Event name (optional)" label-placement="stacked" placeholder="Summer Fest 2026" />
          </IonItem>
        </IonList>

        <IonButton class="tall" expand="block" :disabled="!canImport" @click="submit">
          <IonSpinner v-if="busy" name="crescent" />
          <span v-else>Import</span>
        </IonButton>

        <div class="help card">
          <IonIcon :icon="sparklesOutline" aria-hidden="true" />
          <div>
            <strong>Columns are detected automatically</strong>
            <p>
              One row per guest with a ticket code, plus optional name, email, paid and one column per day, meal or drink quota.
              {{ chatGpt ? 'ChatGPT is connected for smarter detection.' : '' }}
            </p>
            <IonButton fill="clear" size="small" @click="downloadExampleCsv">Download example CSV</IonButton>
          </div>
        </div>
      </div>
    </IonContent>
  </IonModal>
</template>

<style scoped>
ion-segment {
  margin-bottom: 18px;
}

.drop-zone {
  width: 100%;
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 32px 16px;
  border: 2px dashed rgba(var(--ion-text-color-rgb), 0.18);
  border-radius: var(--app-radius);
  background: var(--app-surface);
  color: var(--ion-text-color);
  font: inherit;
  cursor: pointer;
}

.drop-zone ion-icon {
  font-size: 2.4rem;
  color: var(--app-muted);
}

.drop-zone strong {
  font-size: 1.05rem;
  overflow-wrap: anywhere;
}

.drop-zone span,
.hint,
.help p {
  color: var(--app-muted);
  font-size: 0.9rem;
}

.hint {
  margin: 8px 4px 0;
}

.field-list {
  margin-top: 16px;
}

ion-button.tall {
  margin-top: 20px;
}

.help {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding: 16px;
}

.help ion-icon {
  flex: none;
  font-size: 1.4rem;
  color: var(--app-muted);
}

.help p {
  margin: 4px 0 0;
  line-height: 1.45;
}

.help ion-button {
  margin: 6px 0 0 -12px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
