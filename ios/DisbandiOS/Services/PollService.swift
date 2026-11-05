import Foundation
import Supabase
import Realtime

/// A poll as `get_poll` returns it: the question, options, vote counts and
/// your own vote. Same RPCs as the web (`src/lib/poll.ts`).
struct Poll: Decodable, Equatable {
    let id: String
    let question: String
    let options: [String]
    let counts: [Int]
    let closed: Bool
    let authorId: String?
    let myVote: Int?

    enum CodingKeys: String, CodingKey {
        case id, question, options, counts, closed
        case authorId = "author_id"
        case myVote = "my_vote"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        question = (try? c.decode(String.self, forKey: .question)) ?? ""
        options = (try? c.decode([String].self, forKey: .options)) ?? []
        let raw = (try? c.decode([Int].self, forKey: .counts)) ?? []
        counts = options.indices.map { $0 < raw.count ? raw[$0] : 0 }
        closed = (try? c.decode(Bool.self, forKey: .closed)) ?? false
        authorId = try? c.decode(String.self, forKey: .authorId)
        myVote = try? c.decode(Int.self, forKey: .myVote)
    }

    var totalVotes: Int { counts.reduce(0, +) }
}

enum PollService {
    static let maxOptions = 10

    private static var client: SupabaseClient { SupabaseManager.client }

    static func create(question: String, options: [String]) async throws -> Poll {
        struct Params: Encodable { let p_question: String; let p_options: [String] }
        return try await client.rpc("create_poll", params: Params(p_question: question, p_options: options))
            .execute().value
    }

    static func get(_ id: String) async throws -> Poll {
        try await client.rpc("get_poll", params: ["p_poll": id]).execute().value
    }

    static func vote(_ id: String, option: Int) async throws -> Poll {
        struct Params: Encodable { let p_poll: String; let p_option: Int }
        return try await client.rpc("vote_poll", params: Params(p_poll: id, p_option: option)).execute().value
    }

    static func close(_ id: String) async throws -> Poll {
        try await client.rpc("close_poll", params: ["p_poll": id]).execute().value
    }

    /// Votes are private rows, so nobody sees a table change. Whoever votes or
    /// closes tells the others on `poll:<id>`, as the web does, and they
    /// reload the counts.
    static func topic(_ id: String) -> String { "poll:\(id)" }
}
