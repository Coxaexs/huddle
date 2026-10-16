// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "Hoffle",
    platforms: [
        .macOS(.v11)
    ],
    products: [
        .executable(
            name: "Hoffle",
            targets: ["Hoffle"]
        )
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "Hoffle",
            path: "src",
            exclude: ["web-bridge.js"],
            sources: [
                "main.m",
                "AppDelegate.m",
                "MainWindowController.m",
                "WebViewController.m",
                "PreferencesWindowController.m",
                "ConfigManager.m",
                "GlobalHotkeyManager.m",
                "ActivityScanner.m",
                "PushToTalkManager.m"
            ],
            publicHeadersPath: ".",
            cSettings: [
                .headerSearchPath("."),
                .unsafeFlags(["-fobjc-arc"])
            ],
            linkerSettings: [
                .linkedFramework("Cocoa"),
                .linkedFramework("WebKit"),
                .linkedFramework("UserNotifications"),
                .linkedFramework("Carbon"),
                .linkedFramework("Security"),
                .linkedFramework("QuartzCore")
            ]
        )
    ]
)
