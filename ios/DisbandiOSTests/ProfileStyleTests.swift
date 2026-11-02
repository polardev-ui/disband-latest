import SwiftUI
import XCTest
@testable import DisbandiOS

@MainActor
final class ProfileStyleTests: XCTestCase {
    func testEveryNameFontLoadsFromTheBundle() {
        NameFont.registerAll()
        for font in NameFont.allCases where font != .standard {
            XCTAssertNotNil(font.font(size: 15), "\(font.rawValue) didn't register")
        }
        XCTAssertNil(NameFont.standard.font(size: 15))
    }

    func testUnknownFontIdFallsBackToDefault() {
        XCTAssertEqual(NameFont(id: "comic-sans"), .standard)
        XCTAssertEqual(NameFont(id: nil), .standard)
        XCTAssertEqual(NameFont(id: "pixels"), .pixels)
    }

    func testGradientDirectionsMatchCSS() {
        func near(_ a: UnitPoint, _ x: Double, _ y: Double) -> Bool { abs(a.x - x) < 0.001 && abs(a.y - y) < 0.001 }
        let right = NameStyle.points(for: "90deg")
        XCTAssertTrue(near(right.0, 0, 0.5) && near(right.1, 1, 0.5))
        let down = NameStyle.points(for: "180deg")
        XCTAssertTrue(near(down.0, 0.5, 0) && near(down.1, 0.5, 1))
    }

    func testSecondColourAloneStartsFromWhite() {
        let style = NameStyle(color: nil, color2: "#ff0000")
        XCTAssertNotNil(style.gradient)
        XCTAssertEqual(style.startColor, .white)
        XCTAssertNil(NameStyle().gradient)
    }

    func testProfileDecodesStyleMusicAndGame() throws {
        let json = """
        {"id":"u1","status":"online","name_font":"gothic","name_color":"#ffffff","name_color_2":"#5865f2",
         "name_gradient_dir":"90deg",
         "listening":{"source":"spotify","track":"Song","artists":"Band","artwork":null,
                      "duration_ms":200000,"started_at":"2026-11-02T12:00:00.000Z"},
         "activity":{"kind":"playing","name":"Roblox","source":"process","expires_at":"2099-01-01T00:00:00.000Z",
                     "buttons":[{"label":"Join","url":"https://example.com"}]}}
        """
        let profile = try JSONDecoder().decode(Profile.self, from: Data(json.utf8))
        XCTAssertEqual(NameStyle(profile).font, .gothic)
        XCTAssertEqual(profile.listening?.track, "Song")
        XCTAssertEqual(profile.activity?.name, "Roblox")
        XCTAssertTrue(profile.activity?.isLive() ?? false)
    }

    func testOddActivityDoesNotBreakTheProfile() throws {
        // An unknown kind and a missing expiry must not fail the whole row.
        let json = #"{"id":"u1","status":"online","activity":{"kind":"dancing","name":"X"}}"#
        let profile = try JSONDecoder().decode(Profile.self, from: Data(json.utf8))
        XCTAssertFalse(profile.activity?.isLive() ?? true)
        XCTAssertEqual(profile.activity?.verb, "Playing")
    }

    func testTrackStopsShowingOnceItsLengthRunsOut() {
        let started = Date(timeIntervalSince1970: 1_000_000)
        let iso = ISO8601DateFormatter().string(from: started)
        let song = Listening(source: "spotify", track: "Song", artists: "Band", durationMs: 180_000, startedAt: iso)
        XCTAssertTrue(song.isCurrent(now: started.addingTimeInterval(120)))
        XCTAssertTrue(song.isCurrent(now: started.addingTimeInterval(240)))   // inside the 90 s slack
        XCTAssertFalse(song.isCurrent(now: started.addingTimeInterval(300)))
    }
}
