// Sign in with ChatGPT: PKCE + loopback redirect, tokens in Keychain/Keystore. Ported from
// Cap-go/capgo-browser (src/auth/oauth.ts). Requests then run on the user's ChatGPT plan.
import { Capacitor, CapacitorHttp, type PluginListenerHandle } from '@capacitor/core'
import { InAppBrowser, ToolBarType } from '@capgo/capacitor-inappbrowser'
import { OAuthLoopback } from '@capgo/oauth-loopback'
import {
  AGENT_NAME_HINT,
  OAUTH_AUTHORIZE_URL,
  OAUTH_CALLBACK_PATH,
  OAUTH_DYNAMIC_CLIENT_ID,
  OAUTH_RESOURCE,
  OAUTH_SCOPES,
  OAUTH_TOKEN_URL,
  MODELS_API_URL,
  RESPONSES_API_URL,
  RESPONSES_MODEL,
  SECURE_STORAGE_KEYS,
} from './config'
import { authRequest } from './http'
import { verifyIdToken } from './idToken'
import { createOAuthNonce, createOAuthState, createPkcePair, randomString } from './pkce'
import { secureGet, secureRemove, secureSet } from './secureStorage'
import type { OAuthCallbackParams, OAuthCredentialRecord, PendingOAuthAttempt, TokenResponse } from './types'

type Attempt = PendingOAuthAttempt & { codeChallenge: string; loopbackSessionId: string }

export type ChatGptAccount = { email: string }

const activeKey = `${SECURE_STORAGE_KEYS.credentialsPrefix}active`
const credentialsKey = (clientId: string) => `${SECURE_STORAGE_KEYS.credentialsPrefix}${clientId}`

// Loopback servers only exist in the native apps.
export const chatGptAvailable = Capacitor.isNativePlatform()

export async function currentChatGptAccount(): Promise<ChatGptAccount | null> {
  const record = await loadCredentials()
  return record ? { email: record.email } : null
}

export async function connectChatGpt(): Promise<ChatGptAccount> {
  const savedClientId = await secureGet(activeKey)
  const attempt = await beginAttempt(savedClientId)
  try {
    const callback = await authorizeInBrowser(attempt, buildAuthorizeUrl(attempt))
    const { code, issuedClientId } = validateCallback(attempt, callback)
    const token = await exchangeCode(attempt, code, issuedClientId)
    const record = await credentialFromToken(token, { clientId: issuedClientId, extAgentHostId: attempt.extAgentHostId, nonce: attempt.nonce })
    await saveCredentials(record)
    return { email: record.email }
  } finally {
    await OAuthLoopback.stop({ sessionId: attempt.loopbackSessionId }).catch(() => undefined)
  }
}

export async function disconnectChatGpt() {
  const clientId = await secureGet(activeKey)
  if (clientId) {
    // Keep the issued client id so reconnecting skips registration; drop only the tokens.
    await secureRemove(credentialsKey(clientId))
  }
}

// Sends one prompt and returns the model's text. Streaming and store:false are required for plan usage.
export async function askChatGpt(instructions: string, input: string): Promise<string> {
  const accessToken = await validAccessToken()
  const body = JSON.stringify({ model: await resolveModel(accessToken), instructions, input, stream: true, store: false })
  // Native HTTP: the WebView turns API admission errors (no CORS headers) into opaque failures.
  const response = await apiRequest(RESPONSES_API_URL, 'POST', accessToken, body)
  if (response.status < 200 || response.status >= 300) {
    throw new Error(apiError(response.status, response.text))
  }
  const stream = new Response(response.text).body
  if (!stream) throw new Error('ChatGPT returned no text')
  return readStreamText(stream)
}

let cachedModel: { token: string; slug: string } | null = null

// ChatGPT plans expose different models: use the preferred one when listed, else the first listed.
async function resolveModel(accessToken: string) {
  if (cachedModel?.token === accessToken) return cachedModel.slug
  let slug = RESPONSES_MODEL
  try {
    const response = await apiRequest(MODELS_API_URL, 'GET', accessToken)
    if (response.status === 200) {
      const listed = ((JSON.parse(response.text) as { models?: { slug?: string; visibility?: string }[] }).models ?? []).filter(
        (model) => model.slug && model.visibility === 'list',
      )
      slug = (listed.find((model) => model.slug === RESPONSES_MODEL) ?? listed[0])?.slug ?? slug
    }
  } catch {
    // Keep the default model.
  }
  cachedModel = { token: accessToken, slug }
  return slug
}

