# EzFest Store Listing

## App Identity

- App name: EzFest
- Bundle ID / package name: `com.ezfest.app`
- Category: Utilities / Productivity
- Age rating posture: suitable for general audiences; the app scans tickets and imported attendee rows only.

## Short Descriptions

Apple subtitle:
Festival operations platform

Google Play short description:
Manage festival operations from CSV or Sheets, offline-first with live sync.

## Promotional Text

Manage check-in, passes, meals, drinks, and team sync from one local-first festival operations app.

## Full Description

EzFest helps festival teams manage on-site operations from a spreadsheet.

Import a CSV, XLSX, or public Google Sheet export, and the app detects the ticket code column plus operational modes such as entrance, day passes, meals, drinks, and custom checkpoints. Staff can scan QR codes with the camera, enter a code manually, see the latest validation result, and export an updated CSV after the event.

For multi-device teams, one device can host a festival session and show an invite QR. Other devices join to receive the current database plus live scan events while network is available. If network drops, each device keeps working locally and can export its own CSV.

Key features:

- Manage festival check-in from CSV, XLSX, or public Google Sheet data.
- AI-assisted schema mapping with deterministic fallback heuristics.
- Dynamic home screen based on detected festival workflows.
- QR camera scanning and manual code validation.
- Entrance, day pass, food, drink, and custom operations.
- Local-first event state with CSV export.
- Optional device sync by invite QR.
- Example template included for reliable imports.

EzFest is built for temporary event teams that need a practical festival operations platform without provisioning a full ticketing backend.

## Keywords

festival,ticket,qr,scanner,csv,sheet,check-in,food,drink,sync

## What's New

Initial EzFest release with spreadsheet import, AI mapping, local scanning, CSV export, and device sync rooms.

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

The app can be reviewed without an account. Use the built-in `Load example` action to populate sample festival data, then enter `TCK-1001` in the manual QR field and tap `Validate` to see an accepted scan.

## Generated Store Assets

Native app assets:

- iOS app icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024x1024)
- iOS splash: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png` (2732x2732)
- Android adaptive and density icons: `android/app/src/main/res/mipmap-*`
- Android splash resources: `android/app/src/main/res/drawable*`

Store assets:

- Google Play icon: `store/assets/play-store-icon.png` (512x512)
- Google Play feature graphic: `store/assets/play-store-feature-graphic.png` (1024x500)
- iOS 6.7 inch screenshots: `store/screenshots/ios-6.7/*.png` (1290x2796)
- iOS 6.5 inch screenshots: `store/screenshots/ios-6.5/*.png` (1284x2778)
- iOS 5.5 inch screenshots: `store/screenshots/ios-5.5/*.png` (1242x2208)
- iPad Pro 12.9 inch screenshots: `store/screenshots/ios-ipad-12.9/*.png` (2048x2732)
- Android phone screenshots: `store/screenshots/android-phone/*.png` (1080x1920)
- Regenerate screenshots: `bun run store:screenshots`
