// Sign in with ChatGPT (open-source, self-serve flow): users run column detection on their own
// ChatGPT plan instead of pasting an API key. Mirrors Cap-go/capgo-browser.
export const AGENT_NAME_HINT = 'Simple Fest'

export const OAUTH_AUTHORIZE_URL = 'https://auth.openai.com/api/accounts/authorize'
export const OAUTH_TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token'
export const OAUTH_JWKS_URL = 'https://auth.openai.com/api/accounts/oauth/jwks'
export const OAUTH_ISSUER = 'https://auth.openai.com'

export const OAUTH_DYNAMIC_CLIENT_ID = 'dynamic_agent_client'
export const OAUTH_RESOURCE = 'https://api.openai.com/v1'
export const OAUTH_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'resource.invoke', 'chatgpt.tokens.use.direct'].join(' ')

// Loopback redirect path; the port may change per attempt.
export const OAUTH_CALLBACK_PATH = '/auth/callback'

export const RESPONSES_API_URL = 'https://api.openai.com/v1/responses'
export const RESPONSES_MODEL = 'gpt-6.1-sol'
export const MODELS_API_URL = 'https://api.openai.com/v1/models'

export const SECURE_STORAGE_KEYS = {
  hostId: 'simple_fest_ext_agent_host_id',
  credentialsPrefix: 'simple_fest_oauth_',
} as const
