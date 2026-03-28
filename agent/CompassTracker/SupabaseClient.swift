import Foundation

final class SupabaseClient {
    static let shared = SupabaseClient()

    private var teamOrgId: String?         = nil
    private var pending:   [ActivitySession] = []
    private let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    // ── team_org_id ───────────────────────────────────────────────

    /// Fetches team_org_id once and caches it. Flushes pending queue on success.
    func fetchTeamOrgIdIfNeeded() {
        guard teamOrgId == nil, let cfg = KeychainHelper.loadConfig() else { return }

        var comps = URLComponents(string: "\(cfg.supabaseUrl)/rest/v1/users")!
        comps.queryItems = [
            URLQueryItem(name: "id",     value: "eq.\(cfg.userId)"),
            URLQueryItem(name: "select", value: "team_org_id"),
        ]
        var req = URLRequest(url: comps.url!)
        addAuthHeaders(to: &req, cfg: cfg)
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
            guard let data,
                  let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
                  let id  = arr.first?["team_org_id"] as? String
            else { return }

            DispatchQueue.main.async {
                self?.teamOrgId = id
                print("[CompassTracker] team_org_id: \(id)")
                self?.flushPending()
            }
        }.resume()
    }

    // ── Send session ──────────────────────────────────────────────

    func send(_ session: ActivitySession) {
        if teamOrgId == nil {
            pending.append(session)
            fetchTeamOrgIdIfNeeded()
            return
        }
        insert(session)
    }

    private func flushPending() {
        let queue = pending
        pending = []
        queue.forEach { insert($0) }
    }

    // ── Insert ────────────────────────────────────────────────────

    private func insert(_ session: ActivitySession) {
        guard let cfg   = KeychainHelper.loadConfig(),
              let orgId = teamOrgId,
              let url   = URL(string: "\(cfg.supabaseUrl)/rest/v1/activity_events")
        else { return }

        var payload: [String: Any] = [
            "user_id":          cfg.userId,
            "team_org_id":      orgId,
            "app_name":         session.appName,
            "started_at":       iso.string(from: session.startedAt),
            "ended_at":         iso.string(from: session.endedAt),
            "duration_seconds": session.durationSeconds,
            "category":         session.category ?? "untracked",
        ]
        if let v = session.bundleId  { payload["bundle_id"]  = v }
        if let v = session.tabURL    { payload["tab_url"]    = v }
        if let v = session.tabTitle  { payload["tab_title"]  = v }

        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.httpBody   = body
        addAuthHeaders(to: &req, cfg: cfg)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("return=minimal",   forHTTPHeaderField: "Prefer")

        URLSession.shared.dataTask(with: req) { _, resp, _ in
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            let ok   = code == 201
            print("[CompassTracker] \(ok ? "✓" : "✗") \(session.appName) \(session.durationSeconds)s (HTTP \(code))")
        }.resume()
    }

    // ── Shared auth headers ───────────────────────────────────────

    private func addAuthHeaders(to req: inout URLRequest, cfg: TrackerConfig) {
        req.setValue(cfg.anonKey,           forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(cfg.anonKey)", forHTTPHeaderField: "Authorization")
        req.setValue(cfg.token,             forHTTPHeaderField: "x-agent-token")
    }
}
