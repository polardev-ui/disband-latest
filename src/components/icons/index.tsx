"use client";

import type { ComponentType } from "react";
import {
  Home,
  Plus,
  Hash,
  Volume2,
  Search,
  ChevronDown,
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  Settings,
  X,
  Users,
  Trash2,
  Pencil,
  Copy,
  LogOut,
  Phone,
  PhoneOff,
  Bell,
  Upload,
  Send,
  Shield,
  Link,
  Palette,
  AlertTriangle,
  Video,
  VideoOff,
  UsersRound,
  Download,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  Star,
  SmilePlus,
  ScreenShare,
  ScreenShareOff,
  SquarePen,
  Crown,
  Pin,
  PinOff,
  Menu,
  Medal,
  Target,
  Music,
  Compass,
  Sparkles,
} from "lucide-react";

export type IconProps = { size?: number; className?: string; strokeWidth?: number };

function icon(Icon: ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>) {
  return function Wrapped({ size = 20, className, strokeWidth = 1.75 }: IconProps) {
    return <Icon size={size} className={className} strokeWidth={strokeWidth} />;
  };
}

export const IconHome = icon(Home);
export const IconPlus = icon(Plus);
export const IconHash = icon(Hash);
export const IconSpeaker = icon(Volume2);
export const IconSearch = icon(Search);
export const IconChevron = icon(ChevronDown);
export const IconMic = icon(Mic);
export const IconMicOff = icon(MicOff);
export const IconHeadphones = icon(Headphones);
export const IconHeadphonesOff = icon(HeadphoneOff);
export const IconSettings = icon(Settings);
export const IconClose = icon(X);
export const IconFriends = icon(Users);
export const IconTrash = icon(Trash2);
export const IconEdit = icon(Pencil);
export const IconCopy = icon(Copy);
export const IconSend = icon(Send);
export const IconLeave = icon(LogOut);
export const IconPhone = icon(Phone);
export const IconPhoneOff = icon(PhoneOff);
export const IconBell = icon(Bell);
export const IconUpload = icon(Upload);
export const IconShield = icon(Shield);
export const IconLink = icon(Link);
export const IconPalette = icon(Palette);
export const IconAlert = icon(AlertTriangle);
export const IconVideo = icon(Video);
export const IconVideoOff = icon(VideoOff);
export const IconGroup = icon(UsersRound);
export const IconDownload = icon(Download);
export const IconZoomIn = icon(ZoomIn);
export const IconZoomOut = icon(ZoomOut);
export const IconExternalLink = icon(ExternalLink);
export const IconStar = icon(Star);
export const IconEmoji = icon(SmilePlus);
export const IconScreenShare = icon(ScreenShare);
export const IconScreenShareOff = icon(ScreenShareOff);
export const IconNotes = icon(SquarePen);
export const IconCrown = icon(Crown);
export const IconMenu = icon(Menu);
/**
 * Staff badge — a solid hammer crossed with a double-ended wrench, matching the
 * conventional 🛠 "hammer and wrench" staff mark.
 *
 * Filled rather than stroked so it stays legible at badge sizes (13–16px),
 * where a 1.75px outline turns to mush. `strokeWidth` is accepted for API
 * parity with the other icons but intentionally unused.
 */
