import Foundation

struct TrackerConfig: Codable {
    let supabaseUrl: String
    let anonKey:     String
    let token:       String
    let userId:      String
}

enum KeychainHelper {
    private static let key = "com.compass.tracker.config"

    static func save(_ config: TrackerConfig) {
        guard let data = try? JSONEncoder().encode(config) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    static func loadConfig() -> TrackerConfig? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(TrackerConfig.self, from: data)
    }
}
