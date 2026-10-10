// Waits for the latest build upload to finish processing and prints Apple's errors, if any.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, optional BUNDLE_ID. Usage: bun scripts/asc/build-status.ts
import { ok, type Json } from './client'

const bundleId = process.env.BUNDLE_ID ?? 'ee.forgr.festivalscan'
const app = (await ok('GET', `/v1/apps?filter[bundleId]=${bundleId}`)).data[0]
for (;;) {
  const upload: Json = (await ok('GET', `/v1/apps/${app.id}/buildUploads?limit=1&sort=-uploadedDate`)).data[0]
  const state = upload?.attributes.state
  if (!upload || !['COMPLETE', 'FAILED'].includes(state.state)) {
    await Bun.sleep(30_000)
    continue
  }
  console.log(`${upload.attributes.cfBundleShortVersionString} (${upload.attributes.cfBundleVersion}): ${state.state}`)
  for (const item of [...state.errors, ...state.warnings]) console.log(`- ${item.code}: ${item.description}`)
  process.exit(state.state === 'COMPLETE' ? 0 : 1)
}
