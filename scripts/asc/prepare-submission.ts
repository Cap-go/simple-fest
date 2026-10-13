// Fills everything App Review needs that the App Store Connect API supports: listing text, URLs,
// category, age rating, content rights, free price, availability, review contact and the build.
// App Privacy answers have no API and must be set in App Store Connect.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, optional BUNDLE_ID, BUILD (defaults to the newest valid build).
// Usage: bun scripts/asc/prepare-submission.ts
import { api, ok, type Json } from './client'

const bundleId = process.env.BUNDLE_ID ?? 'ee.forgr.festivalscan'
const site = 'https://simplefest.app'

// ASO: name + subtitle + keywords are indexed together and each word counts once, so the keyword
// field never repeats a word from the name or subtitle. Keywords are 100 bytes max, no spaces.
const listing = {
  name: 'Simple Fest: Ticket Scanner',
  subtitle: 'Event QR Check-in & Guest List',
  keywords: 'festival,entry,door,gate,admission,attendee,wristband,csv,excel,sheets,offline,concert,party,pass',
  promotionalText: 'Import your guest list from CSV, Excel or Google Sheets and scan QR tickets in minutes. Free, no account, works offline and syncs every staff phone.',
  description: `Turn any guest list into a fast QR ticket scanner. Simple Fest checks in guests at festivals, concerts, parties, conferences and club nights, right from the spreadsheet you already have.

Import a CSV, Excel file or Google Sheet. Simple Fest finds the ticket code, guest name, paid status and every checkpoint in your sheet: entry, day passes, meals, drink tokens or your own scan modes. No ticketing platform, no account, no setup call.

CHECK-IN AT THE DOOR
• Scan QR tickets with the camera, or type a code or email
• Big green, orange or red result with the guest name
• Already used and unpaid tickets are refused instantly
• Sound and haptic feedback, so staff can keep their eyes on the queue
• Screen stays awake while scanning

BUILT FOR REAL EVENTS
• Works offline: every scan is saved on the phone first
• Host a session and let other staff phones join with a QR invite
• Scans sync live between all devices at every gate
• A ticket scanned at one entrance is refused at the others

EVERY CHECKPOINT FROM ONE SHEET
• Entrance, Friday and Saturday day passes, meals, drinks, wristbands
• Edit detected columns and scan modes at any time

YOUR DATA STAYS YOURS
• Free, with no account and no ads
• Guest lists stay on your devices
• Export an updated CSV with every scan time when the event ends

Simple Fest is made for festival teams, event organizers, venues and volunteers who manage their attendees in a spreadsheet and need a reliable door scanner today.`,
  copyright: '2026 Digital Shift OÜ',
  supportUrl: `${site}/support/`,
  marketingUrl: `${site}/`,
  privacyPolicyUrl: `${site}/privacy/`,
}

const reviewNotes = `No account is needed to scan tickets.
1. On the first screen tap "Try with sample data".
2. Type TCK-1001 in the "Type ticket code or email" field and press the arrow: Accepted.
3. Type TCK-1001 again: Already scanned. TCK-1003: Not paid.
4. "Scan Entrance" opens the camera scanner for QR tickets. A sample ticket QR encodes TCK-1002.
5. The Devices tab hosts a sync room and shows an invite QR for a second device.
Microphone and location are never requested; the camera library references those APIs.`

