import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import type { Logger, Plugin, ResolvedConfig, ViteDevServer } from 'vite'

type SupportedPlatform = 'ios' | 'android'
type LogLevel = 'silent' | 'info' | 'debug'

interface ServerUrlContext {
  protocol: string
  host: string
  port: number
}

interface ViteCapacitorOptions {
  root?: string
  platforms?: SupportedPlatform[]
  iosConfigPath?: string
  androidConfigPath?: string
  additionalConfigPaths?: string[]
  cleartext?: boolean
  logLevel?: LogLevel
  urlOverride?: string | ((context: ServerUrlContext) => string)
  networkUrl?: boolean | { host?: string }
}

interface CapacitorConfig {
  server?: {
    url?: string
    cleartext?: boolean
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface PluginLogger {
  info(message: string): void
  debug(message: string): void
  warn(message: string, error?: unknown): void
}

const PLUGIN_NAME = '@capgo/vite-capacitor'
const DEFAULT_IOS_PATH = 'ios/App/App/capacitor.config.json'
const DEFAULT_ANDROID_PATH =
  'android/app/src/main/assets/capacitor.config.json'
const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGQUIT: 131,
} as const

// Local fallback for @capgo/vite-capacitor@0.1.1: the npm package is missing
// the dist entrypoints declared by package.json.
export default function viteCapacitor(
  options: ViteCapacitorOptions = {},
): Plugin {
  let viteConfig: ResolvedConfig
  let targetFiles: string[] = []
  let cleanupRegistered = false
  const originalContents = new Map<string, string>()

  return {
    name: PLUGIN_NAME,
    apply: 'serve',
    configResolved(config) {
      viteConfig = config
      const rootDir = resolveRoot(config.root, options.root)
      targetFiles = resolveTargetFiles(rootDir, options)
    },
    configureServer(server) {
      const log = createLogger(server.config.logger, options.logLevel ?? 'info')

      if (targetFiles.length === 0) {
        log.warn('No target files configured. Nothing to sync.')
        return
      }

      registerCleanup(log)
      server.httpServer?.once('close', () => restoreConfigs(log))

      waitForServer(server, options)
        .then((context) => writeConfigs(resolveServerUrl(context, options), log))
        .catch((error) => {
          log.warn('Unable to determine dev server URL.', error)
        })
    },
  }

  function writeConfigs(url: string, log: PluginLogger) {
    if (!url) {
      log.warn('Resolved server URL is empty; skipping sync.')
      return
    }

    for (const file of targetFiles) {
      if (!existsSync(file)) {
        log.debug(`Skipping missing file: ${shortPath(file)}`)
        continue
      }

      const currentContent = readFileSync(file, 'utf8')
      if (!originalContents.has(file)) {
        originalContents.set(file, currentContent)
      }

      const parsed = parseConfig(currentContent, shortPath(file), log)
      if (!parsed) {
        continue
      }

      parsed.server = parsed.server ?? {}
      parsed.server.url = url
      parsed.server.cleartext = options.cleartext ?? true

      const nextContent = `${JSON.stringify(parsed, null, 2)}\n`
      if (nextContent === currentContent) {
        log.debug(`No changes required: ${shortPath(file)}`)
        continue
      }

      writeFileSync(file, nextContent, 'utf8')
      log.info(`Updated ${shortPath(file)} with ${url}`)
    }
  }

  function restoreConfigs(log: PluginLogger) {
    for (const [file, originalContent] of Array.from(originalContents)) {
      try {
        writeFileSync(file, originalContent, 'utf8')
        originalContents.delete(file)
        log.info(`Restored ${shortPath(file)}.`)
      } catch (error) {
        log.warn('Failed while restoring Capacitor config file.', error)
      }
    }
  }

  function registerCleanup(log: PluginLogger) {
    if (cleanupRegistered) {
      return
    }
    cleanupRegistered = true

    for (const signal of Object.keys(
      SIGNAL_EXIT_CODES,
    ) as Array<keyof typeof SIGNAL_EXIT_CODES>) {
      process.prependOnceListener(signal, () => {
        restoreConfigs(log)
        if (process.listenerCount(signal) === 0) {
          process.exit(SIGNAL_EXIT_CODES[signal])
        }
      })
    }

    process.once('exit', () => restoreConfigs(log))
  }

  function shortPath(file: string): string {
    return path.relative(viteConfig.root, file) || path.basename(file)
  }
}

function waitForServer(
  server: ViteDevServer,
  options: ViteCapacitorOptions,
): Promise<ServerUrlContext> {
  return new Promise((resolve, reject) => {
    const httpServer = server.httpServer
    if (!httpServer) {
      reject(new Error('Vite HTTP server is not available.'))
      return
    }

    const onListening = () => {
      httpServer.off('error', onError)
      const address = httpServer.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Could not resolve server address.'))
        return
      }

      resolve({
        protocol: server.config.server.https ? 'https' : 'http',
        host: resolveReachableHost(
          pickHost(server.config.server.host),
          options.networkUrl,
        ),
        port: address.port,
      })
    }

    const onError = (error: Error) => {
      httpServer.off('listening', onListening)
      reject(error)
    }

    if (httpServer.listening) {
      onListening()
      return
    }

    httpServer.once('listening', onListening)
    httpServer.once('error', onError)
  })

