import SwiftUI
import UIKit

/*
 The building blocks the desktop app uses, in SwiftUI, so iOS screens look
 and move the same way: the indigo "aero" backdrop, the bordered card, the
 labelled field, the primary and secondary buttons (with a press-in and the
 three loading dots), section captions, and haptics.
*/

// MARK: - Haptics

enum Haptics {
    /// Settings → App → Haptic feedback.
    private static var enabled: Bool { UserDefaults.standard.object(forKey: "settings.haptics") as? Bool ?? true }
    static func tap() { if enabled { UIImpactFeedbackGenerator(style: .light).impactOccurred() } }
    static func soft() { if enabled { UIImpactFeedbackGenerator(style: .soft).impactOccurred() } }
    static func success() { if enabled { UINotificationFeedbackGenerator().notificationOccurred(.success) } }
    static func warning() { if enabled { UINotificationFeedbackGenerator().notificationOccurred(.warning) } }
    static func select() { if enabled { UISelectionFeedbackGenerator().selectionChanged() } }
}

// MARK: - Motion

enum Motion {
    /// The desktop's ease-out (cubic-bezier(0.22,1,0.36,1)) as a spring.
    static let settle = Animation.spring(response: 0.42, dampingFraction: 0.86)
    static let quick = Animation.spring(response: 0.28, dampingFraction: 0.9)
    static let pop = Animation.spring(response: 0.34, dampingFraction: 0.68)
}

// MARK: - Aero backdrop

/// The indigo backdrop behind the desktop's sign-in and homepage: a deep
/// gradient with two slow glows. Drawn once; the glows drift on the GPU.
struct AeroBackground: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drift = false

    var body: some View {
        // The glows are overlays, so their size never reaches layout: as
        // siblings in a ZStack, the 520pt circles made whatever shared the
        // stack 520pt wide, wider than a phone.
        LinearGradient(colors: [Color(hex: 0x3C31D4), Color(hex: 0x3326BA), Color(hex: 0x2B1F9C)],
                       startPoint: .top, endPoint: .bottom)
            .overlay(alignment: .topLeading) {
                Circle()
                    .fill(RadialGradient(colors: [Color(hex: 0xA78BFA, alpha: 0.55), .clear], center: .center, startRadius: 0, endRadius: 240))
                    .frame(width: 480, height: 480)
                    .offset(x: drift ? -150 : -200, y: drift ? -120 : -180)
            }
            .overlay(alignment: .trailing) {
                Circle()
                    .fill(RadialGradient(colors: [Color(hex: 0xEC4899, alpha: 0.35), .clear], center: .center, startRadius: 0, endRadius: 220))
                    .frame(width: 440, height: 440)
                    .offset(x: drift ? 160 : 210, y: drift ? 40 : -30)
            }
            .clipped()
            .drawingGroup()
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 14).repeatForever(autoreverses: true)) { drift = true }
            }
    }
}

// MARK: - Card

/// The desktop's floating card: bg-secondary, a hairline border, a soft
/// indigo-black shadow, 20pt corners.
struct DSCard<Content: View>: View {
    var padding: CGFloat = 24
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .background(Brand.surface, in: .rect(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Color.white.opacity(0.06)))
            .shadow(color: Color(hex: 0x0A0628, alpha: 0.55), radius: 40, y: 24)
    }
}

// MARK: - Section caption

/// An uppercase 11pt caption above a group, like the desktop's field labels.
struct DSCaption: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.6)
            .foregroundStyle(Brand.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Field

/// A labelled input: caption above, a filled box with a focus ring in the
/// brand colour.
struct DSField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var secure = false
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType? = nil
    var trailing: AnyView? = nil

    @FocusState private var focused: Bool
    @State private var reveal = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                DSCaption(text: label)
                if let trailing { trailing }
            }
            HStack(spacing: 10) {
                Group {
                    if secure && !reveal {
                        SecureField(placeholder, text: $text)
                    } else {
                        TextField(placeholder, text: $text)
                            .keyboardType(keyboard)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                }
                .textContentType(contentType)
                .focused($focused)
                .font(.system(size: 16))
                .foregroundStyle(Brand.textPrimary)
                if secure {
                    Button {
                        reveal.toggle()
                        Haptics.select()
                    } label: {
                        Image(systemName: reveal ? "eye.slash" : "eye")
                            .font(.system(size: 15))
                            .foregroundStyle(Brand.textMuted)
                    }
                    .accessibilityLabel(reveal ? "Hide password" : "Show password")
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 48)
            .background(Brand.background, in: .rect(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(focused ? Brand.accent : Color.white.opacity(0.06), lineWidth: focused ? 1.5 : 1)
            )
            .animation(Motion.quick, value: focused)
        }
    }
}

// MARK: - Loading dots

/// The three bouncing dots the desktop shows inside a busy button.
struct LoadingDots: View {
    var color: Color = .white
    var size: CGFloat = 6
    @State private var phase = false

    var body: some View {
        HStack(spacing: size * 0.7) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(color)
                    .frame(width: size, height: size)
                    .opacity(phase ? 1 : 0.35)
                    .offset(y: phase ? -size * 0.5 : 0)
                    .animation(.easeInOut(duration: 0.5).repeatForever().delay(Double(i) * 0.16), value: phase)
            }
        }
        .onAppear { phase = true }
        .accessibilityLabel("Loading")
    }
}

// MARK: - Buttons

/// Presses in a little, like the desktop's active state.
struct PressScaleStyle: ButtonStyle {
    var scale: CGFloat = 0.97
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .opacity(configuration.isPressed ? 0.92 : 1)
            .animation(Motion.quick, value: configuration.isPressed)
    }
}

/// The brand button: full width, 48pt, loading dots while busy.
struct DSPrimaryButton: View {
    let title: String
    var busy = false
    var disabled = false
    var tint: Color? = nil
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            ZStack {
                if busy { LoadingDots() } else { Text(title).font(.system(size: 16, weight: .semibold)) }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(tint ?? Brand.accent, in: .rect(cornerRadius: 12))
            .foregroundStyle(.white)
        }
        .buttonStyle(PressScaleStyle())
        .disabled(disabled || busy)
        .opacity(disabled ? 0.55 : 1)
        .animation(Motion.quick, value: busy)
    }
}

/// The quieter button: filled with the raised surface.
struct DSSecondaryButton: View {
    let title: String
    var systemImage: String? = nil
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 8) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title)
            }
            .font(.system(size: 15, weight: .semibold))
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .background(Brand.elevated, in: .rect(cornerRadius: 12))
            .foregroundStyle(Brand.textPrimary)
        }
        .buttonStyle(PressScaleStyle())
    }
}

// MARK: - Entrance

extension View {
    /// Fades and lifts in once, after `delay` seconds, like the desktop's
    /// marketing-fade-up. Still with reduce motion.
    func riseIn(delay: Double = 0) -> some View { modifier(RiseIn(delay: delay)) }
}

private struct RiseIn: ViewModifier {
    let delay: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown || reduceMotion ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 14)
            .onAppear {
                guard !shown else { return }
                withAnimation(Motion.settle.delay(delay)) { shown = true }
            }
    }
}