const app = (await ok('GET', `/v1/apps?filter[bundleId]=${bundleId}`)).data[0]
const appId: string = app.id
const version = (await ok('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&filter[appStoreState]=PREPARE_FOR_SUBMISSION,DEVELOPER_REJECTED,REJECTED,METADATA_REJECTED`)).data[0]
if (!version) throw new Error('No editable iOS version')
const info = (await ok('GET', `/v1/apps/${appId}/appInfos`)).data.find((item: Json) => item.attributes.state !== 'READY_FOR_DISTRIBUTION')
const step = (label: string) => console.log(`✓ ${label}`)

// Listing text and URLs.
const versionLocalization = (await ok('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data[0]
await ok('PATCH', `/v1/appStoreVersionLocalizations/${versionLocalization.id}`, {
  data: {
    type: 'appStoreVersionLocalizations',
    id: versionLocalization.id,
    attributes: {
      description: listing.description,
      keywords: listing.keywords,
      promotionalText: listing.promotionalText,
      supportUrl: listing.supportUrl,
      marketingUrl: listing.marketingUrl,
    },
  },
})
step('description, keywords, URLs')

const infoLocalization = (await ok('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`)).data[0]
await ok('PATCH', `/v1/appInfoLocalizations/${infoLocalization.id}`, {
  data: {
    type: 'appInfoLocalizations',
    id: infoLocalization.id,
    attributes: { name: listing.name, subtitle: listing.subtitle, privacyPolicyUrl: listing.privacyPolicyUrl },
  },
})
step('name, subtitle, privacy policy URL')

await ok('PATCH', `/v1/appStoreVersions/${version.id}`, {
  data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: listing.copyright, releaseType: 'AFTER_APPROVAL' } },
})
step('copyright')

await ok('PATCH', `/v1/appInfos/${info.id}`, {
  data: {
    type: 'appInfos',
    id: info.id,
    relationships: {
      // Business: where event check-in apps compete, instead of the crowded Utilities QR scanner chart.
      primaryCategory: { data: { type: 'appCategories', id: 'BUSINESS' } },
      secondaryCategory: { data: { type: 'appCategories', id: 'UTILITIES' } },
    },
  },
})
step('category Business / Utilities')

await ok('PATCH', `/v1/apps/${appId}`, {
  data: { type: 'apps', id: appId, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } },
})
step('content rights')

// Age rating: a utility with no objectionable content and no open web or messaging.
const ageRating = (await ok('GET', `/v1/appInfos/${info.id}/ageRatingDeclaration`)).data
const none = 'NONE'
await ok('PATCH', `/v1/ageRatingDeclarations/${ageRating.id}`, {
  data: {
    type: 'ageRatingDeclarations',
    id: ageRating.id,
    attributes: {
      advertising: false,
      alcoholTobaccoOrDrugUseOrReferences: none,
      contests: none,
      gambling: false,
      gamblingSimulated: none,
      gunsOrOtherWeapons: none,
      healthOrWellnessTopics: false,
      lootBox: false,
      medicalOrTreatmentInformation: none,
      messagingAndChat: false,
      parentalControls: false,
      profanityOrCrudeHumor: none,
      ageAssurance: false,
      sexualContentGraphicAndNudity: none,
      sexualContentOrNudity: none,
      socialMedia: false,
      horrorOrFearThemes: none,
      matureOrSuggestiveThemes: none,
      unrestrictedWebAccess: false,
      userGeneratedContent: false,
      violenceCartoonOrFantasy: none,
      violenceRealisticProlongedGraphicOrSadistic: none,
      violenceRealistic: none,
    },
  },
})
step('age rating')

// Free in every territory.
const existingSchedule = await api('GET', `/v1/apps/${appId}/appPriceSchedule?include=manualPrices`)
if (!existingSchedule.data?.included?.length) {
  const freePoint = (await ok('GET', `/v1/apps/${appId}/appPricePoints?filter[territory]=USA&limit=200`)).data.find(
    (point: Json) => Number(point.attributes.customerPrice) === 0,
  )
  await ok('POST', '/v1/appPriceSchedules', {
    data: {
      type: 'appPriceSchedules',
      relationships: {
        app: { data: { type: 'apps', id: appId } },
        baseTerritory: { data: { type: 'territories', id: 'USA' } },
        manualPrices: { data: [{ type: 'appPrices', id: '${free}' }] },
      },
    },
    included: [
      {
        type: 'appPrices',
        id: '${free}',
        attributes: { startDate: null },
        relationships: { appPricePoint: { data: { type: 'appPricePoints', id: freePoint.id } } },
      },
    ],
  })
}
step('price: free')

const availability = await api('GET', `/v1/apps/${appId}/appAvailabilityV2`)
if (availability.status >= 300 || !availability.data?.data) {
  const territories: Json[] = (await ok('GET', '/v1/territories?limit=200')).data
  await ok('POST', '/v2/appAvailabilities', {
    data: {
      type: 'appAvailabilities',
      attributes: { availableInNewTerritories: true },
      relationships: {
        app: { data: { type: 'apps', id: appId } },
        territoryAvailabilities: { data: territories.map((_, index) => ({ type: 'territoryAvailabilities', id: `\${t${index}}` })) },
      },
    },
    included: territories.map((territory, index) => ({
      type: 'territoryAvailabilities',
      id: `\${t${index}}`,
      attributes: { available: true },
      relationships: { territory: { data: { type: 'territories', id: territory.id } } },
    })),
  })
}
step('availability: all territories')

// Review contact: reuse the team's contact from its newest other app.
const reviewDetail = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`)
const contact = await teamReviewContact()
const reviewAttributes = { ...contact, demoAccountRequired: false, demoAccountName: null, demoAccountPassword: null, notes: reviewNotes }
if (reviewDetail.data?.data) {
  await ok('PATCH', `/v1/appStoreReviewDetails/${reviewDetail.data.data.id}`, {
    data: { type: 'appStoreReviewDetails', id: reviewDetail.data.data.id, attributes: reviewAttributes },
  })
} else {
  await ok('POST', '/v1/appStoreReviewDetails', {
    data: {
      type: 'appStoreReviewDetails',
      attributes: reviewAttributes,
      relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
    },
  })
}
step('review contact and notes')

const builds: Json[] = (await ok('GET', `/v1/builds?filter[app]=${appId}&filter[processingState]=VALID&sort=-uploadedDate&limit=10`)).data
const build = process.env.BUILD ? builds.find((item) => item.attributes.version === process.env.BUILD) : builds[0]
if (!build) throw new Error('No valid build')
await ok('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, { data: { type: 'builds', id: build.id } })
step(`build ${build.attributes.version}`)

async function teamReviewContact() {
  const apps: Json[] = (await ok('GET', '/v1/apps?limit=50')).data
  for (const other of apps.filter((item) => item.id !== appId)) {
    const versions: Json[] = (await ok('GET', `/v1/apps/${other.id}/appStoreVersions?limit=1`)).data
    if (!versions[0]) continue
    const detail = await api('GET', `/v1/appStoreVersions/${versions[0].id}/appStoreReviewDetail`)
    const attributes = detail.data?.data?.attributes
    if (attributes?.contactPhone && attributes?.contactEmail) {
      return {
        contactFirstName: attributes.contactFirstName,
        contactLastName: attributes.contactLastName,
        contactEmail: attributes.contactEmail,
        contactPhone: attributes.contactPhone,
      }
    }
  }
  throw new Error('No review contact found on the team')
}
