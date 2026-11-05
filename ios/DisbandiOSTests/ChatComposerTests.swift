import XCTest
@testable import DisbandiOS

@MainActor
final class ChatComposerTests: XCTestCase {
    func testMentionQueryIsTheTypedTail() {
        XCTAssertEqual(MentionSearch.query(in: "hey @po"), "po")
        XCTAssertEqual(MentionSearch.query(in: "@"), "")
        XCTAssertNil(MentionSearch.query(in: "mail me at a@b"))     // an address, not a mention
        XCTAssertNil(MentionSearch.query(in: "hey @polar "))        // already finished
    }

    func testPickReplacesOnlyTheTypedMention() {
        let pick = MentionSuggestion(id: "1", kind: .everyone, insert: "@everyone")
        XCTAssertEqual(MentionSearch.applying(pick, to: "look @ev"), "look @everyone ")
    }

    func testRoleSlugMatchesTheWeb() {
        XCTAssertEqual(MentionSearch.roleSlug("  Mod Team! "), "Mod-Team")
        XCTAssertEqual(MentionSearch.roleSlug("🔥"), "")
    }

    func testSpoilerDetection() {
        XCTAssertTrue(ChatMarkdown.hasSpoiler("the ||ending|| is wild"))
        XCTAssertFalse(ChatMarkdown.hasSpoiler("a || b"))
    }
}
