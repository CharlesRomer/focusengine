import Foundation
import UserNotifications

final class NotificationManager: NSObject {
    static let shared = NotificationManager()
    private let center = UNUserNotificationCenter.current()

    // MARK: – Permission

    func requestPermission() {
        // Only ask once
        guard !UserDefaults.standard.bool(forKey: "compassNotifPermissionRequested") else { return }
        UserDefaults.standard.set(true, forKey: "compassNotifPermissionRequested")
        center.requestAuthorization(options: [.alert, .sound]) { granted, error in
            print("[CompassTracker] Notification permission \(granted ? "granted" : "denied")\(error.map { ": \($0)" } ?? "")")
        }
    }

    // MARK: – Notification A — working without session

    func scheduleWorkingWithoutSession(minutesWorking: Int) {
        guard !isSnoozed(), !hasReachedDailyLimit() else { return }

        let content = UNMutableNotificationContent()
        content.title = "You've been working for \(minutesWorking) minutes"
        content.body  = "No focus session running — want to name what you're working on?"
        content.sound = .default
        content.categoryIdentifier = "WORKING_WITHOUT_SESSION"

        enqueue(id: "working-without-session", content: content) {
            UserDefaults.standard.set(
                Date().timeIntervalSince1970,
                forKey: "compassLastWorkingNotifTime"
            )
        }
    }

    // MARK: – Notification B — morning check-in

    func scheduleMorningCheckIn() {
        guard !hasNotificationFiredToday(key: "compassMorningCheckInDate"),
              !isSnoozed(), !hasReachedDailyLimit() else { return }

        let content = UNMutableNotificationContent()
        content.title = "Morning check-in"
        content.body  = "You haven't set your commitments yet — what are you working on today?"
        content.sound = .default
        content.categoryIdentifier = "MORNING_CHECKIN"

        enqueue(id: "morning-checkin", content: content) {
            self.markNotificationFiredToday(key: "compassMorningCheckInDate")
        }
    }

    // MARK: – Notification C — end of day

    func scheduleEndOfDay(openCommitments: Int) {
        guard !hasNotificationFiredToday(key: "compassEndOfDayDate"),
              !isSnoozed(), !hasReachedDailyLimit() else { return }

        let s = openCommitments == 1 ? "" : "s"
        let content = UNMutableNotificationContent()
        content.title = "Time to wrap up"
        content.body  = "You have \(openCommitments) open commitment\(s) — close out your day before you finish"
        content.sound = .default
        content.categoryIdentifier = "END_OF_DAY"

        enqueue(id: "end-of-day", content: content) {
            self.markNotificationFiredToday(key: "compassEndOfDayDate")
        }
    }

    // MARK: – Snooze

    func snooze(minutes: Int) {
        let expiry = Date().addingTimeInterval(Double(minutes * 60))
        UserDefaults.standard.set(expiry.ISO8601Format(), forKey: "compassNotifSnoozeUntil")
        print("[CompassTracker] Snoozed for \(minutes) min")
    }

    func isSnoozed() -> Bool {
        guard let str    = UserDefaults.standard.string(forKey: "compassNotifSnoozeUntil"),
              let expiry = try? Date(str, strategy: .iso8601) else { return false }
        return Date() < expiry
    }

    // MARK: – Once-per-day helpers

    func hasNotificationFiredToday(key: String) -> Bool {
        guard let str  = UserDefaults.standard.string(forKey: key),
              let date = try? Date(str, strategy: .iso8601) else { return false }
        return Calendar.current.isDateInToday(date)
    }

    func markNotificationFiredToday(key: String) {
        UserDefaults.standard.set(Date().ISO8601Format(), forKey: key)
    }

    // MARK: – Daily cap (max 3)

    func hasReachedDailyLimit() -> Bool { dailyCount() >= 3 }

    private func dailyCount() -> Int {
        let dateKey  = "compassNotifDailyDate"
        let countKey = "compassNotifDailyCount"
        // Reset if new day
        if let str    = UserDefaults.standard.string(forKey: dateKey),
           let stored = try? Date(str, strategy: .iso8601),
           !Calendar.current.isDateInToday(stored) {
            UserDefaults.standard.set(0, forKey: countKey)
            UserDefaults.standard.set(Date().ISO8601Format(), forKey: dateKey)
        } else if UserDefaults.standard.string(forKey: dateKey) == nil {
            UserDefaults.standard.set(Date().ISO8601Format(), forKey: dateKey)
        }
        return UserDefaults.standard.integer(forKey: countKey)
    }

    private func incrementDailyCount() {
        let countKey = "compassNotifDailyCount"
        UserDefaults.standard.set(dailyCount() + 1, forKey: countKey)
    }

    // MARK: – Private helper

    private func enqueue(id: String, content: UNMutableNotificationContent, onSuccess: @escaping () -> Void) {
        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil)) { [weak self] error in
            if let error = error {
                print("[CompassTracker] Notification '\(id)' error: \(error.localizedDescription)")
            } else {
                self?.incrementDailyCount()
                onSuccess()
            }
        }
    }
}
