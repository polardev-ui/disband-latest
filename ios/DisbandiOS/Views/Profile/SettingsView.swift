import StoreKit
import SwiftUI
import UIKit

/// Subscription controls, notification and chat preferences, plus account
/// deletion. Status, the version and signing out live on the You page itself.
struct SettingsView: View {
    @Environment(AppState.self) private var app
    @Environment(SubscriptionService.self) private var subscriptions
    @Environment(\.openURL) private var openURL

    @State private var sound = true
    @State private var notifications = true
    @State private var linkPreviews = true
    @State private var showDeleteConfirm = false
    @State private var deleting = false
    @State private var error: String?
    @State private var loaded = false
    @State private var billingPrompt: BillingPrompt?
    @State private var billingBusy = false
    @State private var billingError: String?
    @State private var billingNote: String?

    private enum BillingPrompt: String, Identifiable {
        case cancel, resume
        var id: String { rawValue }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                SectionCaption("Subscription")
                SettingsGroup {
                    SettingsRowLabel(
                        symbol: "sparkles",
                        tint: Color(hex: 0xB8860B),
                        title: subscriptions.plan == .aero ? "Disband Aero" : "Disband Free",
                        detail: subscriptionDetail,
                        showsChevron: false
                    )

                    if let sub = subscriptions.subscription {
                        if sub.isApple {
                            SettingsDivider()
                            Button { Task { await manageAppleSubscription() } } label: {
                                SettingsRowLabel(
                                    symbol: "creditcard.fill",
                                    tint: Color(hex: 0x007AFF),
                                    title: "Manage Apple subscription",
                                    detail: sub.isCancellationScheduled ? "Cancelled" : "Cancel or change"
                                )
                            }
                            .buttonStyle(.plain)
                            .disabled(billingBusy)
                        } else if canCancelStripe {
                            SettingsDivider()
                            if sub.isCancellationScheduled {
                                Button { billingPrompt = .resume } label: {
                                    SettingsRowLabel(
                                        symbol: "arrow.clockwise",
                                        tint: Brand.accent,
                                        title: "Resume subscription"
                                    )
                                }
                                .buttonStyle(.plain)
                                .disabled(billingBusy)
                            } else {
                                Button { billingPrompt = .cancel } label: {
                                    SettingsRowLabel(
                                        symbol: "xmark.circle.fill",
                                        tint: Brand.dnd,
                                        title: "Cancel subscription",
                                        showsChevron: false,
                                        destructive: true
                                    )
                                }
                                .buttonStyle(.plain)
                                .disabled(billingBusy)
                            }
                        }
                    }
                }

