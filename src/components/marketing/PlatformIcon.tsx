import type { DownloadPlatform } from "@/lib/github-releases";

const className = "h-5 w-5 shrink-0";

/**
 * Brand marks for each download target.
 *
 * Windows and Apple are single-path and inlined. Windows keeps its brand blue;
 * Apple uses currentColor so it stays legible on both dark and light surfaces
 * (the official mark is solid black, which disappears on our dark chrome).
 *
 * Tux is served from /platform-linux.svg rather than inlined — it is a
 * multi-kilobyte, gradient-heavy illustration and inlining it would ship that
 * weight into every bundle that imports this component.
 */
export function PlatformIcon({ platform }: { platform: DownloadPlatform | "apple" | "intel" }) {
  if (platform === "windows") {
    return (
      <svg className={className} viewBox="0 0 128 128" aria-hidden fill="#0078d4">
        <path d="M67.328 67.331h60.669V128H67.328zm-67.325 0h60.669V128H.003zM67.328 0h60.669v60.669H67.328zM.003 0h60.669v60.669H.003z" />
      </svg>
    );
  }

  if (platform === "linux") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/platform-linux.svg" alt="" aria-hidden className={className} />
    );
  }

  // macOS / Apple
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden fill="currentColor">
      <path d="M97.905 67.885c.174 18.8 16.494 25.057 16.674 25.137-.138.44-2.607 8.916-8.597 17.669-5.178 7.568-10.553 15.108-19.018 15.266-8.318.152-10.993-4.934-20.504-4.934-9.508 0-12.479 4.776-20.354 5.086-8.172.31-14.395-8.185-19.616-15.724C15.822 94.961 7.669 66.8 18.616 47.791c5.438-9.44 15.158-15.417 25.707-15.571 8.024-.153 15.598 5.398 20.503 5.398 4.902 0 14.106-6.676 23.782-5.696 4.051.169 15.421 1.636 22.722 12.324-.587.365-13.566 7.921-13.425 23.639M82.272 21.719c4.338-5.251 7.258-12.563 6.462-19.836-6.254.251-13.816 4.167-18.301 9.416-4.02 4.647-7.54 12.087-6.591 19.216 6.971.54 14.091-3.542 18.43-8.796" />
    </svg>
  );
}
