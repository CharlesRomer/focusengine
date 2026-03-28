import SwiftUI

@main
struct CompassTrackerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        // No windows — menu bar is managed by AppDelegate.
        // Settings scene with EmptyView keeps SwiftUI happy.
        Settings { EmptyView() }
    }
}