async function apiRequest(url: string, method: 'GET' | 'POST', accessToken: string, body?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
  if (body) headers['Content-Type'] = 'application/json'
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url,
      method,
      headers,
      data: body ? JSON.parse(body) : undefined,
      responseType: 'text',
      readTimeout: 180_000,
      connectTimeout: 30_000,
    })
    return { status: response.status, text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '') }
  }
  const response = await fetch(url, { method, headers, body })
  return { status: response.status, text: await response.text() }
}

async function validAccessToken() {
  let record = await loadCredentials()
  if (!record) {
    throw new Error('Connect ChatGPT in the Event tab first.')
  }
  if (record.expiresAtMs - Date.now() < 60_000) {
    record = await refresh(record)
  }
  return record.accessToken
}

async function readStreamText(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const payload = line.trim().startsWith('data:') ? line.trim().slice(5).trim() : ''
      if (!payload || payload === '[DONE]') continue
      let event: { type?: string; delta?: string; response?: { error?: { message?: string } } }
      try {
        event = JSON.parse(payload)
      } catch {
        continue
      }
      if (event.type === 'response.output_text.delta') text += event.delta ?? ''
      if (event.type === 'response.failed') throw new Error(apiError(0, event.response?.error?.message ?? 'ChatGPT request failed'))
      if (event.type === 'response.completed') return text
    }
  }
  if (!text) throw new Error('ChatGPT returned no text')
  return text
}

function apiError(status: number, body: string) {
  if (body.includes('subscription_sharing_usage_limit_exceeded')) return 'Your ChatGPT plan limit for this app is reached. Try again later.'
  if (body.includes('subscription_sharing_user_not_eligible')) return 'ChatGPT Plus or Pro is required for AI column detection.'
  if (status === 401 || body.includes('subscription_sharing_invalid_user')) return 'ChatGPT was disconnected. Connect it again in the Event tab.'
  return `ChatGPT request failed${status ? ` (${status})` : ''}`
}

async function beginAttempt(savedClientId: string | null): Promise<Attempt> {
  const { verifier, challenge } = await createPkcePair()
  const loopback = await OAuthLoopback.start({ path: OAUTH_CALLBACK_PATH })
  return {
    state: createOAuthState(),
    nonce: createOAuthNonce(),
    codeVerifier: verifier,
    codeChallenge: challenge,
    redirectUri: loopback.redirectUri,
    clientId: savedClientId ?? OAUTH_DYNAMIC_CLIENT_ID,
    extAgentHostId: await hostId(),
    isRegistration: !savedClientId,
    loopbackSessionId: loopback.sessionId,
  }
}

function buildAuthorizeUrl(attempt: Attempt) {
  const params = new URLSearchParams({
    client_id: attempt.clientId,
    response_type: 'code',
    redirect_uri: attempt.redirectUri,
    scope: OAUTH_SCOPES,
    resource: OAUTH_RESOURCE,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge_method: 'S256',
    code_challenge: attempt.codeChallenge,
    ext_agent_host_id: attempt.extAgentHostId,
  })
  if (attempt.isRegistration) params.set('agent_name_hint', AGENT_NAME_HINT)
  return `${OAUTH_AUTHORIZE_URL}?${params}`
}

// Mobile Safari user agent so identity providers (Google) accept the embedded login.
const safariUserAgent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

// OpenAI only accepts an http://127.0.0.1 redirect, which Safari flags as insecure. The login runs in an
// in-app web view where 127.0.0.1 is a blocked host: the redirect is cancelled before it loads and the code
// is read from its URL, so no http page is ever shown.
async function authorizeInBrowser(attempt: Attempt, authorizeUrl: string): Promise<OAuthCallbackParams> {
  const handles: PluginListenerHandle[] = []
  let webViewId: string | undefined
  let settled = false
  const result = new Promise<OAuthCallbackParams>((resolve, reject) => {
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    void InAppBrowser.addListener('urlChangeEvent', (event) => {
      if (webViewId && event.id && event.id !== webViewId) return
      if (!event.url.startsWith(attempt.redirectUri)) return
      finish(() => resolve(parseRedirect(event.url)))
    }).then((handle) => handles.push(handle))
    void InAppBrowser.addListener('closeEvent', (event) => {
      if (webViewId && event.id && event.id !== webViewId) return
      finish(() => reject(new Error('Sign in was cancelled')))
    }).then((handle) => handles.push(handle))
  })

  try {
    const opened = await InAppBrowser.openWebView({
      url: authorizeUrl,
      title: 'Sign in with ChatGPT',
      toolbarType: ToolBarType.COMPACT,
      blockedHosts: ['127.0.0.1'],
      customUserAgent: safariUserAgent,
      enabledSafeBottomMargin: true,
      enabledSafeTopMargin: true,
    })
    webViewId = opened.id
    return await result
  } finally {
    settled = true
    await Promise.all(handles.map((handle) => handle.remove()))
    await InAppBrowser.close(webViewId ? { id: webViewId } : undefined).catch(() => undefined)
  }
}

