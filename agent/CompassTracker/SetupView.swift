import SwiftUI

struct SetupView: View {
    let onComplete: () -> Void

    @State private var supabaseUrl = ""
    @State private var anonKey     = ""
    @State private var token       = ""
    @State private var userId      = ""

    private var isValid: Bool {
        !supabaseUrl.isEmpty && !anonKey.isEmpty && !token.isEmpty && !userId.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Compass Tracker")
                .font(.title2).fontWeight(.semibold)

            Text("Find these values in Compass → Settings → Agent tab.")
                .font(.caption).foregroundColor(.secondary)

            field("Supabase URL",  binding: $supabaseUrl, placeholder: "https://xxxx.supabase.co")
            field("Anon Key",      binding: $anonKey,     placeholder: "eyJ…")
            field("Agent Token",   binding: $token,       placeholder: "Paste token from Settings")
            field("User ID",       binding: $userId,      placeholder: "Your user UUID")

            Spacer().frame(height: 4)

            Button("Save & Start Tracking") {
                KeychainHelper.save(TrackerConfig(
                    supabaseUrl: supabaseUrl.trimmingCharacters(in: .whitespaces),
                    anonKey:     anonKey.trimmingCharacters(in: .whitespaces),
                    token:       token.trimmingCharacters(in: .whitespaces),
                    userId:      userId.trimmingCharacters(in: .whitespaces)
                ))
                onComplete()
            }
            .buttonStyle(.borderedProminent)
            .disabled(!isValid)
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(24)
        .frame(width: 420)
    }

    private func field(_ label: String, binding: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption).foregroundColor(.secondary)
            TextField(placeholder, text: binding)
                .textFieldStyle(.roundedBorder)
        }
    }
}
