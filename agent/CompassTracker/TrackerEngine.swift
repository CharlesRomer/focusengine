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

    // ── Work-app tracking for notifications ───────────────────────
    private let workAppBundles: Set<String> = [
        "com.microsoft.VSCode", "com.apple.dt.Xcode", "com.figma.Desktop",
        "notion.id", "com.linear",
        // JetBrains
        "com.jetbrains.intellij.ce", "com.jetbrains.intellij",
        "com.jetbrains.webstorm", "com.jetbrains.pycharm",
        "com.jetbrains.pycharm.ce", "com.jetbrains.goland",
        "com.jetbrains.clion", "com.jetbrains.rider", "com.jetbrains.phpstorm",
        // Browsers
        "com.google.Chrome", "com.apple.Safari",
        "org.mozilla.firefox", "com.microsoft.edgemac",
        "company.thebrowser.Browser", "com.brave.Browser",
    ]
    private let excludedBundles: Set<String> = [
        "com.tinyspeck.slackmacgap", "com.apple.mail", "com.apple.MobileSMS",
        "com.spotify.client", "com.apple.systempreferences",
        "com.apple.finder", "com.apple.Terminal", "com.googlecode.iterm2",
    ]
    private var consecutiveWorkSeconds: Double = 0
    private var hadNonIdleActivityToday = false
    private var lastActivityResetDate  = ""

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

        // Every 30 s: re-check browser tab, check idle state, refresh active session ID, evaluate notifications
        keepAliveTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.checkBrowserTabChange()
            self?.checkIdleState()
            SupabaseClient.shared.fetchActiveSessionId()
            self?.updateActivityFlag()
            self?.evaluateNotifications()
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

    // ── Work-app helpers ──────────────────────────────────────────

    private func isInWorkApp() -> Bool {
        guard let bundle = currentBundleId, !isIdle else { return false }
        if excludedBundles.contains(bundle) { return false }
        return workAppBundles.contains(bundle)
    }

    private func updateActivityFlag() {
        let today = String(Date().ISO8601Format().prefix(10))
        if lastActivityResetDate != today {
            lastActivityResetDate = today
            hadNonIdleActivityToday = false
        }
        if !isIdle && currentApp != nil {
            hadNonIdleActivityToday = true
        }
    }

    // ── Notification evaluation (runs every 30 s) ─────────────────

    func evaluateNotifications() {
        let cal          = Calendar.current
        let now          = Date()
        let hour         = cal.component(.hour,   from: now)
        let minute       = cal.component(.minute, from: now)
        let timeMinutes  = hour * 60 + minute

        // Update consecutive work seconds
        if isInWorkApp() && SupabaseClient.shared.activeSessionId == nil {
            consecutiveWorkSeconds += 30
        } else {
            consecutiveWorkSeconds = 0
        }

        // ── Notification A: working without session (8am–7pm) ─────
        if timeMinutes >= 480 && timeMinutes <= 1140 {
            if isInWorkApp() && SupabaseClient.shared.activeSessionId == nil {
                let minutes = Int(consecutiveWorkSeconds / 60)
                let rounded = (minutes / 5) * 5
                if rounded >= 15 {
                    let lastFired = UserDefaults.standard.double(forKey: "compassLastWorkingNotifTime")
                    if now.timeIntervalSince1970 - lastFired > 3600 {
                        NotificationManager.shared.scheduleWorkingWithoutSession(minutesWorking: rounded)
                    }
                }
            }
        }

        // ── Notification B: morning check-in (8:30am–10:00am) ────
        if timeMinutes >= 510 && timeMinutes <= 600 {
            guard hadNonIdleActivityToday,
                  SupabaseClient.shared.activeSessionId == nil,
                  !NotificationManager.shared.hasNotificationFiredToday(key: "compassMorningCheckInDate"),
                  !NotificationManager.shared.isSnoozed(),
                  !NotificationManager.shared.hasReachedDailyLimit()
            else { return }
            SupabaseClient.shared.queryCommitmentsForToday { hasAny, _ in
                if !hasAny {
                    NotificationManager.shared.scheduleMorningCheckIn()
                }
            }
        }

        // ── Notification C: end of day (5:00pm–6:00pm) ───────────
        if timeMinutes >= 1020 && timeMinutes <= 1080 {
            guard hadNonIdleActivityToday,
                  !NotificationManager.shared.hasNotificationFiredToday(key: "compassEndOfDayDate"),
                  !NotificationManager.shared.isSnoozed(),
                  !NotificationManager.shared.hasReachedDailyLimit()
            else { return }
            SupabaseClient.shared.queryCommitmentsForToday { _, openCount in
                if openCount > 0 {
                    NotificationManager.shared.scheduleEndOfDay(openCommitments: openCount)
                }
            }
        }
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
