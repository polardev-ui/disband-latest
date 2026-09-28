// SF Symbols-style glyphs for the iOS recreations. SF Symbols can't be
// redistributed, so these are drawn to match the symbols the SwiftUI views
// name (bubble.left.and.bubble.right.fill, person.2.fill, note.text, …) at the
// sizes those views use. All take a 24×24 box.

let uid = 0;
const nextId = () => `ic${++uid}`;

const svg = (size, body, extra = "") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" ${extra} xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

const seal = () => {
  // 24 points alternating between two radii, rounded with a quadratic pass.
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 9.1 : 10.6;
    pts.push([12 + Math.cos(a) * r, 12 + Math.sin(a) * r]);
  }
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const n = pts[(i + 1) % pts.length];
    const mid = [(p[0] + n[0]) / 2, (p[1] + n[1]) / 2];
    d += i === 0 ? `M${mid[0].toFixed(2)} ${mid[1].toFixed(2)}` : "";
    const nn = pts[(i + 2) % pts.length];
    const mid2 = [(n[0] + nn[0]) / 2, (n[1] + nn[1]) / 2];
    d += `Q${n[0].toFixed(2)} ${n[1].toFixed(2)} ${mid2[0].toFixed(2)} ${mid2[1].toFixed(2)}`;
  }
  return d + "Z";
};
const SEAL = seal();

const BACK_BUBBLE = "M5.6 2.6h7.3a4.3 4.3 0 0 1 4.3 4.3v2.6a4.3 4.3 0 0 1-4.3 4.3H8.4l-3.6 2.9c-.5.4-1.1 0-1-.6l.5-2.4A4.3 4.3 0 0 1 1.3 9.5V6.9a4.3 4.3 0 0 1 4.3-4.3z";
const FRONT_BUBBLE = "M11.9 8.4h7a4 4 0 0 1 4 4v2.9a4 4 0 0 1-2.9 3.9l.5 2.2c.1.6-.5 1-1 .6l-3.4-2.7h-4.2a4 4 0 0 1-4-4v-2.9a4 4 0 0 1 4-4z";

