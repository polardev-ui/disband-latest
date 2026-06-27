import SwiftUI
import PhotosUI

struct ProfileTab: View {
    @Environment(AppState.self) private var app
    @State private var showEdit = false
    @State private var avatarItem: PhotosPickerItem?
    @State private var bannerItem: PhotosPickerItem?
    @State private var uploading = false

    private var profile: Profile? { app.profile }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    banner
                    quickStatus
                    if let bio = profile?.bio, !bio.isEmpty {
                        infoCard(title: "About Me", content: bio)
                    }
                }
                .padding(.bottom, 24)
            }
            .background(Brand.background)
            .navigationTitle("You")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink { SettingsView() } label: { Image(systemName: "gearshape") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showEdit = true } label: { Image(systemName: "pencil") }
                }
            }
            .sheet(isPresented: $showEdit) { EditProfileSheet() }
            .onChange(of: avatarItem) { _, item in if let item { Task { await upload(item, banner: false) } } }
            .onChange(of: bannerItem) { _, item in if let item { Task { await upload(item, banner: true) } } }
        }
    }

    private var banner: some View {
        ZStack(alignment: .bottomLeading) {
            // Banner image / accent gradient with a picker overlay
            PhotosPicker(selection: $bannerItem, matching: .images) {
                RemoteImage(url: profile?.bannerUrl, contentMode: .fill) { accentGradient }
                .frame(height: 150).frame(maxWidth: .infinity).clipped()
                .overlay(alignment: .topTrailing) {
                    Image(systemName: "camera.fill").padding(8)
                        .background(.black.opacity(0.35), in: .circle)
                        .foregroundStyle(.white).padding(10)
                }
            }
            .buttonStyle(.plain)

            PhotosPicker(selection: $avatarItem, matching: .images) {
                AvatarView(url: profile?.avatarUrl, name: profile?.name ?? "?", size: 92,
                           status: profile?.status, ringColors: accentColors, ringWidth: 5)
                    .background(Circle().fill(Brand.background).padding(-3))
                    .overlay(alignment: .bottomTrailing) {
                        if uploading {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "camera.fill").font(.caption2).padding(5)
                                .background(Brand.accent, in: .circle).foregroundStyle(.white)
                        }
                    }
                    .padding(.leading, 18)
                    .offset(y: 46)
            }
            .buttonStyle(.plain)
        }
        .padding(.bottom, 60)
        .overlay(alignment: .bottomLeading) {
            VStack(alignment: .leading, spacing: 2) {
                Text(profile?.name ?? "Loading…").font(.title2.bold()).foregroundStyle(Brand.textPrimary)
                Text("@\(profile?.handle ?? "user")").font(.subheadline).foregroundStyle(Brand.textMuted)
            }
            .padding(.leading, 120)
            .offset(y: -8)
        }
    }

    private var accentColors: [Color] {
        [Color(hexString: profile?.accentColor) ?? Brand.accent,
         Color(hexString: profile?.accentColor2) ?? Brand.accentSoft]
    }

    private var accentGradient: some View {
        LinearGradient(colors: accentColors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var quickStatus: some View {
        HStack(spacing: 10) {
            ForEach(UserStatus.allCases, id: \.self) { status in
                Button { Task { await app.setStatus(status) } } label: {
                    VStack(spacing: 4) {
                        Circle().fill(status.color).frame(width: 14, height: 14)
                        Text(status.label.components(separatedBy: " ").first ?? "")
                            .font(.caption2).foregroundStyle(Brand.textSecondary)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .background(profile?.status == status ? Brand.elevated : Brand.surface,
                                in: .rect(cornerRadius: 12))
                }
            }
        }
        .padding(.horizontal)
    }

    private func infoCard(title: String, content: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(Brand.textMuted)
            Text(content).foregroundStyle(Brand.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Brand.surface, in: .rect(cornerRadius: 16))
        .padding(.horizontal)
    }

    private func upload(_ item: PhotosPickerItem, banner: Bool) async {
        uploading = true
        defer { uploading = false; if banner { bannerItem = nil } else { avatarItem = nil } }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let result = try? await MediaService.uploadImage(data) else { return }
        let patch = banner
            ? DatabaseService.ProfilePatch(bannerUrl: result.url)
            : DatabaseService.ProfilePatch(avatarUrl: result.url)
        await app.saveProfile(patch)
    }
}

struct EditProfileSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var displayName = ""
    @State private var bio = ""
    @State private var accent: String?
    @State private var accent2: String?
    @State private var busy = false

    private let palette = ["#5865F2", "#EB459E", "#ED4245", "#FAA61A",
                           "#57F287", "#9B59B6", "#1ABC9C", "#E67E22"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Display name") { TextField("Display name", text: $displayName) }
                Section("About me") {
                    TextField("Tell people about yourself", text: $bio, axis: .vertical).lineLimit(3...6)
                }
                Section("Accent color") { swatches(selection: $accent) }
                Section("Secondary accent") { swatches(selection: $accent2) }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save", action: save).disabled(busy) }
            }
            .onAppear {
                displayName = app.profile?.displayName ?? ""
                bio = app.profile?.bio ?? ""
                accent = app.profile?.accentColor
                accent2 = app.profile?.accentColor2
            }
        }
    }

    private func swatches(selection: Binding<String?>) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 10) {
            ForEach(palette, id: \.self) { hex in
                Circle()
                    .fill(Color(hexString: hex) ?? Brand.accent)
                    .frame(height: 30)
                    .overlay(Circle().stroke(.white, lineWidth: selection.wrappedValue == hex ? 2 : 0))
                    .onTapGesture { selection.wrappedValue = hex }
            }
        }
        .padding(.vertical, 4)
    }

    private func save() {
        busy = true
        Task {
            await app.saveProfile(.init(
                displayName: displayName.trimmingCharacters(in: .whitespaces),
                bio: bio.trimmingCharacters(in: .whitespaces),
                accentColor: accent, accentColor2: accent2))
            busy = false
            dismiss()
        }
    }
}
