<script setup lang="ts">
import { computed, ref } from 'vue'
import { IonButton, IonIcon, IonSpinner, IonTextarea } from '@ionic/vue'
import { copyOutline, qrCodeOutline, radioOutline, scanOutline, shareOutline, stopCircleOutline, syncOutline } from 'ionicons/icons'
import { useFestival } from '../composables/useFestival'
import { copyText, notify, shareText } from '../native/device'

const emit = defineEmits<{ scanInvite: [] }>()
const { db, busy, syncStatus, syncInviteText, syncQr, hostSync, joinFromText, stopSync, pushSnapshot } = useFestival()
const joinCode = ref('')
const active = computed(() => syncStatus.value.mode !== 'off')
const statusTone = computed(() =>
  syncStatus.value.mode === 'error' ? 'danger' : syncStatus.value.mode === 'off' ? 'medium' : syncStatus.value.mode === 'joining' ? 'warning' : 'success',
)

async function copyInvite() {
  await copyText(syncInviteText.value)
  notify('success', 'Invite copied')
}

async function join() {
  if (await joinFromText(joinCode.value)) {
    joinCode.value = ''
  }
}
</script>

<template>
  <div class="page-width sync-tab">
    <section class="status card">
      <span :class="['dot', statusTone]" aria-hidden="true" />
      <div>
        <strong>{{ syncStatus.message }}</strong>
        <p class="muted">
          {{
            syncStatus.mode === 'off'
              ? 'Scans stay on this phone. Start sync to share them live with other staff.'
              : syncStatus.peers > 0
                ? `${syncStatus.peers} other ${syncStatus.peers === 1 ? 'device' : 'devices'} connected`
                : 'Scans keep working offline and catch up when the connection returns.'
          }}
        </p>
      </div>
    </section>

    <template v-if="syncQr">
      <h2 class="section-title">Invite a device</h2>
      <section class="invite card">
        <img :src="syncQr" alt="Device sync invite QR" width="280" height="280" />
        <p class="muted">On the other phone, open Simple Festival and choose <b>Join another device</b>.</p>
        <div class="row">
          <IonButton fill="outline" @click="shareText('Simple Festival invite', syncInviteText)">
            <IonIcon slot="start" :icon="shareOutline" aria-hidden="true" />Share
          </IonButton>
          <IonButton fill="outline" @click="copyInvite">
            <IonIcon slot="start" :icon="copyOutline" aria-hidden="true" />Copy code
          </IonButton>
        </div>
      </section>
    </template>

    <template v-if="db">
      <h2 class="section-title">Host</h2>
      <IonButton v-if="!syncQr" class="tall" expand="block" :disabled="busy" @click="hostSync">
        <IonSpinner v-if="busy" name="crescent" />
        <template v-else><IonIcon slot="start" :icon="radioOutline" aria-hidden="true" />Host {{ db.name }}</template>
      </IonButton>
      <IonButton v-else expand="block" fill="outline" @click="pushSnapshot">
        <IonIcon slot="start" :icon="syncOutline" aria-hidden="true" />Send guest list again
      </IonButton>
    </template>

    <h2 class="section-title">Join</h2>
    <IonButton expand="block" fill="outline" @click="emit('scanInvite')">
      <IonIcon slot="start" :icon="scanOutline" aria-hidden="true" />Scan invite QR
    </IonButton>
    <form class="join card" @submit.prevent="join">
      <IonTextarea v-model="joinCode" aria-label="Invite code" placeholder="…or paste an invite code" :auto-grow="true" :rows="2" />
      <IonButton type="submit" :disabled="!joinCode.trim()">Join</IonButton>
    </form>

    <IonButton v-if="active" class="stop" expand="block" fill="clear" color="danger" @click="stopSync">
      <IonIcon slot="start" :icon="stopCircleOutline" aria-hidden="true" />Stop sync
    </IonButton>

    <p class="footnote muted">
      <IonIcon :icon="qrCodeOutline" aria-hidden="true" />
      The invite contains a one-time secret. Only share it with your staff.
    </p>
  </div>
</template>

<style scoped>
.sync-tab {
  padding: 16px 16px 24px;
}

.status {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 16px;
}

.status p {
  margin: 4px 0 0;
  line-height: 1.4;
}

.dot {
  flex: none;
  width: 12px;
  height: 12px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--ion-color-medium);
}

.dot.success {
  background: var(--ion-color-success);
  box-shadow: 0 0 0 5px rgba(var(--ion-color-success-rgb), 0.2);
}

.dot.warning {
  background: var(--ion-color-warning);
}

.dot.danger {
  background: var(--ion-color-danger);
}

.invite {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 20px;
  text-align: center;
}

.invite img {
  width: min(280px, 100%);
  height: auto;
  padding: 10px;
  border-radius: 16px;
  background: #fff;
}

.invite p {
  margin: 4px 0;
  line-height: 1.4;
}

.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
}

.join {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 10px;
  padding: 4px 8px 4px 14px;
}

.join ion-textarea {
  flex: 1;
}

.stop {
  margin-top: 20px;
}

.footnote {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 20px 4px 0;
  font-size: 0.85rem;
}
</style>
