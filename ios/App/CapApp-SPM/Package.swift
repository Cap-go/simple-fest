// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.1"),
        .package(name: "CapacitorApp", path: "../../../node_modules/.bun/@capacitor+app@8.1.2+767ac80cbab8ae50/node_modules/@capacitor/app"),
        .package(name: "CapacitorClipboard", path: "../../../node_modules/.bun/@capacitor+clipboard@8.0.1+767ac80cbab8ae50/node_modules/@capacitor/clipboard"),
        .package(name: "CapacitorFilesystem", path: "../../../node_modules/.bun/@capacitor+filesystem@8.1.4+767ac80cbab8ae50/node_modules/@capacitor/filesystem"),
        .package(name: "CapacitorHaptics", path: "../../../node_modules/.bun/@capacitor+haptics@8.0.2+767ac80cbab8ae50/node_modules/@capacitor/haptics"),
        .package(name: "CapacitorKeyboard", path: "../../../node_modules/.bun/@capacitor+keyboard@8.0.6+767ac80cbab8ae50/node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorShare", path: "../../../node_modules/.bun/@capacitor+share@8.0.3+767ac80cbab8ae50/node_modules/@capacitor/share"),
        .package(name: "CapacitorSplashScreen", path: "../../../node_modules/.bun/@capacitor+splash-screen@8.0.2+767ac80cbab8ae50/node_modules/@capacitor/splash-screen"),
        .package(name: "CapacitorStatusBar", path: "../../../node_modules/.bun/@capacitor+status-bar@8.0.4+767ac80cbab8ae50/node_modules/@capacitor/status-bar"),
        .package(name: "CapgoCameraPreview", path: "../../../node_modules/.bun/@capgo+camera-preview@8.8.0+767ac80cbab8ae50/node_modules/@capgo/camera-preview"),
        .package(name: "CapgoCapacitorInAppReview", path: "../../../node_modules/.bun/@capgo+capacitor-in-app-review@8.2.7+767ac80cbab8ae50/node_modules/@capgo/capacitor-in-app-review"),
        .package(name: "CapgoCapacitorInappbrowser", path: "../../../node_modules/.bun/@capgo+capacitor-inappbrowser@8.22.4+767ac80cbab8ae50/node_modules/@capgo/capacitor-inappbrowser"),
        .package(name: "CapgoCapacitorKeepAwake", path: "../../../node_modules/.bun/@capgo+capacitor-keep-awake@8.1.18+767ac80cbab8ae50/node_modules/@capgo/capacitor-keep-awake"),
        .package(name: "CapgoCapacitorNativeNavigation", path: "../../../node_modules/.bun/@capgo+capacitor-native-navigation@8.6.2+767ac80cbab8ae50/node_modules/@capgo/capacitor-native-navigation"),
        .package(name: "CapgoCapacitorUpdater", path: "../../../node_modules/.bun/@capgo+capacitor-updater@8.49.7+767ac80cbab8ae50/node_modules/@capgo/capacitor-updater"),
        .package(name: "CapgoNativeAudio", path: "../../../node_modules/.bun/@capgo+native-audio@8.4.2+767ac80cbab8ae50/node_modules/@capgo/native-audio"),
        .package(name: "CapgoOauthLoopback", path: "../../../node_modules/.bun/@capgo+oauth-loopback@file+plugins+oauth-loopback+767ac80cbab8ae50/node_modules/@capgo/oauth-loopback"),
        .package(name: "CapacitorSecureStoragePlugin", path: "../../../node_modules/.bun/capacitor-secure-storage-plugin@0.13.0+767ac80cbab8ae50/node_modules/capacitor-secure-storage-plugin")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorClipboard", package: "CapacitorClipboard"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorShare", package: "CapacitorShare"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar"),
                .product(name: "CapgoCameraPreview", package: "CapgoCameraPreview"),
                .product(name: "CapgoCapacitorInAppReview", package: "CapgoCapacitorInAppReview"),
                .product(name: "CapgoCapacitorInappbrowser", package: "CapgoCapacitorInappbrowser"),
                .product(name: "CapgoCapacitorKeepAwake", package: "CapgoCapacitorKeepAwake"),
                .product(name: "CapgoCapacitorNativeNavigation", package: "CapgoCapacitorNativeNavigation"),
                .product(name: "CapgoCapacitorUpdater", package: "CapgoCapacitorUpdater"),
                .product(name: "CapgoNativeAudio", package: "CapgoNativeAudio"),
                .product(name: "CapgoOauthLoopback", package: "CapgoOauthLoopback"),
                .product(name: "CapacitorSecureStoragePlugin", package: "CapacitorSecureStoragePlugin")
            ]
        )
    ]
)
