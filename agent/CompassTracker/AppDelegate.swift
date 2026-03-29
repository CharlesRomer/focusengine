import AppKit
import SwiftUI
import ServiceManagement
import Sparkle

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let engine = TrackerEngine.shared
    private var setupWindow: NSWindow?
    private var menuRefreshTimer: Timer?

    // Sparkle — must be a stored property (not a local) so it isn't deallocated
    private let updaterController = SPUStandardUpdaterController(
        startingUpdater: true,
        updaterDelegate: nil,
        userDriverDelegate: nil
    )

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory) // no Dock icon
        buildStatusBar()

        if KeychainHelper.loadConfig() != nil {
            engine.start()
            registerLoginItem()
        } else {
            showSetup()
        }

        // Refresh menu every 5s so "current app" stays up to date
        menuRefreshTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.rebuildMenu()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        engine.stop()
    }

    // ── Status bar ────────────────────────────────────────────────

    private func buildStatusBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let btn = statusItem.button {
            btn.image = NSImage(systemSymbolName: "record.circle", accessibilityDescription: "Compass Tracker")
            btn.image?.size = NSSize(width: 16, height: 16)
        }
        rebuildMenu()
    }

    func rebuildMenu() {
        let menu = NSMenu()

        let dot  = engine.isTracking ? "●" : "○"
        let status = engine.isTracking ? "Tracking" : "Not connected"
        menu.addItem(withTitle: "\(dot)  \(status)", action: nil, keyEquivalent: "")

        if let app = engine.currentApp {
            let appItem = NSMenuItem(title: app, action: nil, keyEquivalent: "")
            appItem.isEnabled = false
            menu.addItem(appItem)
        }

        menu.addItem(.separator())

        let copy = NSMenuItem(title: "Copy Agent Token", action: #selector(copyToken), keyEquivalent: "")
        copy.target = self
        menu.addItem(copy)

        let setup = NSMenuItem(title: "Setup…", action: #selector(openSetup), keyEquivalent: ",")
        setup.target = self
        menu.addItem(setup)

        menu.addItem(.separator())

        let updates = NSMenuItem(title: "Check for Updates…", action: #selector(checkForUpdates), keyEquivalent: "")
        updates.target = self
        menu.addItem(updates)

        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit CompassTracker", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        statusItem.menu = menu
    }

    // ── Actions ───────────────────────────────────────────────────

    @objc private func copyToken() {
        guard let cfg = KeychainHelper.loadConfig() else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(cfg.token, forType: .string)
    }

    @objc private func openSetup() { showSetup() }

    // ── Setup window ──────────────────────────────────────────────

    private func showSetup() {
        if setupWindow == nil {
            setupWindow = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 420, height: 340),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            setupWindow?.title = "Compass Tracker Setup"
            setupWindow?.isReleasedWhenClosed = false
        }
        setupWindow?.contentView = NSHostingView(rootView: SetupView {
            [weak self] in
            self?.setupWindow?.close()
            self?.engine.start()
            self?.registerLoginItem()
            self?.rebuildMenu()
        })
        setupWindow?.center()
        setupWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // ── Sparkle ───────────────────────────────────────────────────

    @objc private func checkForUpdates() {
        updaterController.checkForUpdates(nil)
    }

    // ── Login item ────────────────────────────────────────────────

    private func registerLoginItem() {
        if #available(macOS 13.0, *) {
            do {
                try SMAppService.mainApp.register()
            } catch {
                print("[CompassTracker] Login item: \(error.localizedDescription)")
            }
        }
    }
}
