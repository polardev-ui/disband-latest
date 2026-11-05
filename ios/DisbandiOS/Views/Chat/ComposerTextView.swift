import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The composer's text box. A SwiftUI `TextField` never offers Paste when the
/// clipboard holds only an image, and has no way to receive one, so images
/// and GIFs couldn't be pasted at all. This is a `UITextView` that can: an
/// image on the clipboard is handed to `onPasteImages` (as its original
/// bytes, so a GIF stays animated) and text pastes as usual.
struct ComposerTextView: UIViewRepresentable {
    @Binding var text: String
    @Binding var focused: Bool
    var maxLines: Int = 6
    var onPasteImages: (([Data]) -> Void)?

    func makeUIView(context: Context) -> PasteAwareTextView {
        let view = PasteAwareTextView()
        view.delegate = context.coordinator
        view.font = .preferredFont(forTextStyle: .body)
        view.adjustsFontForContentSizeCategory = true
        view.textColor = UIColor(Brand.textPrimary)
        view.tintColor = UIColor(Brand.accent)
        view.backgroundColor = .clear
        view.isScrollEnabled = false
        // 11pt above and below: one line sits on the 44pt buttons' centre,
        // as the old field did, and more lines grow upward.
        view.textContainerInset = UIEdgeInsets(top: 11, left: 0, bottom: 11, right: 0)
        view.textContainer.lineFragmentPadding = 0
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.text = text
        view.onPasteImages = onPasteImages
        return view
    }

    func updateUIView(_ view: PasteAwareTextView, context: Context) {
        context.coordinator.parent = self
        view.onPasteImages = onPasteImages
        // Never overwrite while the keyboard is composing (marked text).
        if view.text != text, view.markedTextRange == nil {
            view.text = text
        }
        if focused, !view.isFirstResponder {
            DispatchQueue.main.async { view.becomeFirstResponder() }
        } else if !focused, view.isFirstResponder {
            DispatchQueue.main.async { view.resignFirstResponder() }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: PasteAwareTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 240
        let fit = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        let lineHeight = uiView.font?.lineHeight ?? 20
        let cap = lineHeight * CGFloat(maxLines) + uiView.textContainerInset.top + uiView.textContainerInset.bottom
        let scrolls = fit.height > cap
        if uiView.isScrollEnabled != scrolls {
            DispatchQueue.main.async { uiView.isScrollEnabled = scrolls }
        }
        return CGSize(width: width, height: max(44, min(fit.height, cap)))
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: ComposerTextView
        init(_ parent: ComposerTextView) { self.parent = parent }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
            textView.invalidateIntrinsicContentSize()
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            if !parent.focused { parent.focused = true }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            if parent.focused { parent.focused = false }
        }
    }
}

final class PasteAwareTextView: UITextView {
    var onPasteImages: (([Data]) -> Void)?

    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        if action == #selector(paste(_:)), onPasteImages != nil, UIPasteboard.general.hasImages {
            return true
        }
        return super.canPerformAction(action, withSender: sender)
    }

    override func paste(_ sender: Any?) {
        if let onPasteImages, UIPasteboard.general.hasImages {
            let images = Self.pastedImages(from: .general)
            if !images.isEmpty {
                onPasteImages(images)
                return
            }
        }
        super.paste(sender)
    }

    /// Each pasted image's own bytes where the clipboard has them (a GIF
    /// stays a GIF), otherwise the image re-encoded as JPEG.
    private static func pastedImages(from pasteboard: UIPasteboard) -> [Data] {
        let preferred: [UTType] = [.gif, .png, .jpeg, .heic, .webP]
        var out: [Data] = []
        for item in pasteboard.items {
            var found: Data?
            for type in preferred {
                if let data = item[type.identifier] as? Data { found = data; break }
            }
            if found == nil {
                for value in item.values {
                    if let image = value as? UIImage { found = image.jpegData(compressionQuality: 0.9); break }
                }
            }
            if let found { out.append(found) }
        }
        if out.isEmpty, let images = pasteboard.images {
            out = images.compactMap { $0.jpegData(compressionQuality: 0.9) }
        }
        return out
    }
}
