# Simple Festival

Local-first festival scanner for entrance, day pass, food, drink, and custom scan modes.

The app imports a festival database from CSV, XLSX, or a public Google Sheet CSV export, infers the scanner schema, and stores scan state locally on each device. Optional device sync lets another device join by scanning an invite QR when network is available.

## Workspace

- Mobile app: Vue 3, Ionic, Capacitor, Capgo.
- Website: Astro, deployed with Cloudflare Pages.
- Sync backend: Cloudflare Worker plus Durable Object rooms.

## What It Does

- Imports CSV, XLS, XLSX, or a public Google Sheet URL.
- Uses optional OpenAI-assisted parsing to detect ticket code, identity, payment, entrance, day, food, drink, quota, and consumed columns.
- Falls back to deterministic French and English column-name heuristics when no API key is configured.
- Builds the home screen dynamically from detected scan modes.
- Keeps scan events local-first and exports an enriched CSV that writes local scans back into mapped consumed columns.
- Hosts a temporary device sync session. The invite QR lets another device join and receive the current DB plus live scan events.

## Commands

Use Bun in this repository.

```bash
bun install
bun run dev
bun run test
bun run lint
bun run build
bun run website:build
```

Native sync after web or plugin changes:

```bash
bunx cap sync
```

## Recommended Sheet Columns

| Column | Purpose |
| --- | --- |
| `Ticket ID` | Stable row id. |
| `QR Code` | Exact text encoded in the attendee QR code. |
| `Name` | Display name after a scan. |
| `Email` | Optional identity/contact column. |
| `Paid` | Payment marker. `yes`, dates, amounts, or payment ids count as paid. |
| `Entrance scanned at` | Existing entrance consumption timestamp, optional. |
| `Friday day pass` | Day entitlement. |
| `Friday day scanned at` | Existing day consumption timestamp, optional. |
| `Friday dinner` | Food entitlement. |
| `Friday dinner scanned at` | Existing food consumption timestamp, optional. |
| `Drink tokens` | Numeric drink quota. |
| `Drink scanned at` | Existing drink consumption timestamp, optional. |

The app also recognizes labels such as `Entree`, `Arrive`, `Date paiement`, `Dejeuner`, `Diner`, `Petit-dej`, `Boisson`, `Samedi`, and `Dimanche`.

## Sync Backend

Sync is intentionally almost backend-free. The Cloudflare Worker only coordinates live WebSocket rooms; it does not persist the festival DB.

Backend files:

- `worker/src/index.ts` contains the Worker and `SyncRoom` Durable Object.
- `wrangler.jsonc` contains the Worker name, Durable Object binding, migration, and observability config.

Local Worker dev:

```bash
bun run worker:dev
```

Deploy Worker:

```bash
bun run worker:deploy
```

The default production sync backend is `https://simple-festival-sync.digitalshift-ee.workers.dev`. Set `VITE_SYNC_BACKEND_URL` to override it for another Worker origin. Local web dev defaults to `http://127.0.0.1:8787`.

## Capgo CI

The `Capgo` workflow verifies the project, asks Capgo whether the change is OTA-safe or native with `bundle releaseType`, uploads mobile web bundles for OTA-safe changes, and requests native cloud builds when dependencies or native files require them.

Required GitHub Actions secrets:

- `CAPGO_TOKEN` for OTA bundle upload and native build requests.
- Android native build: `ANDROID_KEYSTORE_FILE`, `KEYSTORE_KEY_ALIAS`, `KEYSTORE_KEY_PASSWORD`, `KEYSTORE_STORE_PASSWORD`.
- iOS native build: `BUILD_CERTIFICATE_BASE64`, `CAPGO_IOS_PROVISIONING_MAP`, `P12_PASSWORD`, `APP_STORE_CONNECT_TEAM_ID`.
- Optional iOS App Store Connect values: `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_CONTENT`.
