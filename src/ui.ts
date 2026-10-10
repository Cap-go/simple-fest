import { alertCircle, beerOutline, calendarOutline, checkmarkCircle, closeCircle, enterOutline, helpCircle, qrCodeOutline, restaurantOutline } from 'ionicons/icons'
import type { ScanKind, ScanStatus } from './domain/types'

export const kindOptions: { value: ScanKind; label: string }[] = [
  { value: 'entrance', label: 'Entrance' },
  { value: 'day', label: 'Day pass' },
  { value: 'food', label: 'Food' },
  { value: 'drink', label: 'Drink' },
  { value: 'custom', label: 'Custom' },
]

export function serviceIcon(kind: ScanKind) {
  return { entrance: enterOutline, day: calendarOutline, food: restaurantOutline, drink: beerOutline, custom: qrCodeOutline }[kind]
}

export function statusMeta(status: ScanStatus) {
  switch (status) {
    case 'accepted':
      return { tone: 'success', icon: checkmarkCircle }
    case 'duplicate':
      return { tone: 'warning', icon: alertCircle }
    case 'unknown':
      return { tone: 'danger', icon: helpCircle }
    default:
      return { tone: 'danger', icon: closeCircle }
  }
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
