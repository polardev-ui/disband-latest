import Foundation
import Observation
import SwiftUI
import UserNotifications

/*
 The daily streak: open Disband on consecutive days to keep it going. Kept on
 the device (UserDefaults), counted by calendar day in the local time zone.
 Milestones (3, 7, 14, 30, 50, 100, 365) get a small celebration, and an
 optional daily reminder nudges you in the evening if you haven't been in.
*/

@MainActor
@Observable
final class StreakService {
    static let shared = StreakService()

    private(set) var current = 0
    private(set) var best = 0
    /// Days opened in the last two weeks, as yyyy-MM-dd.
    private(set) var recentDays: Set<String> = []
    /// Set when today's visit reached a milestone; the card celebrates once.
    var milestoneReached: Int?

    var reminderEnabled: Bool {
        didSet {
            defaults.set(reminderEnabled, forKey: Keys.reminder)
            Task { await scheduleReminder() }
        }
    }
    var reminderHour: Int {
        didSet {
            defaults.set(reminderHour, forKey: Keys.reminderHour)
            Task { await scheduleReminder() }
        }
    }

    static let milestones = [3, 7, 14, 30, 50, 100, 365]

    private let defaults = UserDefaults.standard
    private enum Keys {
        static let current = "streak.current"
        static let best = "streak.best"
        static let last = "streak.lastDay"
        static let recent = "streak.recentDays"
        static let reminder = "streak.reminder"
        static let reminderHour = "streak.reminderHour"
    }
    private static let reminderId = "disband.streak.reminder"

    private init() {
        current = defaults.integer(forKey: Keys.current)
        best = defaults.integer(forKey: Keys.best)
        recentDays = Set(defaults.stringArray(forKey: Keys.recent) ?? [])
        reminderEnabled = defaults.object(forKey: Keys.reminder) as? Bool ?? false
        reminderHour = defaults.object(forKey: Keys.reminderHour) as? Int ?? 19
        // A streak whose last day is before yesterday has lapsed.
        if let last = defaults.string(forKey: Keys.last), let lastDate = Self.date(last),
           let gap = Calendar.current.dateComponents([.day], from: lastDate, to: Self.startOfToday).day, gap > 1 {
            current = 0
        }
    }

    /// Count today. Call when the app becomes active.
    func recordVisit() {
        let today = Self.key(Date())
        let last = defaults.string(forKey: Keys.last)
        guard last != today else { return }

        var next = 1
        if let last, let lastDate = Self.date(last),
           Calendar.current.dateComponents([.day], from: lastDate, to: Self.startOfToday).day == 1 {
            next = current + 1
        }
        current = next
        best = max(best, next)
        recentDays.insert(today)
        let cutoff = Calendar.current.date(byAdding: .day, value: -14, to: Date()) ?? Date()
        recentDays = recentDays.filter { (Self.date($0) ?? .distantPast) >= cutoff }

        defaults.set(current, forKey: Keys.current)
        defaults.set(best, forKey: Keys.best)
        defaults.set(today, forKey: Keys.last)
        defaults.set(Array(recentDays), forKey: Keys.recent)

        if Self.milestones.contains(next) { milestoneReached = next }
        Task { await scheduleReminder() }
    }

    /// The days of the current week (Mon–Sun) and whether each was visited.
    var week: [(label: String, visited: Bool, isToday: Bool)] {
        var cal = Calendar.current
        cal.firstWeekday = 2
        let today = Date()
        guard let start = cal.dateInterval(of: .weekOfYear, for: today)?.start else { return [] }
        let symbols = ["M", "T", "W", "T", "F", "S", "S"]
        return (0..<7).compactMap { i in
            guard let day = cal.date(byAdding: .day, value: i, to: start) else { return nil }
            return (symbols[i], recentDays.contains(Self.key(day)), cal.isDate(day, inSameDayAs: today))
        }
    }

    /// The next milestone to aim for.
    var nextMilestone: Int { Self.milestones.first { $0 > current } ?? (current + 100) }

    // MARK: Reminder

    /// Tomorrow evening's nudge (or tonight's, if today isn't counted yet).
    /// Replaced on every visit, so it only fires on days you haven't opened
    /// the app.
    func scheduleReminder() async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [Self.reminderId])
        guard reminderEnabled else { return }

        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }

        let visitedToday = defaults.string(forKey: Keys.last) == Self.key(Date())
        var day = Calendar.current.dateComponents([.year, .month, .day], from: visitedToday
            ? Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
            : Date())
        day.hour = reminderHour
        day.minute = 0
        if let fire = Calendar.current.date(from: day), fire <= Date() { return }

        let content = UNMutableNotificationContent()
        content.title = current > 1 ? "Keep your \(current)-day streak going 🔥" : "Your people are talking"
        content.body = current > 1
            ? "Pop into Disband today so your streak doesn't reset."
            : "Catch up on what you missed in your spaces and DMs."
        content.sound = .default
        let trigger = UNCalendarNotificationTrigger(dateMatching: day, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: Self.reminderId, content: content, trigger: trigger))
    }

    // MARK: Dates

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private static func key(_ date: Date) -> String { formatter.string(from: date) }
    private static func date(_ key: String) -> Date? { formatter.date(from: key) }
    private static var startOfToday: Date { Calendar.current.startOfDay(for: Date()) }
}

/// The streak on the You tab: the flame, this week's days, and the next goal.
struct DailyStreakCard: View {
    @State private var streak = StreakService.shared
    @State private var celebrate = false

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [Color(hex: 0xFF9F43), Color(hex: 0xF0436E)], startPoint: .top, endPoint: .bottom))
                    .frame(width: 52, height: 52)
                    .shadow(color: Color(hex: 0xF0436E, alpha: 0.45), radius: celebrate ? 16 : 6)
                Image(systemName: "flame.fill")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(.white)
                    .scaleEffect(celebrate ? 1.25 : 1)
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(streak.current)")
                        .font(.system(size: 22, weight: .heavy))
                        .contentTransition(.numericText())
                    Text(streak.current == 1 ? "day streak" : "day streak")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.textSecondary)
                    Spacer(minLength: 0)
                    Text("Next: \(streak.nextMilestone)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Brand.textMuted)
                }
                .foregroundStyle(Brand.textPrimary)
                HStack(spacing: 6) {
                    ForEach(Array(streak.week.enumerated()), id: \.offset) { _, day in
                        VStack(spacing: 4) {
                            Circle()
                                .fill(day.visited ? Color(hex: 0xFF7A45) : Brand.elevated)
                                .frame(width: 20, height: 20)
                                .overlay {
                                    if day.visited {
                                        Image(systemName: "checkmark").font(.system(size: 9, weight: .heavy)).foregroundStyle(.white)
                                    }
                                }
                                .overlay(Circle().strokeBorder(day.isToday ? Brand.textPrimary.opacity(0.6) : .clear, lineWidth: 1.5))
                            Text(day.label).font(.system(size: 10, weight: .semibold)).foregroundStyle(Brand.textMuted)
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(Brand.surface, in: .rect(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Color.white.opacity(0.06)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(streak.current) day streak. Best \(streak.best).")
        .onAppear(perform: celebrateIfNeeded)
        .onChange(of: streak.milestoneReached) { _, _ in celebrateIfNeeded() }
    }

    private func celebrateIfNeeded() {
        guard streak.milestoneReached != nil else { return }
        streak.milestoneReached = nil
        Haptics.success()
        withAnimation(Motion.pop) { celebrate = true }
        withAnimation(Motion.settle.delay(0.6)) { celebrate = false }
    }
}
