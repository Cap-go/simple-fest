// Submits the editable iOS App Store version for App Review.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, optional BUNDLE_ID. Usage: bun scripts/asc/submit-review.ts
import { api, ok, type Json } from './client'

const bundleId = process.env.BUNDLE_ID ?? 'ee.forgr.festivalscan'
const app = (await ok('GET', `/v1/apps?filter[bundleId]=${bundleId}`)).data[0]
const version = (await ok('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[appStoreState]=PREPARE_FOR_SUBMISSION`)).data[0]
if (!version) throw new Error('No iOS version in PREPARE_FOR_SUBMISSION')

// Reuse an open draft submission so retries do not pile up.
const open: Json[] = (await ok('GET', `/v1/apps/${app.id}/reviewSubmissions?filter[platform]=IOS&filter[state]=READY_FOR_REVIEW`)).data
const submission =
  open[0] ??
  (
    await ok('POST', '/v1/reviewSubmissions', {
      data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: app.id } } } },
    })
  ).data

const added = await api('POST', '/v1/reviewSubmissionItems', {
  data: {
    type: 'reviewSubmissionItems',
    relationships: {
      reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } },
      appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
    },
  },
})
if (added.status >= 300 && !JSON.stringify(added.data).includes('already')) {
  throw new Error(`Cannot add version ${version.attributes.versionString}: ${JSON.stringify(added.data?.errors, null, 1)}`)
}

const submitted = await ok('PATCH', `/v1/reviewSubmissions/${submission.id}`, {
  data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } },
})
console.log(`${app.attributes.name} ${version.attributes.versionString}: ${submitted.data.attributes.state}`)
