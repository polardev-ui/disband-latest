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
