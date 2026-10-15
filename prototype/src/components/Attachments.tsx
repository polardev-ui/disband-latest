import { Download, FileText } from "lucide-react";
import type { Attachment } from "../data/types";
import { fileSize } from "../state/selectors";
import { useToast } from "./Toast";

export function Attachments({ items, linkPreviews }: { items?: Attachment[]; linkPreviews: boolean }) {
  const toast = useToast();
  if (!items?.length) return null;
  return (
    <div className="att">
      {items.map((a, i) =>
        a.kind === "file" ? (
          <div key={i} className="att-file">
            <span className="att-file-icon"><FileText size={18} /></span>
            <span className="att-file-text">
              <span className="att-file-name">{a.name}</span>
              <span className="att-file-meta">{fileSize(a.size)} · {a.name.split(".").pop()?.toUpperCase()}</span>
            </span>
            <button
              type="button"
              className="att-file-dl"
              aria-label={`Download ${a.name}`}
              title="Download"
              onClick={() => toast("Sample file — there's nothing to download in the prototype.")}
            >
              <Download size={16} />
            </button>
          </div>
        ) : linkPreviews ? (
          <a key={i} className="att-link" href={a.url} target="_blank" rel="noreferrer noopener">
            <span className="att-link-host">{a.host}</span>
            <span className="att-link-title">{a.title}</span>
            <span className="att-link-desc">{a.description}</span>
          </a>
        ) : (
          <a key={i} className="md-link" href={a.url} target="_blank" rel="noreferrer noopener">{a.url.replace(/^https?:\/\//, "")}</a>
        ),
      )}
    </div>
  );
}
