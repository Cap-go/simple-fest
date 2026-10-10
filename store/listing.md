# Simple Festival Store Listing

## App Identity

- App name: Simple Festival
- SKU: `ee.forgr.festivalscan`
- Primary language: English (U.S.)
- Bundle ID / package name: `ee.forgr.festivalscan`
- Category: Utilities / Productivity
- Age rating posture: suitable for general audiences; the app scans tickets and imported attendee rows only.

## Short Descriptions

Apple subtitle:
Festival QR scanner for teams

Google Play short description:
Scan festival QR tickets from CSV or Sheets, offline-first with live sync.

## Promotional Text

Import a sheet, let AI map ticket columns, scan entrance, day, food, and drink QR codes, then sync live with other devices.

## Full Description

Simple Festival turns a spreadsheet into a local-first QR scanner for festival operations.

Import a CSV, XLSX, or public Google Sheet export, and the app detects the ticket code column plus scan modes such as entrance, day passes, meals, drinks, and custom checkpoints. Staff can scan QR codes with the camera, enter a code manually, see the latest validation result, and export an updated CSV after the event.

For multi-device teams, one device can host a festival session and show an invite QR. Other devices join to receive the current database plus live scan events while network is available. If network drops, each device keeps scanning locally and can export its own CSV.

Key features:

- Import CSV, XLSX, or public Google Sheet CSV data.
- AI-assisted schema mapping with deterministic fallback heuristics.
- Dynamic home screen based on detected scan modes.
- QR camera scanning and manual code validation.
- Entrance, day pass, food, drink, and custom scan workflows.
- Local-first scan state with CSV export.
- Optional device sync by invite QR.
- Example template included for reliable imports.

Simple Festival is built for temporary event teams that need a practical scanner without provisioning a full ticketing backend.

## Keywords

festival,ticket,qr,scanner,csv,sheet,check-in,food,drink,sync

## What's New

Initial generic festival scanner with spreadsheet import, AI mapping, local scanning, CSV export, and device sync rooms.

## Privacy And Data Safety Notes

- No account system is present in the current app.
- No advertising SDK or analytics SDK is present in the current app.
- Imported festival rows and scan events are stored locally on the device.
- Optional sync sends the current festival database and scan events through a temporary device sync room while connected.
- The sync service coordinates live messages and is not designed to persist festival databases.
- Camera permission is used only to scan festival QR codes and sync invite QR codes.

Suggested iOS camera usage text already configured:
Camera access is needed to scan festival and sync invite QR codes.

## Review Notes

The app can be reviewed without an account. Tap `Try with sample data` on the first screen, then type `TCK-1001` in the "Type ticket code or email" field and press the arrow to see an accepted scan. Typing it again shows "Already scanned"; `TCK-1003` shows "Not paid". `Scan Entrance` opens the camera scanner. The Devices tab hosts a sync room and shows an invite QR for a second device.

## Generated Store Assets

Native app assets:

- iOS app icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024x1024)
- iOS splash: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png` (2732x2732)
- Android adaptive and density icons: `android/app/src/main/res/mipmap-*`
- Android splash resources: `android/app/src/main/res/drawable*`

Store assets:

- Google Play icon: `store/assets/play-store-icon.png` (512x512)
- Google Play feature graphic: `store/assets/play-store-feature-graphic.png` (1024x500)
- iOS 6.9 inch screenshots: `store/screenshots/ios-6.9/*.png` (1320x2868, required iPhone size)
- iOS 6.7 inch screenshots: `store/screenshots/ios-6.7/*.png` (1290x2796, also accepted for 6.9 inch)
- iOS 6.5 inch screenshots: `store/screenshots/ios-6.5/*.png` (1284x2778)
- iOS 5.5 inch screenshots: `store/screenshots/ios-5.5/*.png` (1242x2208)
- Android phone screenshots: `store/screenshots/android-phone/*.png` (1080x1920)
- iPhone Duo outer display: `store/screenshots/iphone-duo-outer-portrait/*.png` (1398x2034) and `iphone-duo-outer-landscape` (2034x1398)
- iPhone Duo inner display: `store/screenshots/iphone-duo-inner-portrait/*.png` (2007x2853) and `iphone-duo-inner-landscape` (2853x2007)
- Regenerate screenshots: `bun run store:screenshots` (set `SYNC_BACKEND_URL` to a running sync worker for the hosting scene)

iPhone Duo screenshots are optional today and required for submissions starting April 2027.

App Store creative assets (App Store Connect, October 2026; shown on iOS 27 and later):

- Product page header 21:9: `store/creative/product-page-header-21x9.png` (3840x1646)
- Universal header + search results 16:9: `store/creative/universal-16x9.png` (5244x2950, enable "Use header asset in search results")
- Search results 3:2: `store/creative/search-results-3x2.png` (3840x2560)
- Regenerate after screenshots: `bun run store:creative`
- All images are opaque (no alpha), localized copy is English only for now.