  function resolveReachableHost(
    host: string,
    networkUrl: ViteCapacitorOptions['networkUrl'],
  ): string {
    if (!isWildcardHost(host)) {
      return host
    }

    if (!networkUrl) {
      return 'localhost'
    }

    return (
      getConfiguredNetworkHost(networkUrl) ??
      normalizeHost(process.env.CAP_SERVER_HOST) ??
      pickLocalIpv4() ??
      'localhost'
    )
  }
}

function resolveServerUrl(
  context: ServerUrlContext,
  options: ViteCapacitorOptions,
): string {
  if (typeof options.urlOverride === 'string') {
    return options.urlOverride
  }

  if (typeof options.urlOverride === 'function') {
    return options.urlOverride(context)
  }

  return `${context.protocol}://${context.host}:${context.port}`
}

function resolveRoot(base: string, override?: string): string {
  if (!override) {
    return base
  }

  return path.isAbsolute(override) ? override : path.resolve(base, override)
}

function resolveTargetFiles(
  base: string,
  options: ViteCapacitorOptions,
): string[] {
  const platforms = options.platforms?.length
    ? Array.from(new Set(options.platforms))
    : ['ios', 'android']
  const paths = new Set<string>()

  if (platforms.includes('ios')) {
    paths.add(options.iosConfigPath ?? DEFAULT_IOS_PATH)
  }

  if (platforms.includes('android')) {
    paths.add(options.androidConfigPath ?? DEFAULT_ANDROID_PATH)
  }

  for (const extraPath of options.additionalConfigPaths ?? []) {
    paths.add(extraPath)
  }

  return Array.from(paths).map((targetPath) =>
    path.isAbsolute(targetPath) ? targetPath : path.resolve(base, targetPath),
  )
}

function parseConfig(
  content: string,
  displayPath: string,
  log: PluginLogger,
): CapacitorConfig | null {
  if (!content.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object') {
      log.warn(`Config JSON must be an object: ${displayPath}`)
      return {}
    }

    return parsed as CapacitorConfig
  } catch (error) {
    log.warn(`File is not valid JSON: ${displayPath}`, error)
    return null
  }
}

function pickHost(hostOption: ResolvedConfig['server']['host']): string {
  if (hostOption === undefined || hostOption === false) {
    return 'localhost'
  }

  return hostOption === true ? '0.0.0.0' : hostOption
}

function isWildcardHost(host: string): boolean {
  return host === '0.0.0.0' || host === '::'
}

function getConfiguredNetworkHost(
  networkUrl: ViteCapacitorOptions['networkUrl'],
): string | undefined {
  if (!networkUrl || typeof networkUrl !== 'object') {
    return undefined
  }

  return normalizeHost(networkUrl.host)
}

function normalizeHost(host: string | undefined): string | undefined {
  const normalized = host?.trim()
  return normalized || undefined
}

function pickLocalIpv4(): string | undefined {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (
        entry.family === 'IPv4' &&
        !entry.internal &&
        entry.address !== '0.0.0.0' &&
        !entry.address.startsWith('169.254.')
      ) {
        return entry.address
      }
    }
  }

  return undefined
}

function createLogger(logger: Logger, level: LogLevel): PluginLogger {
  const allowInfo = level === 'info' || level === 'debug'
  const allowDebug = level === 'debug'
  const prefix = (message: string) => `${PLUGIN_NAME}: ${message}`

  return {
    info(message) {
      if (allowInfo) {
        logger.info(prefix(message))
      }
    },
    debug(message) {
      if (allowDebug) {
        logger.info(prefix(message))
      }
    },
    warn(message, error) {
      const details =
        error instanceof Error
          ? ` ${error.message}`
          : error
            ? ` ${String(error)}`
            : ''
      logger.warn(prefix(`${message}${details}`))
    },
  }
}
