import SwiftUI

// Building blocks for the redesigned top-level screens, so Home, Friends,
// Notes and You read as one app: an in-content title instead of a navigation
// bar, raised cards, capsule filters, and settings rows with tinted tiles.

/// The large title each top-level screen opens with.
struct ScreenHeader<Trailing: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var trailing: () -> Trailing

    init(_ title: String, subtitle: String? = nil,
         @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }) {
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing
    }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(Brand.textPrimary)
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Brand.textMuted)
                }
            }
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }
}

/// A round glass button for header actions.
struct HeaderIconButton: View {
    let symbol: String
    let label: String
    var tint: Color = Brand.textPrimary
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HeaderIconLabel(symbol: symbol, tint: tint)
        }
        .accessibilityLabel(label)
    }
}

struct HeaderIconLabel: View {
    let symbol: String
    var tint: Color = Brand.textPrimary

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 40, height: 40)
            .background(Brand.surface, in: Circle())
    }
}

/// A raised card on the screen background.
struct SurfaceCard<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .background(Brand.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// Small caps label above a group of cards or rows.
struct SectionCaption: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.bold))
            .tracking(0.6)
            .foregroundStyle(Brand.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.top, 14)
            .padding(.bottom, 6)
    }
}

/// Pill filters, like the inbox's All / Unread / Groups.
struct CapsuleFilterBar<Option: Hashable & Identifiable>: View {
    let options: [Option]
    @Binding var selection: Option
    let title: (Option) -> String
    var badge: (Option) -> Int = { _ in 0 }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(options) { option in
                    let active = option == selection
                    Button {
                        withAnimation(.snappy(duration: 0.2)) { selection = option }
                    } label: {
                        HStack(spacing: 6) {
                            Text(title(option))
                            if badge(option) > 0 {
                                Text("\(badge(option))")
                                    .font(.caption2.weight(.bold))
                                    .padding(.horizontal, 6).frame(height: 18)
                                    .background(active ? Color.white.opacity(0.25) : Brand.dnd, in: Capsule())
                                    .foregroundStyle(.white)
                            }
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(active ? Color.white : Brand.textSecondary)
                        .padding(.horizontal, 14)
                        .frame(height: 34)
                        .background(active ? Brand.accent : Brand.surface, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
        }
    }
}

/// A search box in the app's capsule style.
struct CapsuleSearchField: View {
    let prompt: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Brand.textMuted)
            TextField(prompt, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .foregroundStyle(Brand.textPrimary)
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Brand.textMuted)
                }
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 42)
        .background(Brand.surface, in: Capsule())
        .padding(.horizontal, 20)
    }
}

/// One row in a settings group: a tinted icon tile, a title, optional detail.
struct SettingsRowLabel: View {
    let symbol: String
    let tint: Color
    let title: String
    var detail: String?
    var showsChevron = true
    var destructive = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 30, height: 30)
                .background(tint.gradient, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            Text(title)
                .font(.body.weight(.medium))
                .foregroundStyle(destructive ? Brand.dnd : Brand.textPrimary)
            Spacer(minLength: 8)
            if let detail {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Brand.textMuted)
                    .lineLimit(1)
            }
            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Brand.textMuted)
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }
}

/// A card of settings rows separated by hairlines.
struct SettingsGroup<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) { content() }
            .background(Brand.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding(.horizontal, 16)
    }
}

struct SettingsDivider: View {
    var body: some View {
        Rectangle().fill(Brand.divider).frame(height: 1).padding(.leading, 56)
    }
}

/// A toggle row in the same style as `SettingsRowLabel`.
struct SettingsToggleRow: View {
    let symbol: String
    let tint: Color
    let title: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            SettingsRowLabel(symbol: symbol, tint: tint, title: title, showsChevron: false)
                .padding(.horizontal, -14)
        }
        .tint(Brand.accent)
        .padding(.horizontal, 14)
        .frame(minHeight: 52)
    }
}

/// Presets for how long a custom status lasts; the web's
/// `STATUS_DURATION_PRESETS`.
enum StatusDuration: String, CaseIterable, Identifiable {
    case tenMinutes, thirtyMinutes, oneHour, threeHours, oneDay, threeDays, never

    var id: String { rawValue }

    var label: String {
        switch self {
        case .tenMinutes: return "10 mins"
        case .thirtyMinutes: return "30 mins"
        case .oneHour: return "1 hour"
        case .threeHours: return "3 hours"
        case .oneDay: return "1 day"
        case .threeDays: return "3 days"
        case .never: return "Don't clear"
        }
    }

    var seconds: TimeInterval? {
        switch self {
        case .tenMinutes: return 600
        case .thirtyMinutes: return 1800
        case .oneHour: return 3600
        case .threeHours: return 10_800
        case .oneDay: return 86_400
        case .threeDays: return 259_200
        case .never: return nil
        }
    }

    func expiry(from now: Date = Date()) -> Date? { seconds.map { now.addingTimeInterval($0) } }
}

extension View {
    /// Paints the screen background behind the status bar, for screens that
    /// hide the navigation bar. Without it, scrolled content slid up under
    /// the clock and battery.
    func statusBarScrim() -> some View {
        overlay(alignment: .top) {
            Brand.background
                .ignoresSafeArea(edges: .top)
                .frame(height: 0)
        }
    }
}

extension View {
    /// A solid bar for pushed pages. iOS 26's clear bar let cards scroll
    /// visibly behind the title.
    func solidNavigationBar() -> some View {
        toolbarBackground(Brand.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}
