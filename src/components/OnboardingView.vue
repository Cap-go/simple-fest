<script setup lang="ts">
import { IonButton, IonContent, IonIcon, IonPage, IonSpinner } from '@ionic/vue'
import { cloudOfflineOutline, documentTextOutline, phonePortraitOutline, qrCodeOutline } from 'ionicons/icons'
import { useFestival } from '../composables/useFestival'

const emit = defineEmits<{ import: []; join: [] }>()
const { busy, runImport, syncStatus, stopSync } = useFestival()

const steps = [
  { icon: documentTextOutline, title: 'Import your guest list', text: 'CSV, Excel or a Google Sheet. Columns are detected for you.' },
  { icon: qrCodeOutline, title: 'Scan what matters', text: 'Entrance, day passes, meals and drink tokens become scan modes.' },
  { icon: cloudOfflineOutline, title: 'Works offline', text: 'Every scan is saved on the phone first, then synced across devices.' },
]
</script>

<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <main class="onboarding page-width">
        <div class="intro">
          <header class="hero">
            <img src="/app-icon.png" alt="" width="88" height="88" />
            <h1>Simple Fest</h1>
            <p>Check tickets at the gate, the bar and the food stand from one spreadsheet.</p>
          </header>

          <ol class="steps">
            <li v-for="step in steps" :key="step.title">
              <span class="step-icon"><IonIcon :icon="step.icon" aria-hidden="true" /></span>
              <div>
                <strong>{{ step.title }}</strong>
                <p>{{ step.text }}</p>
              </div>
            </li>
          </ol>
        </div>

        <div v-if="syncStatus.mode !== 'off'" class="waiting card" role="status">
          <IonSpinner v-if="syncStatus.mode !== 'error'" name="dots" />
          <div>
            <strong>{{ syncStatus.mode === 'error' ? 'Could not reach the host' : 'Waiting for the host device…' }}</strong>
            <p>{{ syncStatus.message }}</p>
          </div>
          <IonButton fill="clear" size="small" @click="stopSync">Cancel</IonButton>
        </div>

        <div class="actions">
          <IonButton class="tall" expand="block" @click="emit('import')">Import guest list</IonButton>
          <IonButton class="tall" expand="block" fill="outline" :disabled="busy" @click="runImport({ kind: 'example' }, '')">
            <IonSpinner v-if="busy" name="crescent" />
            <span v-else>Try with sample data</span>
          </IonButton>
          <IonButton expand="block" fill="clear" @click="emit('join')">
            <IonIcon slot="start" :icon="phonePortraitOutline" aria-hidden="true" />
            Join another device
          </IonButton>
        </div>
      </main>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.onboarding {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: calc(env(safe-area-inset-top) + 40px) max(24px, env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 24px)
    max(24px, env(safe-area-inset-left));
}

.hero {
  text-align: center;
}

.hero img {
  border-radius: 22.5%;
}

.hero h1 {
  margin: 20px 0 8px;
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.hero p {
  max-width: 340px;
  margin: 0 auto;
  color: var(--app-muted);
  font-size: 1.05rem;
  line-height: 1.45;
}

.steps {
  display: grid;
  gap: 20px;
  margin: 40px 0 32px;
  padding: 0;
  list-style: none;
}

.steps li {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.step-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(var(--ion-color-primary-rgb), 0.12);
  color: var(--ion-color-primary);
  font-size: 1.35rem;
}

.steps strong {
  font-size: 1.02rem;
}

.steps p {
  margin: 3px 0 0;
  color: var(--app-muted);
  line-height: 1.4;
}

.waiting {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 8px 12px 16px;
}

.waiting div {
  flex: 1;
}

.waiting p {
  margin: 2px 0 0;
  color: var(--app-muted);
  font-size: 0.85rem;
}

.actions {
  display: grid;
  gap: 6px;
  margin-top: auto;
}

@media (min-width: 640px) {
  .onboarding {
    max-width: 520px;
    justify-content: center;
  }

  .actions {
    margin-top: 0;
  }
}

/* Short displays such as the iPhone Duo outer screen: keep the actions visible. */
@media (max-height: 760px) {
  .onboarding {
    padding-top: calc(env(safe-area-inset-top) + 20px);
  }

  .hero img {
    width: 64px;
    height: 64px;
    border-radius: 16px;
  }

  .hero h1 {
    margin-top: 12px;
    font-size: 1.7rem;
  }

  .hero p {
    font-size: 0.98rem;
  }

  .steps {
    gap: 12px;
    margin: 22px 0 18px;
  }

  .steps p {
    font-size: 0.9rem;
  }

  .step-icon {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    font-size: 1.15rem;
  }
}

/* Landscape: intro on the left, actions on the right. */
@media (orientation: landscape) and (min-width: 600px) {
  .onboarding {
    max-width: 980px;
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
    gap: 40px;
    align-items: center;
  }

  .hero {
    text-align: left;
  }

  .hero p {
    margin: 0;
  }

  .actions {
    margin-top: 0;
  }
}
</style>
