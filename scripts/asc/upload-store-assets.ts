// Uploads screenshots and creative assets to the editable App Store version through the
// App Store Connect Asset Library API. Existing placements in the same groups are replaced.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, optional BUNDLE_ID, LOCALE, DRY_RUN=1.
// Usage: bun scripts/asc/upload-store-assets.ts
import { createHash } from 'node:crypto'
import { ok, type Json } from './client'

const bundleId = process.env.BUNDLE_ID ?? 'ee.forgr.festivalscan'
const locale = process.env.LOCALE ?? 'en-US'
const dryRun = process.env.DRY_RUN === '1'
const shots = 'store/screenshots'

type Placement = { type: 'APP_SCREENSHOT' | 'PRODUCT_PAGE_HEADER_ASSET' | 'APP_STORE_SEARCH_RESULTS_ASSET'; group: string; files: string[] }

const scenes = ['01-import', '02-dynamic-home', '03-scan-result', '04-camera-scan', '05-device-sync']
const plan: Placement[] = [
  { type: 'APP_SCREENSHOT', group: 'IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE', files: scenes.map((s) => `${shots}/ios-6.9/${s}.png`) },
  { type: 'APP_SCREENSHOT', group: 'IPHONE_FACE_ID_LARGE_PROFILE', files: scenes.map((s) => `${shots}/ios-6.5/${s}.png`) },
  // One iPhone Duo group accepts both displays (max 10): inner first, then outer.
  {
    type: 'APP_SCREENSHOT',
    group: 'IPHONE_DUO_PROFILE',
    files: [
      ...['02-dynamic-home', '03-scan-result', '04-camera-scan'].map((s) => `${shots}/iphone-duo-inner-landscape/${s}.png`),
      ...['01-import', '03-scan-result'].map((s) => `${shots}/iphone-duo-inner-portrait/${s}.png`),
      ...['01-import', '03-scan-result', '04-camera-scan', '05-device-sync'].map((s) => `${shots}/iphone-duo-outer-portrait/${s}.png`),
      `${shots}/iphone-duo-outer-landscape/03-scan-result.png`,
    ],
  },
  { type: 'PRODUCT_PAGE_HEADER_ASSET', group: 'DEFAULT_PROFILE', files: ['store/creative/product-page-header-21x9.png'] },
  { type: 'APP_STORE_SEARCH_RESULTS_ASSET', group: 'DEFAULT_PROFILE', files: ['store/creative/search-results-3x2.png'] },
]

const app = (await ok('GET', `/v1/apps?filter[bundleId]=${bundleId}`)).data[0]
if (!app) throw new Error(`No App Store Connect app for ${bundleId}. Create it in App Store Connect first.`)
const library = (await ok('GET', `/v1/apps/${app.id}/assetLibrary`)).data
const versions = (await ok('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=20`)).data
const version = versions.find((item: Json) =>
  ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(item.attributes.appVersionState ?? item.attributes.appStoreState),
)
if (!version) throw new Error('No editable iOS App Store version')
const localization = (await ok('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data.find(
  (item: Json) => item.attributes.locale === locale,
)
if (!localization) throw new Error(`No ${locale} localization on version ${version.attributes.versionString}`)
console.log(`${app.attributes.name} ${version.attributes.versionString} (${locale}), library ${library.id}`)

const existing = (await ok('GET', `/v1/appStoreVersionLocalizations/${localization.id}/placements?limit=200`)).data

for (const placement of plan) {
  const stale = existing.filter((item: Json) => item.attributes.placementType === placement.type && item.attributes.placementGroup === placement.group)
  console.log(`${placement.type} ${placement.group}: replace ${stale.length} with ${placement.files.length}`)
  if (dryRun) continue

  for (const item of stale) {
    await ok('DELETE', `/v1/appAssetLibraryPlacements/${item.id}`)
  }

  const created: string[] = []
  for (const file of placement.files) {
    const imageId = await uploadImage(file, placement.type === 'APP_SCREENSHOT' ? 'APP_SCREENSHOTS_AND_PREVIEWS' : 'CREATIVE_ASSETS')
    const result = await ok('POST', '/v1/appAssetLibraryPlacements', {
      data: {
        type: 'appAssetLibraryPlacements',
        attributes: { placementType: placement.type, placementGroup: placement.group },
        relationships: {
          image: { data: { type: 'appAssetLibraryImages', id: imageId } },
          appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: localization.id } },
        },
      },
    })
    created.push(result.data.id)
    console.log(`  placed ${file.split('/').slice(-2).join('/')}`)
  }

  if (created.length > 1) {
    await ok('POST', '/v1/appAssetLibraryPlacementOrderingRequests', {
      data: {
        type: 'appAssetLibraryPlacementOrderingRequests',
        attributes: { placementGroup: placement.group },
        relationships: {
          orderedPlacements: { data: created.map((id) => ({ type: 'appAssetLibraryPlacements', id })) },
          appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: localization.id } },
        },
      },
    })
  }
}

async function uploadImage(file: string, category: 'APP_SCREENSHOTS_AND_PREVIEWS' | 'CREATIVE_ASSETS') {
  const bytes = new Uint8Array(await Bun.file(file).arrayBuffer())
  const fileName = file.split('/').slice(-2).join('-')
  // Reference names are unique per library, so key them by content and reuse unchanged images.
  const referenceName = `simple-fest/${fileName}#${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}`
  const existing: Json[] = (
    await ok('GET', `/v1/appAssetLibraries/${library.id}/images?filter[referenceName]=${encodeURIComponent(referenceName)}&limit=1`)
  ).data
  if (existing[0] && existing[0].attributes.state !== 'ARCHIVED') {
    return existing[0].id as string
  }
  const reserved = await ok('POST', '/v1/appAssetLibraryImages', {
    data: {
      type: 'appAssetLibraryImages',
      attributes: { category, fileName, fileSize: bytes.length, referenceName },
      relationships: { assetLibrary: { data: { type: 'appAssetLibraries', id: library.id } } },
    },
  })
  const image = reserved.data
  for (const operation of image.attributes.uploadOperations ?? []) {
    const headers = Object.fromEntries((operation.requestHeaders ?? []).map((header: Json) => [header.name, header.value]))
    const response = await fetch(operation.url, {
      method: operation.method,
      headers,
      body: bytes.slice(operation.offset, operation.offset + operation.length),
    })
    if (!response.ok) throw new Error(`Upload ${fileName} failed: ${response.status}`)
  }
  await ok('PATCH', `/v1/appAssetLibraryImages/${image.id}`, {
    data: {
      type: 'appAssetLibraryImages',
      id: image.id,
      attributes: { uploaded: true },
    },
  })
  return image.id as string
}

