import XCTest
@testable import DisbandiOS

@MainActor
final class NotificationSourceTests: XCTestCase {
    private let id = "5f0c5f18-2f5f-4f4a-9a7f-2f5f4f4a9a7f"

    func testChannelPrefix() {
        XCTAssertEqual(NotificationRouter.normalizeSource("channel:\(id)"), id)
    }

    func testDmPrefix() {
        XCTAssertEqual(NotificationRouter.normalizeSource("dm:\(id)"), id)
    }

    func testGroupPath() {
        XCTAssertEqual(NotificationRouter.normalizeSource("/group/\(id)"), id)
    }

    func testGroupPrefix() {
        XCTAssertEqual(NotificationRouter.normalizeSource("group:\(id)"), id)
    }

    func testBarePushSourceIsUnchanged() {
        XCTAssertEqual(NotificationRouter.normalizeSource("  \(id)  "), id)
    }

    func testOfficialLinkIsNotGuessed() {
        XCTAssertEqual(
            NotificationRouter.normalizeSource("https://disband.dev/status"),
            "https://disband.dev/status"
        )
    }
}