export const IconStaff = function IconStaff({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      /*
       * Tight square crop around the artwork. The source SVG's 0 0 512 512 box
       * left the tools filling only ~47% of it, so at a shared badge size this
       * rendered about half as large as the lucide marks beside it.
       */
      viewBox="129 129 254 254"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M169.5 146.4c-.5.2-2.2.7-3.7 1-1.6.4-2.8 1.2-2.7 1.9 0 .6 5.4 5.8 12 11.5l11.9 10.4v18.3l-4.4 4.7c-2.7 3-5.3 4.8-6.7 4.9-1.3 0-5.1.4-8.3.8-6.7.8-5.2 1.8-21.7-13.1-4.8-4.3-9.2-7.8-9.9-7.8-.9 0-1.1 2.6-.8 10.2.3 8.7.8 11.3 3.3 16.6 1.5 3.5 4.3 8.1 6 10.3 9.4 11.9 28.3 18.1 42.8 14 4.6-1.3 4.8-1.3 9 1.4 2.3 1.5 8 5.7 12.5 9.3 7 5.4 8.6 6.2 9.7 5.1.7-.8 5.1-5.8 9.9-11.2l8.6-9.8-8.7-9.5c-4.8-5.2-9.2-10.2-9.7-11.1-.5-1-.4-3.5.3-6.5 4.4-19.2-5.7-39.2-24.5-48.4-4.5-2.2-7.2-2.7-14.7-3-5.1-.2-9.6-.2-10.2 0m96.9 4.5c-7.2 2.1-13.8 5.7-17.8 10l-3 3.1h3.6c13.9 0 26.7 6.7 33.9 17.9 3.2 5 3.6 7.6 1.4 10.5-.8 1.1-1.5 2.5-1.5 3 0 .6 4.9 5.2 10.9 10.3l10.9 9.2 3.7-2.9c4.6-3.7 8.4-3.8 11.5-.5 1.9 2.1 2.2 3.1 1.7 7.2l-.6 4.8 9.2 7.2c6.3 5 10 7.3 11.9 7.3 2.2 0 5-2.5 15.3-13.7 15.9-17.2 15.8-16.4 2.6-28l-9.4-8.3-5.2.6c-6.3.8-8.3-.8-10.8-9-1.3-3.9-3-6.5-6.5-9.8-6.8-6.4-9.2-7.7-15.7-8.8-3.8-.6-8.1-2.4-12.6-5.1-11.8-7.1-21.2-8.5-33.5-5m2.5 58.3c-3.5 4-15.4 17.2-26.4 29.3-11 12.2-31.9 35.4-46.5 51.5-14.6 16.2-29.5 32.8-33.2 36.8-10.9 12-10.5 16.1 2.8 27.3 17.5 14.6 19 14.3 37.9-9.6 14.5-18.4 31.2-39.5 51-64.5 7.6-9.6 18.9-23.8 25-31.5 16.1-20.3 20.5-26.1 20.5-26.6s-22.7-19.2-23.9-19.7c-.4-.1-3.6 3-7.2 7m11.4 58.1c-1.6 1.8-6 7-9.8 11.6l-6.9 8.3 7.6 7.2c4.2 3.9 10.6 10.3 14.2 14.3l6.6 7.2v7.4c0 9.5 2 16.2 7.3 23.9 7.2 10.6 22.3 18.8 34.5 18.8 5.1 0 16.2-2.8 16.2-4.1 0-.5-5.6-5.4-12.4-10.9-13.6-11.1-13.6-11.1-13.6-23 0-5.1.3-5.9 4.3-10.4 4.1-4.7 4.5-4.9 12.2-6.1 4.4-.7 8.7-.9 9.5-.5.8.5 6.7 5.1 13 10.4s12.1 9.6 12.8 9.6c1.5 0 1.7-16.6.2-17.5-.5-.3-1-1.4-1-2.4 0-3.8-6.2-14-11.5-19-3-2.9-8.5-6.6-12.2-8.4-6.3-3-7.6-3.2-16.8-3.1-7.7 0-11.2.5-15.2 2.1l-5.1 2-10.4-6.5c-5.7-3.6-12.6-8.2-15.4-10.3l-5.1-3.8z" />
    </svg>
  );
};
export const IconOG = icon(Medal);
export const IconBounty = icon(Target);
export const IconMusic = icon(Music);
export const IconCompass = icon(Compass);
export const IconSparkle = icon(Sparkles);
export const IconPin = icon(Pin);
export const IconPinOff = icon(PinOff);
/**
 * Verified badge — a filled blue disc with a white check, for the official
 * "This server is officially verified by Disband" mark. Filled like IconStaff
 * so it stays legible at badge sizes (12–16px). Blue via `text-sky-400` etc.
 */
export const IconVerified = function IconVerified({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path
        d="M7 12.4l3.3 3.3L17 9.1"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export function IconStatus(props: IconProps & { status: "online" | "idle" | "dnd" | "offline" }) {
  const colors = {
    online: "text-status-online",
    idle: "text-status-idle",
    dnd: "text-status-dnd",
    offline: "text-status-offline",
  };
  const { status, size = 20, className } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`${colors[status]} ${className ?? ""}`}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
