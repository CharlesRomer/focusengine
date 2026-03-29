import AppKit
import Foundation

final class TrackerEngine: ObservableObject {
    static let shared = TrackerEngine()

    @Published var currentApp: String?  = nil
    @Published var isTracking: Bool     = false

    private var currentBundleId:  String? = nil
    private var currentTabURL:    String? = nil
    private var currentTabTitle:  String? = nil
    private var sessionStart:     Date    = Date()
    private var isIdle:           Bool    = false

    private let idleThresholdSeconds: Double = 300   // 5 minutes
    private let activeThresholdSeconds: Double = 30  // resume after 30s of activity

    private var keepAliveTimer: Timer?

    private let browserBundles: Set<String> = [
        "com.google.Chrome",
        "com.apple.Safari",
        "org.mozilla.firefox",
        "com.microsoft.edgemac",
    ]

    // ── Start / stop ──────────────────────────────────────────────

    func start() {
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey]
                    as? NSRunningApplication else { return }
            self?.handleAppSwitch(app)
        }

        // Snapshot whatever is frontmost right now
        if let front = NSWorkspace.shared.frontmostApplication {
            handleAppSwitch(front)
        }

        // Every 30 s: re-check browser tab, check idle state, refresh active session ID
        keepAliveTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.checkBrowserTabChange()
            self?.checkIdleState()
            SupabaseClient.shared.fetchActiveSessionId()
        }

        isTracking = true
        SupabaseClient.shared.fetchTeamOrgIdIfNeeded()
        SupabaseClient.shared.fetchActiveSessionId()
    }

    func stop() {
        closeCurrentSession()
        keepAliveTimer?.invalidate()
        keepAliveTimer = nil
        NSWorkspace.shared.notificationCenter.removeObserver(
            self,
            name: NSWorkspace.didActivateApplicationNotification,
            object: nil
        )
        isTracking = false
    }

    // ── App switch handler ────────────────────────────────────────

    private func handleAppSwitch(_ app: NSRunningApplication) {
        let name   = app.localizedName  ?? "Unknown"
        let bundle = app.bundleIdentifier ?? ""

        closeCurrentSession()

        var tabURL:   String? = nil
        var tabTitle: String? = nil
        if browserBundles.contains(bundle) {
            let tab = BrowserHelper.getActiveTab(bundleId: bundle)
            tabURL   = tab.url
            tabTitle = tab.title
        }

        currentApp      = name
        currentBundleId = bundle
        currentTabURL   = tabURL
        currentTabTitle = tabTitle
        sessionStart    = Date()
    }

    // ── Browser tab keep-alive ────────────────────────────────────

    private func checkBrowserTabChange() {
        guard let bundle = currentBundleId, browserBundles.contains(bundle) else { return }
        let tab = BrowserHelper.getActiveTab(bundleId: bundle)
        guard tab.url != currentTabURL else { return }

        // Tab URL changed — close old session and start a new one
        closeCurrentSession()
        currentTabURL   = tab.url
        currentTabTitle = tab.title
        sessionStart    = Date()
    }

    // ── Idle detection ────────────────────────────────────────────

    private func checkIdleState() {
        let idleSecs = CGEventSource.secondsSinceLastEventType(
            .hidSystemState, eventType: CGEventType(rawValue: ~0)!
        )
        if !isIdle && idleSecs > idleThresholdSeconds {
            // Transition → idle
            isIdle = true
            closeCurrentSession()
            currentApp      = "Idle"
            currentBundleId = nil
            currentTabURL   = nil
            currentTabTitle = nil
            sessionStart    = Date()
        } else if isIdle && idleSecs < activeThresholdSeconds {
            // Transition → active: close idle session, resume with frontmost app
            isIdle = false
            let idleDuration = Int(Date().timeIntervalSince(sessionStart))
            if idleDuration >= 2 {
                SupabaseClient.shared.send(ActivitySession(
                    appName: "Idle",
                    bundleId: nil,
                    tabURL: nil,
                    tabTitle: nil,
                    startedAt: sessionStart,
                    endedAt: Date(),
                    durationSeconds: idleDuration,
                    category: "idle"
                ))
            }
            if let front = NSWorkspace.shared.frontmostApplication {
                handleAppSwitch(front)
            }
        }
    }

    // ── Session close ─────────────────────────────────────────────

    private func closeCurrentSession() {
        guard let app = currentApp else { return }
        let duration = Int(Date().timeIntervalSince(sessionStart))
        guard duration >= 2 else { return }

        SupabaseClient.shared.send(ActivitySession(
            appName:         app,
            bundleId:        currentBundleId,
            tabURL:          currentTabURL,
            tabTitle:        currentTabTitle,
            startedAt:       sessionStart,
            endedAt:         Date(),
            durationSeconds: duration
        ))
    }
}

// ── Value type passed to SupabaseClient ───────────────────────────

struct ActivitySession {
    let appName:         String
    let bundleId:        String?
    let tabURL:          String?
    let tabTitle:        String?
    let startedAt:       Date
    let endedAt:         Date
    let durationSeconds: Int
    var category:        String? = nil  // nil → "untracked"; "idle" for idle sessions
}