export function icon(name, { size = 24, color = "currentColor", bg = "#000" } = {}) {
  const id = nextId();
  switch (name) {
    case "bubbles":
      return svg(size, `
        <defs><mask id="${id}"><rect width="24" height="24" fill="#fff"/>
          <path d="${FRONT_BUBBLE}" fill="#000" stroke="#000" stroke-width="3.2" stroke-linejoin="round"/></mask></defs>
        <path d="${BACK_BUBBLE}" fill="${color}" mask="url(#${id})"/>
        <path d="${FRONT_BUBBLE}" fill="${color}"/>`);
    case "person2":
      return svg(size, `
        <defs><mask id="${id}"><rect width="24" height="24" fill="#fff"/>
          <circle cx="8.8" cy="8" r="4" fill="#000" stroke="#000" stroke-width="3"/>
          <path d="M1.4 20.4c0-4 3.3-6.6 7.4-6.6s7.4 2.6 7.4 6.6v.6H1.4z" fill="#000" stroke="#000" stroke-width="3" stroke-linejoin="round"/></mask></defs>
        <g mask="url(#${id})" fill="${color}">
          <circle cx="16.9" cy="7.2" r="3.4"/>
          <path d="M16.9 12.6c3.6 0 6.4 2.2 6.4 5.6v.7h-8.1c0-2.4-1.1-4.5-3-5.7a8.7 8.7 0 0 1 4.7-.6z"/></g>
        <circle cx="8.8" cy="8" r="4" fill="${color}"/>
        <path d="M1.4 20.4c0-4 3.3-6.6 7.4-6.6s7.4 2.6 7.4 6.6v.6H1.4z" fill="${color}"/>`);
    case "note":
      return svg(size, `
        <rect x="3.2" y="3.6" width="17.6" height="16.8" rx="3.4" fill="none" stroke="${color}" stroke-width="2"/>
        <path d="M7.4 9h9.2M7.4 12.4h9.2M7.4 15.8h6" stroke="${color}" stroke-width="1.9" stroke-linecap="round"/>`);
    case "personCircle":
      return svg(size, `
        <defs><mask id="${id}"><rect width="24" height="24" fill="#fff"/>
          <circle cx="12" cy="9.6" r="3.9" fill="#000"/>
          <path d="M5 18.6c1.5-2.7 4-4.1 7-4.1s5.5 1.4 7 4.1c-1.8 2-4.3 3.3-7 3.3s-5.2-1.3-7-3.3z" fill="#000"/></mask></defs>
        <circle cx="12" cy="12" r="10.6" fill="${color}" mask="url(#${id})"/>`);
    case "compose":
      return svg(size, `
        <path d="M11.2 4.4H6.6A3 3 0 0 0 3.6 7.4v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4.6" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M18.3 3.2a2 2 0 0 1 2.8 2.8l-8.3 8.3-3.7 1 1-3.7z" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`);
    case "plus":
      return svg(size, `<path d="M12 4.2v15.6M4.2 12h15.6" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`);
    case "compass":
      return svg(size, `
        <circle cx="12" cy="12" r="10.6" fill="${color}"/>
        <path d="M16.9 7.1l-3.2 6.6-6.6 3.2 3.2-6.6z" fill="${bg}"/>
        <circle cx="12" cy="12" r="1.3" fill="${color}"/>`);
    case "seal":
      return svg(size, `<path d="${SEAL}" fill="${color}"/><path d="M8 12.3l2.7 2.7 5.4-5.8" fill="none" stroke="${bg}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`);
    case "chevronDown":
      return svg(size, `<path d="M6 9.2l6 6 6-6" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`);
    case "chevronLeft":
      return svg(size, `<path d="M15.2 4.6L7.8 12l7.4 7.4" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`);
    case "chevronRight":
      return svg(size, `<path d="M9 4.8l7.2 7.2L9 19.2" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`);
    case "speaker":
      return svg(size, `
        <path d="M2.6 9.2c0-.7.5-1.2 1.2-1.2h2.6l4.3-3.6c.6-.5 1.5-.1 1.5.7v13.8c0 .8-.9 1.2-1.5.7L6.4 16H3.8c-.7 0-1.2-.5-1.2-1.2z" fill="${color}"/>
        <path d="M15.4 8.8a4.6 4.6 0 0 1 0 6.4" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`);
    case "speakerWave":
      return svg(size, `
        <path d="M2.6 9.2c0-.7.5-1.2 1.2-1.2h2.6l4.3-3.6c.6-.5 1.5-.1 1.5.7v13.8c0 .8-.9 1.2-1.5.7L6.4 16H3.8c-.7 0-1.2-.5-1.2-1.2z" fill="${color}"/>
        <path d="M15.4 8.8a4.6 4.6 0 0 1 0 6.4M18.2 6a8.6 8.6 0 0 1 0 12" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`);
    case "personPlus":
      return svg(size, `
        <circle cx="9.4" cy="7.6" r="3.8" fill="none" stroke="${color}" stroke-width="1.9"/>
        <path d="M2.6 20c0-3.6 3-6 6.8-6 1.6 0 3 .4 4.2 1.1" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round"/>
        <circle cx="17.6" cy="17.4" r="4.8" fill="${color}"/>
        <path d="M17.6 15v4.8M15.2 17.4H20" stroke="${bg}" stroke-width="1.8" stroke-linecap="round"/>`);
    case "ellipsis":
      return svg(size, `<circle cx="5.6" cy="12" r="2" fill="${color}"/><circle cx="12" cy="12" r="2" fill="${color}"/><circle cx="18.4" cy="12" r="2" fill="${color}"/>`);
    case "arrowUp":
      return svg(size, `<path d="M12 19.5V5M5.6 11.2L12 4.8l6.4 6.4" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`);
    case "arrowRight":
      return svg(size, `<path d="M4.5 12h14.5M12.8 5.6l6.4 6.4-6.4 6.4" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`);
    case "search":
      return svg(size, `<circle cx="10.4" cy="10.4" r="6.6" fill="none" stroke="${color}" stroke-width="2.2"/><path d="M15.4 15.4l5 5" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>`);
    case "camera":
      return svg(size, `
        <defs><mask id="${id}"><rect width="24" height="24" fill="#fff"/><circle cx="12" cy="13.2" r="4.4" fill="#000"/></mask></defs>
        <path d="M4.4 6.8h2.8l1.4-2.1c.3-.4.7-.7 1.2-.7h4.4c.5 0 .9.3 1.2.7l1.4 2.1h2.8a2.4 2.4 0 0 1 2.4 2.4v8.6a2.4 2.4 0 0 1-2.4 2.4H4.4A2.4 2.4 0 0 1 2 17.8V9.2a2.4 2.4 0 0 1 2.4-2.4z" fill="${color}" mask="url(#${id})"/>
        <circle cx="12" cy="13.2" r="2.8" fill="${color}"/>`);
    case "photo":
      return svg(size, `
        <rect x="2.6" y="4.4" width="18.8" height="15.2" rx="3" fill="none" stroke="${color}" stroke-width="2"/>
        <path d="M3.6 17.4l4.9-4.9 3.6 3.6 2.4-2.4 5.9 5.4" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="16" cy="9.4" r="1.7" fill="${color}"/>`);
    case "sparkles":
      return svg(size, `
        <path d="M10.4 4.2c.6 3.8 2.6 5.8 6.4 6.4-3.8.6-5.8 2.6-6.4 6.4-.6-3.8-2.6-5.8-6.4-6.4 3.8-.6 5.8-2.6 6.4-6.4z" fill="${color}"/>
        <path d="M17.8 13.8c.3 1.9 1.3 2.9 3.2 3.2-1.9.3-2.9 1.3-3.2 3.2-.3-1.9-1.3-2.9-3.2-3.2 1.9-.3 2.9-1.3 3.2-3.2zM5.4 1.6c.2 1.3.9 2 2.2 2.2-1.3.2-2 .9-2.2 2.2-.2-1.3-.9-2-2.2-2.2 1.3-.2 2-.9 2.2-2.2z" fill="${color}"/>`);
    case "gift":
      return svg(size, `
        <rect x="3" y="8" width="18" height="4.4" rx="1.2" fill="${color}"/>
        <rect x="4.4" y="13.4" width="15.2" height="7.4" rx="1.4" fill="${color}"/>
        <path d="M12 8v12.8" stroke="${bg}" stroke-width="2"/>
        <path d="M12 7.8C10.6 4.4 6.6 3.4 6.8 6.2c.1 1.4 2.6 1.8 5.2 1.6zM12 7.8c1.4-3.4 5.4-4.4 5.2-1.6-.1 1.4-2.6 1.8-5.2 1.6z" fill="none" stroke="${color}" stroke-width="1.8"/>`);
    case "bubble":
      return svg(size, `<path d="M6.2 4h11.6A3.6 3.6 0 0 1 21.4 7.6v6.8a3.6 3.6 0 0 1-3.6 3.6h-6.2l-4.4 3.3c-.5.4-1.2 0-1.1-.6l.4-2.7A3.6 3.6 0 0 1 2.6 14.4V7.6A3.6 3.6 0 0 1 6.2 4z" fill="${color}"/>`);
    case "palette":
      return svg(size, `
        <path d="M12 2.6c5.4 0 9.6 3.8 9.6 8.4 0 3.3-2.6 5-5 5h-1.8c-1 0-1.6 1-1.1 1.8.4.6.6 1.2.6 1.8 0 1.2-1 1.8-2.3 1.8-5.3 0-9.6-4.2-9.6-9.4S6.6 2.6 12 2.6z" fill="${color}"/>
        <circle cx="7.4" cy="11" r="1.6" fill="${bg}"/><circle cx="10" cy="6.9" r="1.6" fill="${bg}"/><circle cx="14.6" cy="6.9" r="1.6" fill="${bg}"/><circle cx="17.3" cy="10.6" r="1.6" fill="${bg}"/>`);
    case "pencil":
      return svg(size, `<path d="M16.6 3.6a2.2 2.2 0 0 1 3.1 0l.7.7a2.2 2.2 0 0 1 0 3.1L9.2 18.6l-4.8 1.2 1.2-4.8z" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`);
    case "lock":
      return svg(size, `
        <rect x="4.6" y="10.4" width="14.8" height="10.6" rx="2.6" fill="${color}"/>
        <path d="M8 10.4V7.6a4 4 0 0 1 8 0v2.8" fill="none" stroke="${color}" stroke-width="2.2"/>`);
    case "shield":
      return svg(size, `<path d="M12 2.4l7.6 3v5.8c0 5-3.2 8.8-7.6 10.4-4.4-1.6-7.6-5.4-7.6-10.4V5.4z" fill="${color}"/><path d="M8.6 12.2l2.4 2.4 4.4-4.8" fill="none" stroke="${bg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
    case "statusBars":
      return `<svg width="${size * 1.25}" height="${size * 0.84}" viewBox="0 0 20 13.4"><rect x="0" y="9" width="3.4" height="4.4" rx="1" fill="${color}"/><rect x="5.2" y="6.2" width="3.4" height="7.2" rx="1" fill="${color}"/><rect x="10.4" y="3.2" width="3.4" height="10.2" rx="1" fill="${color}"/><rect x="15.6" y="0" width="3.4" height="13.4" rx="1" fill="${color}"/></svg>`;
    case "wifi":
      return `<svg width="${size * 1.12}" height="${size * 0.84}" viewBox="0 0 18 13.4"><path d="M9 13.2l2.6-2.9a3.7 3.7 0 0 0-5.2 0zM4.3 8.2l1.6 1.8a4.6 4.6 0 0 1 6.2 0l1.6-1.8a7 7 0 0 0-9.4 0zM1.6 5.2l1.6 1.8a8.6 8.6 0 0 1 11.6 0l1.6-1.8A11 11 0 0 0 1.6 5.2zM-1.1 2.3L.5 4.1a12.6 12.6 0 0 1 17 0l1.6-1.8a15 15 0 0 0-20.2 0z" transform="translate(0.1 0)" fill="${color}"/></svg>`;
    case "battery":
      return `<svg width="${size * 1.6}" height="${size * 0.78}" viewBox="0 0 28 13.4"><rect x="0.6" y="0.6" width="24.2" height="12.2" rx="3.8" fill="none" stroke="${color}" stroke-opacity=".38" stroke-width="1.1"/><rect x="2.4" y="2.4" width="20.6" height="8.6" rx="2.3" fill="${color}"/><path d="M26.2 4.6v4.2c.9-.3 1.5-1.2 1.5-2.1s-.6-1.8-1.5-2.1z" fill="${color}" fill-opacity=".4"/></svg>`;
    default:
      throw new Error(`unknown icon ${name}`);
  }
}
