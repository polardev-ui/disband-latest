import SwiftUI

/// Giphy search grid. Tapping a GIF returns its URL to the caller to send.
struct GifPickerView: View {
    var onPick: (GiphyGif) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""
    @State private var gifs: [GiphyGif] = []
    @State private var loading = false
    @State private var searchTask: Task<Void, Never>?

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
                .padding()

                if loading && gifs.isEmpty {
                    StateView(kind: .loading)
                } else if gifs.isEmpty {
                    StateView(kind: .empty, title: "No GIFs", systemImage: "photo.on.rectangle")
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(gifs) { gif in
                                if let thumb = gif.thumbUrl, let url = URL(string: thumb) {
                                    Button { onPick(gif); dismiss() } label: {
                                        AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: {
                                            Rectangle().fill(Brand.elevated)
                                        }
                                        .frame(height: 120)
                                        .frame(maxWidth: .infinity)
                                        .clipped()
                                        .clipShape(.rect(cornerRadius: 8))
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
