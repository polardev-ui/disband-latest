import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var app

    @State private var sound = true
    @State private var notifications = true
    @State private var linkPreviews = true
    @State private var showDeleteConfirm = false
    @State private var deleting = false
    @State private var error: String?

    var body: some View {
        Form {
            Section("Notifications") {
                Toggle("Sound Effects", isOn: $sound)
                Toggle("Push Notifications", isOn: $notifications)
            }
            .onChange(of: sound) { _, v in save(.init(soundEnabled: v)) }
            .onChange(of: notifications) { _, v in save(.init(desktopNotificationsEnabled: v)) }

            Section("Chat") {
                Toggle("Link Previews", isOn: $linkPreviews)
            }
            .onChange(of: linkPreviews) { _, v in save(.init(linkPreviewsEnabled: v)) }

            Section("Status") {
                ForEach(UserStatus.allCases, id: \.self) { status in
                    Button { Task { await app.setStatus(status) } } label: {
                        HStack {
                            Circle().fill(status.color).frame(width: 12, height: 12)
                            Text(status.label).foregroundStyle(Brand.textPrimary)
                            Spacer()
                            if app.profile?.status == status {
                                Image(systemName: "checkmark").foregroundStyle(Brand.accent)
                            }
                        }
                    }
                }
            }

            Section("About") {
                LabeledContent("Version", value: "0.4.4")
                Link(destination: AppConfig.webAppURL) {
                    HStack { Text("Website"); Spacer(); Image(systemName: "arrow.up.right") }
                }
            }

            Section("Account") {
                Button(role: .destructive) { Task { await app.signOut() } } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                }
                Button(role: .destructive) { showDeleteConfirm = true } label: {
                    Label("Delete Account", systemImage: "trash")
                }
            }

            if let error {
                Text(error).foregroundStyle(Brand.dnd)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { loadToggles() }
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
    }

    private func save(_ patch: DatabaseService.ProfilePatch) {
        Task { error = await app.saveProfile(patch) }
    }
}