                if let footnote = billingFootnote {
                    Text(footnote)
                        .font(.footnote)
                        .foregroundStyle(Brand.textMuted)
                        .padding(.horizontal, 24)
                        .padding(.top, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if let billingError {
                    Text(billingError)
                        .font(.footnote)
                        .foregroundStyle(Brand.dnd)
                        .padding(.horizontal, 24)
                        .padding(.top, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if let billingNote {
                    Text(billingNote)
                        .font(.footnote)
                        .foregroundStyle(Brand.textMuted)
                        .padding(.horizontal, 24)
                        .padding(.top, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                SectionCaption("Notifications")
                SettingsGroup {
                    SettingsToggleRow(symbol: "speaker.wave.2.fill", tint: Color(hex: 0x5865F2),
                                      title: "Sound effects", isOn: $sound)
                    SettingsDivider()
                    SettingsToggleRow(symbol: "bell.fill", tint: Color(hex: 0xF23F43),
                                      title: "Push notifications", isOn: $notifications)
                }

                SectionCaption("Chat")
                SettingsGroup {
                    SettingsToggleRow(symbol: "link", tint: Color(hex: 0x1ABC9C),
                                      title: "Link previews", isOn: $linkPreviews)
                }

                SectionCaption("Danger zone")
                SettingsGroup {
                    Button { showDeleteConfirm = true } label: {
                        SettingsRowLabel(symbol: "trash.fill", tint: Brand.dnd,
                                         title: deleting ? "Deleting…" : "Delete account",
                                         showsChevron: false, destructive: true)
                    }
                    .buttonStyle(.plain)
                    .disabled(deleting)
                }

                if let error {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Brand.dnd)
                        .padding(.horizontal, 24)
                        .padding(.top, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .background(Brand.background)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .solidNavigationBar()
        .onAppear(perform: loadToggles)
        // Only after the stored values are in, or seeding the toggles would
        // write them straight back.
        .onChange(of: sound) { _, v in if loaded { save(.init(soundEnabled: v)) } }
        .onChange(of: notifications) { _, v in if loaded { save(.init(desktopNotificationsEnabled: v)) } }
        .onChange(of: linkPreviews) { _, v in if loaded { save(.init(linkPreviewsEnabled: v)) } }
        .confirmationDialog(
            billingPrompt == .resume ? "Resume subscription?" : "Cancel subscription?",
            isPresented: Binding(
                get: { billingPrompt != nil },
                set: { if !$0 { billingPrompt = nil } }
            ),
            titleVisibility: .visible
        ) {
            if billingPrompt == .resume {
                Button("Resume") {
                    Task { await setCancellation(resume: true) }
                }
            } else {
                Button("Cancel subscription", role: .destructive) {
                    Task { await setCancellation(resume: false) }
                }
            }
            Button("Keep subscription", role: .cancel) {}
        } message: {
            Text(
                billingPrompt == .resume
                    ? "Renewal will restart. Your plan will continue after \(billingPeriodEndLabel)."
                    : "You'll keep your plan until \(billingPeriodEndLabel). Renewal stops after that, and payments already made are non-refundable."
            )
        }
        .alert("Delete Account?", isPresented: $showDeleteConfirm) {
            Button("Cancel", role: .cancel) { }
            Button("Delete", role: .destructive) {
                deleting = true
                Task { error = await app.deleteAccount(); deleting = false }
            }
        } message: {
            Text("This permanently deletes your account, profile, messages, and all associated data. This cannot be undone.")
        }
    }

    private var canCancelStripe: Bool {
        guard let sub = subscriptions.subscription, !sub.isApple else { return false }
        return ["active", "trialing", "past_due"].contains(sub.status)
    }

    private var subscriptionDetail: String {
        if billingBusy { return "Updating…" }
        guard let sub = subscriptions.subscription else {
            return subscriptions.plan == .aero ? "Gifted time" : "No active subscription"
        }
        if sub.isCancellationScheduled {
            return "Cancels \(formattedPeriodEnd)"
        }
        if sub.status == "past_due" { return "Payment issue" }
        if sub.status == "canceled" { return "Cancelled" }
        if let end = RelativeTime.date(from: sub.currentPeriodEnd) {
            return "Renews \(end.formatted(date: .abbreviated, time: .omitted))"
        }
        return sub.status.capitalized
    }

    private var billingPeriodEndLabel: String {
        guard let end = RelativeTime.date(from: subscriptions.subscription?.currentPeriodEnd) else {
            return "the end of the current billing period"
        }
        return end.formatted(date: .long, time: .omitted)
    }

    private var formattedPeriodEnd: String {
        guard let end = RelativeTime.date(from: subscriptions.subscription?.currentPeriodEnd) else {
            return "at period end"
        }
        return end.formatted(date: .abbreviated, time: .omitted)
    }

    private var billingFootnote: String? {
        if let sub = subscriptions.subscription {
            if sub.isApple {
                return "Apple manages this subscription. Cancelling stops renewal and keeps Aero until the period ends; Apple handles refund requests."
            }
            if sub.status == "canceled" {
                return "This subscription has ended."
            }
            return "Cancelling stops future renewals. You keep Aero until the end of the current billing period; payments already made are non-refundable."
        }
        if subscriptions.plan == .aero {
            return "This Aero time was gifted and does not renew."
        }
        return nil
    }

    private func setCancellation(resume: Bool) async {
        billingBusy = true
        billingError = nil
        billingNote = nil
        let message = await subscriptions.setCancellation(resume: resume)
        billingBusy = false
        if let message {
            billingError = message
        } else {
            billingNote = resume
                ? "Renewal resumed."
                : "Cancellation scheduled. Aero stays active until \(billingPeriodEndLabel)."
        }
    }

    private func manageAppleSubscription() async {
        billingError = nil
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) else {
            openURL(Self.appleSubscriptionsURL)
            return
        }
        do {
            try await AppStore.showManageSubscriptions(in: scene)
        } catch {
            openURL(Self.appleSubscriptionsURL)
        }
    }

    private static let appleSubscriptionsURL = URL(string: "https://apps.apple.com/account/subscriptions")!

    private func loadToggles() {
        sound = app.profile?.soundEnabled ?? true
        notifications = app.profile?.desktopNotificationsEnabled ?? true
        linkPreviews = app.profile?.linkPreviewsEnabled ?? true
        DispatchQueue.main.async { loaded = true }
    }

    private func save(_ patch: DatabaseService.ProfilePatch) {
        Task { error = await app.saveProfile(patch) }
    }
}
