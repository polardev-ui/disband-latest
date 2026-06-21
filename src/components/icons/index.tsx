"use client";

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, className, ...props }: IconProps) {
  return { width: size, height: size, viewBox: "0 0 24 24", fill: "currentColor", className, ...props };
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3l9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V11l9-8z" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5V6a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function IconHash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7.27 3.04 5.5 3.5l.96 3.86L3.5 8.5l.46 1.77 3.86-.96 1.04 4.16 1.77-.46-.96-3.86 3.86-.96-.46-1.77-3.86.96-1.04-4.16-1.77.46.96 3.86-3.86.96.46 1.77zM14.5 3.5l-.96 3.86 3.86.96-.46 1.77-3.86-.96-1.04 4.16-1.77.46.96-3.86-3.86-.96.46-1.77 3.86.96 1.04-4.16 1.77-.46-.96-3.86 3.86-.96.46-1.77z" />
    </svg>
  );
}

export function IconSpeaker(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3a1 1 0 0 0-1 1v8.17A3 3 0 0 0 9 14a3 3 0 1 0 6 0c0-.35-.06-.68-.17-1H14V4a1 1 0 0 0-1-1zm-4 9.17V5H6v7.17A3 3 0 0 0 5 14a3 3 0 0 0 2 2.83V19H7v2h10v-2h-1v-2.17A3 3 0 0 0 19 14a3 3 0 0 0-2-2.83V5h-2v7.17A3 3 0 0 0 8 12.17z" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" strokeLinecap="round" />
    </svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
    </svg>
  );
}

export function IconMic(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

export function IconMicOff(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zM14.98 11.17c0-1.65-1.35-3-3-3-.17 0-.34.02-.5.05l1.5 1.5c.01.15.02.3.02.45v2.5l2.48 2.48c.01-.08.02-.16.02-.24v-1.7h2c0 .55-.45 1-1 1h-1v3c0 .55-.45 1-1 1s-1-.45-1-1v-1H9v1c0 .55-.45 1-1 1s-1-.45-1-1v-3H6c-.55 0-1-.45-1-1s.45-1 1-1h1V9c0-3.87 3.13-7 7-7 .88 0 1.73.16 2.52.46l1.42-1.42C15.93 1.19 14.5 1 13 1 8.03 1 4 5.03 4 10v1H3c-.55 0-1 .45-1 1s.45 1 1 1h1v3c0 .55.45 1 1 1s1-.45 1-1v-1h2.17l8.81 8.81z" />
    </svg>
  );
}

export function IconHeadphones(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 1c-1.1 0-2 .9-2 2v8.17A3 3 0 0 0 7 12a3 3 0 0 0 2 2.83V19H7v2h10v-2h-1v-2.17A3 3 0 0 0 19 12a3 3 0 0 0-2-2.83V3c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

export function IconHeadphonesOff(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.27 2.5 2 3.77l3.09 3.09C3.61 8.15 2 10.35 2 13v1h2v-1c0-1.66 1.34-3 3-3 .46 0 .89.11 1.28.29l1.46-1.46C8.89 8.21 8.05 8 7.17 8 5.51 8 4.17 9.34 4.17 11v1H3c-.55 0-1 .45-1 1s.45 1 1 1h1v3c0 .55.45 1 1 1s1-.45 1-1v-1h2.17l9.66 9.66 1.27-1.27L3.27 2.5z" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.89 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z" />
    </svg>
  );
}

export function IconFriends(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 2c-3.31 0-6 2.02-6 4.5V18h12v-3.5C14 12.02 11.31 10 8 10zm8 0c-.85 0-1.65.13-2.38.36 1.18.89 1.88 2.08 1.88 3.39V18h6v-3.5c0-2.48-2.69-4.5-5.5-4.5z" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
  );
}

export function IconLeave(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.07 21 3 13.93 3 5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.01l-2.2 2.21z" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
    </svg>
  );
}

export function IconStatus(props: IconProps & { status: "online" | "idle" | "dnd" | "offline" }) {
  const colors = {
    online: "text-status-online",
    idle: "text-status-idle",
    dnd: "text-status-dnd",
    offline: "text-status-offline",
  };
  return (
    <svg {...base({ ...props, className: `${colors[props.status]} ${props.className ?? ""}` })}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
