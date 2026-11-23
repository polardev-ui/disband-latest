"use client";

import { useId } from "react";

/*
 Solid glyphs for the spots where classic Discord used filled icons: the
 composer's gift and GIF buttons and the DM sidebar's Friends / Notes rows.
 Drawn for Disband; all use currentColor so hover colours carry through.
*/

interface Props {
  size?: number;
  className?: string;
}

export function SolidGiftIcon({ size = 24, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 7.2c-1.1-2.7-3-4.2-4.6-4.2A2.3 2.3 0 0 0 5.1 5.3C5.1 6.6 6.3 7.2 8 7.2Z" />
      <path d="M12 7.2c1.1-2.7 3-4.2 4.6-4.2a2.3 2.3 0 0 1 2.3 2.3c0 1.3-1.2 1.9-2.9 1.9Z" />
      <path d="M2 9a1.5 1.5 0 0 1 1.5-1.5H11v3.5H3.5A1.5 1.5 0 0 1 2 9.5Z" />
      <path d="M13 7.5h7.5A1.5 1.5 0 0 1 22 9v.5a1.5 1.5 0 0 1-1.5 1.5H13Z" />
      <path d="M3.5 12.5H11V21H5.5a2 2 0 0 1-2-2Z" />
      <path d="M13 12.5h7.5V19a2 2 0 0 1-2 2H13Z" />
    </svg>
  );
}

/** A filled tag with "GIF" knocked out, so the composer colour shows through. */
export function SolidGifIcon({ size = 24, className = "" }: Props) {
  const id = useId();
  const w = Math.round(size * (28 / 24));
  return (
    <svg width={w} height={size} viewBox="0 0 28 24" aria-hidden className={className}>
      <mask id={id}>
        <rect x="1" y="4" width="26" height="16" rx="3.5" fill="#fff" />
        <text
          x="14"
          y="15.9"
          textAnchor="middle"
          fontSize="10.5"
          fontWeight="800"
          letterSpacing="0.4"
          fontFamily="inherit"
          fill="#000"
        >
          GIF
        </text>
      </mask>
      <rect x="1" y="4" width="26" height="16" rx="3.5" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

/**
 * A sticker: a rounded square with its corner peeling up and a face knocked
 * out, for the composer's sticker button.
 */
export function SolidStickerIcon({ size = 24, className = "" }: Props) {
  const id = useId();
  const flap = "M21.5 15.5H17.5A2 2 0 0 0 15.5 17.5V21.5Z";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <mask id={id}>
        <rect width="24" height="24" fill="#fff" />
        <circle cx="8.9" cy="9.4" r="1.5" fill="#000" />
        <circle cx="14.6" cy="9.4" r="1.5" fill="#000" />
        <path d="M8.3 13.1c1.8 2 4.8 2 6.7 0" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" />
        <path d={flap} fill="none" stroke="#000" strokeWidth="1.8" strokeLinejoin="round" />
      </mask>
      <path
        d="M5.5 2.5h13a3 3 0 0 1 3 3v10l-6 6h-10a3 3 0 0 1-3-3v-13a3 3 0 0 1 3-3Z"
        fill="currentColor"
        mask={`url(#${id})`}
      />
      <path d={flap} fill="currentColor" />
    </svg>
  );
}

export function SolidFriendsIcon({ size = 24, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <circle cx="9" cy="8" r="4.2" />
      <path d="M1.5 20.2a7.5 7.5 0 0 1 15 0v.3a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5Z" />
      <circle cx="16.8" cy="7.4" r="3.3" />
      <path d="M17.4 12.5a6.1 6.1 0 0 1 5.1 6v1.4a.6.6 0 0 1-.6.6h-3.6a9 9 0 0 0-3.5-7.2 6 6 0 0 1 2.6-.8Z" />
    </svg>
  );
}

export function SolidNotesIcon({ size = 24, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor" fillRule="evenodd">
      <path d="M6 2h8.4L20 7.6V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.6V7a1 1 0 0 0 1 1h3.4ZM8 11h8v1.7H8Zm0 3.4h8v1.7H8Zm0 3.4h5v1.7H8Z" />
    </svg>
  );
}

/** A filled face with its eyes and smile knocked out, for the composer's emoji button. */
export function SolidEmojiIcon({ size = 24, className = "" }: Props) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <mask id={id}>
        <rect width="24" height="24" fill="#fff" />
        <circle cx="8.9" cy="9.6" r="1.5" fill="#000" />
        <circle cx="15.1" cy="9.6" r="1.5" fill="#000" />
        <path d="M8.2 14c2.1 2.4 5.5 2.4 7.6 0" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" />
      </mask>
      <circle cx="12" cy="12" r="10" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}
