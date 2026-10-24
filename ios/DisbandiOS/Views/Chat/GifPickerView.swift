import SwiftUI

/// Giphy search grid. Tapping a GIF returns its URL to the caller to send.
struct GifPickerView: View {
    var onPick: (GiphyGif) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""
    @State private var gifs: [GiphyGif] = []
    @State private var loading = false
    @State private var searchTask: Task<Void, Never>?
    @State private var tab: Tab = .browse
    @ObservedObject private var favorites = GifFavoritesService.shared

    private enum Tab: String, CaseIterable { case browse = "GIFs", favorites = "Favourites" }

    private let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(Brand.textMuted)
                    TextField("Search GIFs", text: $query)
                        .foregroundStyle(Brand.textPrimary)
                        .autocorrectionDisabled()
                        .onChange(of: query) { _, _ in debouncedSearch() }
                }
                .padding(12)
                .background(Brand.surface, in: .rect(cornerRadius: 12))
                .padding(.horizontal)
                .padding(.top)
                .opacity(tab == .browse ? 1 : 0.4)
                .disabled(tab == .favorites)

                Picker("", selection: $tab) {
                    ForEach(Tab.allCases, id: \.self) { t in
                        Label(t.rawValue, systemImage: t == .favorites ? "star.fill" : "sparkles").tag(t)
                    }
                }
                .pickerStyle(.segmented)
                .padding()

                if tab == .favorites {
                    favoritesGrid
                } else if loading && gifs.isEmpty {
                    StateView(kind: .loading)
                } else if gifs.isEmpty {
                    StateView(kind: .empty, title: "No GIFs", systemImage: "photo.on.rectangle")
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(gifs) { gif in
                                if let thumb = gif.thumbUrl {
                                    Button { onPick(gif); dismiss() } label: {
                                        RemoteImage(url: thumb, contentMode: .fill) {
                                            Rectangle().fill(Brand.elevated)
                                        }
                                        .frame(height: 120)
                                        .frame(maxWidth: .infinity)
                                        .clipped()
                                        .clipShape(.rect(cornerRadius: 8))
                                    }
                                    .contextMenu {
                                        if let full = gif.fullUrl {
                                            let starred = favorites.isFavorite(full)
                                            Button {
                                                Task { await favorites.toggle(full) }
                                            } label: {
                                                Label(starred ? "Remove from Favourites" : "Add to Favourites",
                                                      systemImage: starred ? "star.slash" : "star")
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                }
            }
            .background(Brand.background)
            .navigationTitle("GIFs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .task { await search() }
        .task { await favorites.refresh() }
    }

    /// Starred GIFs, newest first. Long-press one to unstar it.
    @ViewBuilder private var favoritesGrid: some View {
        if !favorites.loaded {
            StateView(kind: .loading)
        } else if favorites.favorites.isEmpty {
            StateView(kind: .empty, title: "No favourites yet", systemImage: "star")
        } else {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(favorites.favorites.reversed(), id: \.stableId) { fav in
                        Button {
                            onPick(GiphyGif(id: fav.stableId, url: fav.url, preview: nil, images: nil))
                            dismiss()
                        } label: {
                            RemoteImage(url: fav.url, contentMode: .fill) {
                                Rectangle().fill(Brand.elevated)
                            }
                            .frame(height: 120)
                            .frame(maxWidth: .infinity)
                            .clipped()
                            .clipShape(.rect(cornerRadius: 8))
                        }
                        .contextMenu {
                            Button(role: .destructive) {
                                Task { await favorites.toggle(fav.url) }
                            } label: { Label("Remove from Favourites", systemImage: "star.slash") }
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    private func debouncedSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            if !Task.isCancelled { await search() }
        }
    }

    private func search() async {
        loading = true
        gifs = (try? await MediaService.searchGifs(query)) ?? []
        loading = false
    }
}
