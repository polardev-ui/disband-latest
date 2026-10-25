import XCTest
@testable import DisbandiOS

final class PresencePayloadTests: XCTestCase {
    private func decode(_ json: String) throws -> PresencePayload {
        try JSONDecoder().decode(PresencePayload.self, from: Data(json.utf8))
    }

    func testMissingStatusMeansOnline() throws {
        let payload = try decode(#"{"userId":"user-1"}"#)
        XCTAssertEqual(payload.userId, "user-1")
        XCTAssertEqual(payload.status, .online)
    }

    func testUnknownStatusDoesNotDropTheEntry() throws {
        let payload = try decode(#"{"userId":"user-1","status":"streaming"}"#)
        XCTAssertEqual(payload.userId, "user-1")
        XCTAssertEqual(payload.status, .online)
    }

    func testKnownStatusIsPreserved() throws {
        XCTAssertEqual(try decode(#"{"userId":"u","status":"idle"}"#).status, .idle)
        XCTAssertEqual(try decode(#"{"userId":"u","status":"dnd"}"#).status, .dnd)
        XCTAssertEqual(try decode(#"{"userId":"u","status":"offline"}"#).status, .offline)
    }
}
