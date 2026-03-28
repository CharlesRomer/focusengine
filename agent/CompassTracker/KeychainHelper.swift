import Foundation
import Security

struct TrackerConfig: Codable {
    let supabaseUrl: String
    let anonKey:     String
    let token:       String
    let userId:      String
}

enum KeychainHelper {
    private static let service = "com.compass.tracker"
    private static let account = "config"

    static func save(_ config: TrackerConfig) {
        guard let data = try? JSONEncoder().encode(config) else { return }

        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
        ]
        // Delete any existing entry first, then add
        SecItemDelete(query as CFDictionary)

        var add = query
        add[kSecValueData] = data
        let status = SecItemAdd(add as CFDictionary, nil)
        if status != errSecSuccess {
            print("[CompassTracker] Keychain save failed: \(status)")
        }
    }

    static func loadConfig() -> TrackerConfig? {
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecReturnData:  true,
            kSecMatchLimit:  kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return try? JSONDecoder().decode(TrackerConfig.self, from: data)
    }
}
