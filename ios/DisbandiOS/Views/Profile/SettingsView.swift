import SwiftUI

/// Notification and chat preferences, plus account deletion. Status, the
/// version and signing out live on the You page itself.
struct SettingsView: View {
    @Environment(AppState.self) private var app

    @State private var sound = true
    @State private var notifications = true
    @State private var linkPreviews = true
    @State private var showDeleteConfirm = false
    @State private var deleting = false
    @State private var error: String?
    @State private var loaded = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
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
        .navigationTitle("Notifications & chat")
        .navigationBarTitleDisplayMode(.inline)
        .solidNavigationBar()
        .onAppear(perform: loadToggles)
        // Only after the stored values are in, or seeding the toggles would
        // write them straight back.
        .onChange(of: sound) { _, v in if loaded { save(.init(soundEnabled: v)) } }
        .onChange(of: notifications) { _, v in if loaded { save(.init(desktopNotificationsEnabled: v)) } }
        .onChange(of: linkPreviews) { _, v in if loaded { save(.init(linkPreviewsEnabled: v)) } }
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
