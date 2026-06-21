"use client";

interface DangerousDownloadModalProps {
  open: boolean;
  fileName: string;
  onClose: () => void;
  onContinue: () => void;
}

export function DangerousDownloadModal({
  open,
  fileName,
  onClose,
  onContinue,
}: DangerousDownloadModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby="download-warning-title"
        className="relative w-full max-w-md rounded-lg bg-bg-secondary p-6 shadow-2xl"
      >
        <h2 id="download-warning-title" className="text-lg font-semibold text-text-normal">
          Potentially dangerous download
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          You are about to download <span className="font-medium text-text-normal">{fileName}</span>.
          Files from chat can contain malware or other harmful content. Only continue if you trust the sender
          and understand the risks.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
