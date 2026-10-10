// Prints placement and image processing states for the editable App Store version.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, optional BUNDLE_ID. Usage: bun scripts/asc/check-store-assets.ts
import { ok, type Json } from './client'

const bundleId = process.env.BUNDLE_ID ?? 'ee.forgr.festivalscan'
const app = (await ok('GET', `/v1/apps?filter[bundleId]=${bundleId}`)).data[0]
const version = (await ok('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS`)).data[0]
const localization = (await ok('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data[0]
const placements: Json[] = (await ok('GET', `/v1/appStoreVersionLocalizations/${localization.id}/placements?limit=200`)).data
const counts: Record<string, number> = {}
for (const placement of placements) {
  const key = `${placement.attributes.placementType} ${placement.attributes.placementGroup} ${placement.attributes.state}`
  counts[key] = (counts[key] ?? 0) + 1
  if (placement.attributes.stateDetails?.length) console.log(JSON.stringify(placement.attributes.stateDetails))
}
console.log(counts)
const images: Json[] = (await ok('GET', `/v1/appAssetLibraries/${app.id}/images?limit=50`)).data
const states: Record<string, number> = {}
for (const image of images) states[image.attributes.state] = (states[image.attributes.state] ?? 0) + 1
console.log('images', states)
