// Minimal App Store Connect API client. Env: ASC_KEY_ID, ASC_ISSUER_ID, optional ASC_KEY_PATH.
// CLI: bun scripts/asc/client.ts METHOD PATH [jsonBody]
const keyId = required('ASC_KEY_ID')
const issuer = required('ASC_ISSUER_ID')
const keyPath = process.env.ASC_KEY_PATH ?? `${process.env.HOME}/.appstoreconnect/private_keys/AuthKey_${keyId}.p8`
const pem = await Bun.file(keyPath).text()
const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0))
const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
const b64u = (value: Uint8Array | string) => Buffer.from(value).toString('base64url')

async function token() {
  const now = Math.floor(Date.now() / 1000)
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }))
  const body = b64u(JSON.stringify({ iss: issuer, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' }))
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${body}`)))
  return `${head}.${body}.${b64u(signature)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- App Store Connect responses are untyped JSON
export type Json = any
export type ApiResult = { status: number; data: Json }

export async function api(method: string, path: string, json?: unknown): Promise<ApiResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
        method,
        headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
        body: json ? JSON.stringify(json) : undefined,
      })
      const text = await response.text()
      return { status: response.status, data: text ? JSON.parse(text) : null }
    } catch (error) {
      if (attempt >= 5) throw error
      await Bun.sleep(1500)
    }
  }
}

export async function ok(method: string, path: string, json?: unknown) {
  const result = await api(method, path, json)
  if (result.status >= 300) {
    throw new Error(`${method} ${path} -> ${result.status} ${JSON.stringify(result.data?.errors ?? result.data)}`)
  }
  return result.data
}

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

if (import.meta.main) {
  const [method, path, json] = process.argv.slice(2)
  const result = await api(method, path, json ? JSON.parse(json) : undefined)
  console.log(result.status, JSON.stringify(result.data, null, 1))
}
