// Attach a demo video to App Review Information of the editable App Store version.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, optional BUNDLE_ID. Usage: bun scripts/asc/attach-review-video.ts [file]
import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import { ok, type Json } from './client'

const bundleId = process.env.BUNDLE_ID ?? 'ee.forgr.festivalscan'
const filePath = process.argv[2] ?? 'website/public/video/demo.mp4'
const fileName = `simple-fest-${basename(filePath)}`
const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer())

const appId = (await ok('GET', `/v1/apps?filter[bundleId]=${bundleId}`)).data[0].id
const version = (await ok('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&filter[appStoreState]=PREPARE_FOR_SUBMISSION,DEVELOPER_REJECTED,REJECTED,METADATA_REJECTED`)).data[0]
if (!version) throw new Error('No editable App Store version')
const detailId = (await ok('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`)).data.id

const existing: Json[] = (await ok('GET', `/v1/appStoreReviewDetails/${detailId}/appStoreReviewAttachments`)).data
for (const attachment of existing.filter((item) => item.attributes.fileName === fileName)) {
  await ok('DELETE', `/v1/appStoreReviewAttachments/${attachment.id}`)
}

const reservation = (await ok('POST', '/v1/appStoreReviewAttachments', {
  data: {
    type: 'appStoreReviewAttachments',
    attributes: { fileName, fileSize: bytes.length },
    relationships: { appStoreReviewDetail: { data: { type: 'appStoreReviewDetails', id: detailId } } },
  },
})).data

for (const operation of reservation.attributes.uploadOperations as Json[]) {
  const response = await fetch(operation.url, {
    method: operation.method,
    headers: Object.fromEntries(operation.requestHeaders.map((header: Json) => [header.name, header.value])),
    body: bytes.slice(operation.offset, operation.offset + operation.length),
  })
  if (!response.ok) throw new Error(`Upload part failed: ${response.status}`)
}

await ok('PATCH', `/v1/appStoreReviewAttachments/${reservation.id}`, {
  data: {
    type: 'appStoreReviewAttachments',
    id: reservation.id,
    attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') },
  },
})

await Bun.sleep(3000)
const state = (await ok('GET', `/v1/appStoreReviewAttachments/${reservation.id}`)).data.attributes.assetDeliveryState
console.log(`Version ${version.attributes.versionString}: ${fileName} ${state?.state ?? 'unknown'}`)
