<script setup lang="ts">
import { computed } from 'vue'
import { IonIcon } from '@ionic/vue'
import type { FestivalDb, ScanResult } from '../domain/types'
import { displayName } from '../domain/scanEngine'
import { statusMeta } from '../ui'

const props = defineProps<{ result: ScanResult; db: FestivalDb | null; mode?: string }>()
const meta = computed(() => statusMeta(props.result.status))
const guest = computed(() => (props.result.record && props.db ? displayName(props.result.record, props.db) : null))
</script>

<template>
  <section :class="['result-card', meta.tone]" role="status" aria-live="assertive">
    <IonIcon :icon="meta.icon" aria-hidden="true" />
    <div class="body">
      <small v-if="mode">{{ mode }}</small>
      <strong>{{ result.title }}</strong>
      <span v-if="guest" class="guest">{{ guest }}</span>
      <p v-if="!(guest && result.status === 'accepted')">{{ result.detail }}</p>
    </div>
  </section>
</template>

<style scoped>
.result-card {
  --tone: var(--ion-color-medium);
  --tone-contrast: #fff;
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px;
  border-radius: var(--app-radius);
  background: var(--tone);
  color: var(--tone-contrast);
  animation: pop 0.22s ease-out;
}

.success {
  --tone: var(--ion-color-success);
  --tone-contrast: var(--ion-color-success-contrast);
}

.warning {
  --tone: var(--ion-color-warning);
  --tone-contrast: var(--ion-color-warning-contrast);
}

.danger {
  --tone: var(--ion-color-danger);
  --tone-contrast: var(--ion-color-danger-contrast);
}

ion-icon {
  flex: none;
  font-size: 2.6rem;
}

.body {
  min-width: 0;
  display: grid;
  gap: 2px;
}

small {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.85;
}

strong {
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1.15;
}

.guest {
  font-size: 1.1rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

p {
  margin: 4px 0 0;
  line-height: 1.35;
  opacity: 0.92;
  overflow-wrap: anywhere;
}

@keyframes pop {
  from {
    transform: scale(0.96);
    opacity: 0.4;
  }
}
</style>
