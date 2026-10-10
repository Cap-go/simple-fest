// Adds testers to the app's internal TestFlight group (created if missing). Internal testers must be
// App Store Connect users of the team, so no beta review is needed.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, optional BUNDLE_ID. Usage: bun scripts/asc/testflight-invite.ts email [email...]
import { api, ok, type Json } from './client'

const bundleId = process.env.BUNDLE_ID ?? 'ee.forgr.festivalscan'
const emails = process.argv.slice(2)
if (!emails.length) throw new Error('Pass at least one email')

const app = (await ok('GET', `/v1/apps?filter[bundleId]=${bundleId}`)).data[0]
const groups: Json[] = (await ok('GET', `/v1/apps/${app.id}/betaGroups?limit=50`)).data
let group = groups.find((item) => item.attributes.isInternalGroup)
if (!group) {
  group = (
    await ok('POST', '/v1/betaGroups', {
      data: {
        type: 'betaGroups',
        attributes: { name: 'Internal Testers', isInternalGroup: true, hasAccessToAllBuilds: true },
        relationships: { app: { data: { type: 'apps', id: app.id } } },
      },
    })
  ).data
}
console.log(`group ${group.attributes.name} (${group.id})`)

for (const email of emails) {
  const created = await api('POST', '/v1/betaTesters', {
    data: {
      type: 'betaTesters',
      attributes: { email },
      relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } },
    },
  })
  if (created.status < 300) {
    console.log(`invited ${email}`)
    continue
  }
  // Already a tester elsewhere: link the existing tester record to this group.
  const existing: Json[] = (await ok('GET', `/v1/betaTesters?filter[email]=${encodeURIComponent(email)}&limit=50`)).data
  if (!existing.length) throw new Error(`${email}: ${JSON.stringify(created.data?.errors)}`)
  const linked = await api('POST', `/v1/betaGroups/${group.id}/relationships/betaTesters`, {
    data: existing.slice(0, 1).map((tester) => ({ type: 'betaTesters', id: tester.id })),
  })
  console.log(linked.status < 300 ? `added ${email}` : `${email}: ${JSON.stringify(linked.data?.errors)}`)
}
