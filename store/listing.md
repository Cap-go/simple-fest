# Simple Fest Store Listing

## App Identity

- App Store name: Simple Fest: Ticket Scanner (home screen: Simple Fest)
- SKU: `ee.forgr.festivalscan`
- Primary language: English (U.S.)
- Bundle ID / package name: `ee.forgr.festivalscan`
- Category: Business / Utilities (event check-in apps compete in Business; Utilities is crowded with generic QR readers)
- Age rating posture: suitable for general audiences; the app scans tickets and imported attendee rows only.

Source of truth for the App Store text is `scripts/asc/prepare-submission.ts`.

## ASO

Apple indexes name + subtitle + keyword field (+ screenshot captions); each word counts once, so the
keyword field never repeats a word from the name or subtitle. The description is not indexed.

- Name (27/30): `Simple Fest: Ticket Scanner`
- Subtitle (30/30): `Event QR Check-in & Guest List`
- Keywords (97/100 bytes): `festival,entry,door,gate,admission,attendee,wristband,csv,excel,sheets,offline,concert,party,pass`
- Screenshot order (first three show in search): camera scan, scan result, import, checkpoints, device sync
- Screenshot captions (`scripts/caption-store-screenshots.ts`, output `store/listing/`):
  1. Scan QR tickets at the door / Fast check-in for festivals and events
  2. Know in a second / Valid, already used or not paid, with the guest name
  3. Import any guest list / CSV, Excel or Google Sheets. Columns are detected for you.
  4. Entry, day passes, meals, drinks / Every checkpoint from one spreadsheet
  5. Sync every staff phone / Works offline and catches up when back online

Next levers once live: ratings (in-app review prompt after 20 accepted scans), localized listings
(fr, de, es, nl, pt-BR) with translated keywords, a 15-30s app preview video, and in-app events
around festival season.

Google Play short description:
Scan event QR tickets from CSV, Excel or Google Sheets. Offline synced check-in.

## Promotional Text

Import your guest list from CSV, Excel or Google Sheets and scan QR tickets in minutes. Free, no account, works offline and syncs every staff phone.

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
