import Foundation

struct TabInfo {
    var url:   String?
    var title: String?
}

enum BrowserHelper {
    private static let scripts: [String: String] = [
        "com.google.Chrome": """
            tell application "Google Chrome"
                if (count of windows) > 0 then
                    return (URL of active tab of front window) & "\n" & (title of active tab of front window)
                end if
            end tell
            """,
        "com.apple.Safari": """
            tell application "Safari"
                if (count of windows) > 0 then
                    return (URL of current tab of front window) & "\n" & (name of current tab of front window)
                end if
            end tell
            """,
        "com.microsoft.edgemac": """
            tell application "Microsoft Edge"
                if (count of windows) > 0 then
                    return (URL of active tab of front window) & "\n" & (title of active tab of front window)
                end if
            end tell
            """,
    ]

    /// Runs AppleScript synchronously on the calling thread.
    /// Only call this when the target browser is the frontmost app.
    static func getActiveTab(bundleId: String) -> TabInfo {
        guard let src = scripts[bundleId] else { return TabInfo() }

        var error: NSDictionary?
        let result = NSAppleScript(source: src)?.executeAndReturnError(&error)

        if let err = error {
            print("[CompassTracker] AppleScript error: \(err["NSAppleScriptErrorMessage"] ?? err)")
            return TabInfo()
        }

        guard let output = result?.stringValue else { return TabInfo() }

        let parts = output.components(separatedBy: "\n")
        return TabInfo(
            url:   parts.first.flatMap { $0.isEmpty ? nil : $0 },
            title: parts.count > 1 ? parts[1] : nil
        )
    }
}
