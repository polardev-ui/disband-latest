import Supabase
import SwiftUI

/// "kai used /fact" above a bot's answer, with the curved line from the
/// avatar column, as on the web and Discord.
struct InteractionHeader: View {
    let interaction: MessageInteraction

    var body: some View {
        HStack(spacing: 5) {
            Text(interaction.who)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Brand.textSecondary)
                .lineLimit(1)
            Text("used").font(.footnote).foregroundStyle(Brand.textMuted)
            Text("/\(interaction.name ?? "")")
                .font(.footnote.weight(.medium))
                .foregroundStyle(Brand.accent)
                .padding(.horizontal, 6)
                .padding(.vertical, 1)
                .background(Brand.accentSoft, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .padding(.bottom, 2)
        .overlay(alignment: .topLeading) {
            // The spine curls from the avatar column into this line.
            Path { p in
                p.move(to: CGPoint(x: 0, y: 22))
                p.addLine(to: CGPoint(x: 0, y: 14))
                p.addQuadCurve(to: CGPoint(x: 8, y: 8), control: CGPoint(x: 0, y: 8))
                p.addLine(to: CGPoint(x: 30, y: 8))
            }
            .stroke(Brand.textMuted.opacity(0.5), lineWidth: 2)
            .frame(width: 30, height: 22)
            .offset(x: -36)
            .allowsHitTesting(false)
        }
        .accessibilityElement(children: .combine)
    }
}

/// A bot message's buttons. Pressing one sends the bot an interaction; link
/// buttons open their page.
struct BotButtonsView: View {
    let messageId: String
    let rows: [ActionRow]

    @Environment(\.openURL) private var openURL
    @State private var pressing: String?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                FlowLayout(spacing: 6) {
                    ForEach(Array(row.components.enumerated()), id: \.offset) { _, button in
                        buttonView(button)
                    }
                }
            }
            if let error {
                Text(error).font(.caption).foregroundStyle(Brand.dnd)
            }
        }
        .padding(.top, 4)
    }

    private func buttonView(_ b: MessageButton) -> some View {
        let busy = pressing != nil && pressing == b.customId
        return Button {
            if b.style == "link", let s = b.url, let url = URL(string: s) {
                openURL(url)
                return
            }
            guard let id = b.customId, pressing == nil else { return }
            pressing = id
            error = nil
            Task {
                do { try await BotCommandService.press(messageId: messageId, customId: id) }
                catch { self.error = error.localizedDescription }
                pressing = nil
            }
        } label: {
            HStack(spacing: 5) {
                if busy {
                    ProgressView().controlSize(.mini).tint(.white)
                } else {
                    if let emoji = b.emoji, !emoji.isEmpty { Text(emoji) }
                    Text(b.label).font(.subheadline.weight(.semibold)).lineLimit(1)
                    if b.style == "link" { Image(systemName: "arrow.up.right").font(.caption.weight(.bold)) }
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .frame(minHeight: 34)
            .background(color(for: b.style), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(b.disabled == true || busy)
        .opacity(b.disabled == true ? 0.5 : 1)
    }

    private func color(for style: String) -> Color {
        switch style {
        case "primary": return Brand.accent
        case "success": return Color(hex: 0x248046)
        case "danger": return Color(hex: 0xDA373C)
        default: return Brand.elevated
        }
    }
}

/// The commands matching what's been typed after "/".
struct BotCommandSuggestionList: View {
    let commands: [BotCommand]
    var onPick: (BotCommand) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(commands.prefix(25)) { cmd in
                    Button { onPick(cmd) } label: {
                        HStack(spacing: 10) {
                            AvatarView(url: cmd.botAvatarUrl, name: cmd.botName, size: 28)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("/\(cmd.name)")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Brand.textPrimary)
                                Text(cmd.description)
                                    .font(.caption)
                                    .foregroundStyle(Brand.textMuted)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 8)
                            Text(cmd.botName)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Brand.textMuted)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .frame(maxHeight: 260)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.white.opacity(0.07)))
        .padding(.horizontal, 10)
        .padding(.bottom, 4)
    }

    /// Commands whose name starts with what's typed after the "/".
    static func matching(_ draft: String, in all: [BotCommand]) -> [BotCommand]? {
        guard draft.hasPrefix("/"), !draft.contains(" "), !draft.contains("\n") else { return nil }
        let q = draft.dropFirst().lowercased()
        let hits = all.filter { q.isEmpty || $0.name.hasPrefix(q) }
        return hits.isEmpty ? nil : hits
    }
}

/// Filling in a command's options and running it.
struct BotCommandSheet: View {
    let command: BotCommand
    let channelId: String
    let serverId: String
    var onSent: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var values: [String: String] = [:]
    @State private var running = false
    @State private var error: String?

    private var ready: Bool {
        command.options.allSatisfy { !$0.required || !(values[$0.name] ?? "").trimmingCharacters(in: .whitespaces).isEmpty }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        AvatarView(url: command.botAvatarUrl, name: command.botName, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("/\(command.name)").font(.headline).foregroundStyle(Brand.textPrimary)
                            Text(command.description).font(.subheadline).foregroundStyle(Brand.textMuted)
                        }
                    }
                }
                if !command.options.isEmpty {
                    Section("Options") {
                        ForEach(command.options, id: \.name) { option in field(option) }
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(Brand.dnd) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.surfaceRaised)
            .navigationTitle(command.botName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if running { ProgressView() } else {
                        Button("Send") { Task { await run() } }.disabled(!ready)
                    }
                }
            }
        }
    }

    @ViewBuilder private func field(_ option: BotCommand.Option) -> some View {
        let label = option.required ? option.name : "\(option.name) (optional)"
        let binding = Binding(get: { values[option.name] ?? "" }, set: { values[option.name] = $0 })
        if let choices = option.choices, !choices.isEmpty {
            Picker(label, selection: binding) {
                if !option.required { Text("None").tag("") }
                ForEach(choices, id: \.name) { c in Text(c.name).tag(c.value.text) }
            }
        } else if option.type == "boolean" {
            Picker(label, selection: binding) {
                if !option.required { Text("Not set").tag("") }
                Text("True").tag("true")
                Text("False").tag("false")
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(.caption.weight(.semibold)).foregroundStyle(Brand.textMuted)
                TextField(option.description, text: binding)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(option.type == "user" || option.type == "channel")
                    .keyboardType(option.type == "integer" || option.type == "number" ? .numbersAndPunctuation : .default)
            }
        }
    }

    private func run() async {
        running = true
        error = nil
        defer { running = false }
        do {
            var options: [String: AnyJSON] = [:]
            for option in command.options {
                if let v = try await BotCommandService.value(for: option, text: values[option.name] ?? "", serverId: serverId) {
                    options[option.name] = v
                }
            }
            try await BotCommandService.run(command, channelId: channelId, options: options)
            onSent()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
