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
        .package(name: "CapacitorHaptics", path: "../../../node_modules/.bun/@capacitor+haptics@8.0.2+767ac80cbab8ae50/node_modules/@capacitor/haptics"),
        .package(name: "CapgoCameraPreview", path: "../../../node_modules/.bun/@capgo+camera-preview@8.8.0+767ac80cbab8ae50/node_modules/@capgo/camera-preview"),
        .package(name: "CapgoCapacitorUpdater", path: "../../../node_modules/.bun/@capgo+capacitor-updater@8.49.7+767ac80cbab8ae50/node_modules/@capgo/capacitor-updater")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapgoCameraPreview", package: "CapgoCameraPreview"),
                .product(name: "CapgoCapacitorUpdater", package: "CapgoCapacitorUpdater")
            ]
        )
    ]
)