function parseRedirect(url: string): OAuthCallbackParams {
  const query = new URL(url).searchParams
  return {
    code: query.get('code') ?? undefined,
    state: query.get('state') ?? undefined,
    clientId: query.get('client_id') ?? undefined,
    error: query.get('error') ?? undefined,
    errorDescription: query.get('error_description') ?? undefined,
  }
}

function validateCallback(attempt: Attempt, params: OAuthCallbackParams) {
  if (params.error) throw new Error(params.errorDescription ?? params.error)
  if (!params.state || params.state !== attempt.state) throw new Error('Sign in was interrupted. Try again.')
  if (!params.code) throw new Error('Sign in did not complete. Try again.')
  let issuedClientId = attempt.clientId
  if (attempt.isRegistration) {
    if (!params.clientId || params.clientId === OAUTH_DYNAMIC_CLIENT_ID) throw new Error('ChatGPT did not register Simple Fest. Try again.')
    issuedClientId = params.clientId
  } else if (params.clientId && params.clientId !== attempt.clientId) {
    throw new Error('Unexpected client id from ChatGPT')
  }
  return { code: params.code, issuedClientId }
}

async function exchangeCode(attempt: Attempt, code: string, clientId: string) {
  return tokenRequest({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: attempt.codeVerifier,
    redirect_uri: attempt.redirectUri,
    resource: OAUTH_RESOURCE,
  })
}

async function refresh(record: OAuthCredentialRecord) {
  let token: TokenResponse
  try {
    token = await tokenRequest({ grant_type: 'refresh_token', client_id: record.clientId, refresh_token: record.refreshToken, resource: OAUTH_RESOURCE })
  } catch (error) {
    if (error instanceof Error && error.message.includes('invalid_grant')) {
      await disconnectChatGpt()
      throw new Error('ChatGPT was disconnected. Connect it again in the Event tab.', { cause: error })
    }
    throw error
  }
  const updated = await credentialFromToken(token, { clientId: record.clientId, extAgentHostId: record.extAgentHostId, nonce: '' })
  const merged = { ...updated, email: record.email || updated.email, subject: record.subject }
  await saveCredentials(merged)
  return merged
}

// Token and JWKS endpoints reject WebView requests (CORS, Cloudflare), so they go through native HTTP.
async function tokenRequest(fields: Record<string, string>): Promise<TokenResponse> {
  const response = await authRequest(OAUTH_TOKEN_URL, { form: new URLSearchParams(fields) })
  if (!response.ok) throw new Error(`ChatGPT sign in failed (${response.status}): ${response.text.slice(0, 300)}`)
  return JSON.parse(response.text) as TokenResponse
}

async function credentialFromToken(token: TokenResponse, meta: { clientId: string; extAgentHostId: string; nonce: string }): Promise<OAuthCredentialRecord> {
  const scopes = (token.scope ?? '').split(/\s+/).filter(Boolean)
  if (!scopes.includes('chatgpt.tokens.use.direct')) throw new Error('ChatGPT plan usage was not granted')
  const claims = await verifyIdToken(token.id_token, { clientId: meta.clientId, nonce: meta.nonce || undefined, allowUnverifiedIfJwksUnavailable: true })
  const now = Date.now()
  return {
    email: typeof claims.email === 'string' ? claims.email : '',
    issuer: typeof claims.iss === 'string' ? claims.iss : '',
    subject: typeof claims.sub === 'string' ? claims.sub : '',
    clientId: meta.clientId,
    extAgentHostId: meta.extAgentHostId,
    idToken: token.id_token,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? '',
    tokenType: token.token_type,
    expiresAtMs: now + token.expires_in * 1000,
    scopes,
    savedAtMs: now,
  }
}

async function saveCredentials(record: OAuthCredentialRecord) {
  await secureSet(credentialsKey(record.clientId), JSON.stringify(record))
  await secureSet(activeKey, record.clientId)
}

async function loadCredentials(): Promise<OAuthCredentialRecord | null> {
  const clientId = await secureGet(activeKey)
  const raw = clientId ? await secureGet(credentialsKey(clientId)) : null
  return raw ? (JSON.parse(raw) as OAuthCredentialRecord) : null
}

async function hostId() {
  const existing = await secureGet(SECURE_STORAGE_KEYS.hostId)
  if (existing) return existing
  const id = `urn:uuid:${crypto.randomUUID?.() ?? randomString(32)}`
  await secureSet(SECURE_STORAGE_KEYS.hostId, id)
  return id
}
