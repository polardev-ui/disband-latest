/** Original flat landscape for Disband's welcome and discovery screens. */
export function CommunityBackdrop({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}>
    <path fill="#5865f2" d="M0 0h1440v900H0z" />
    <circle cx="1150" cy="180" r="72" fill="#b5bcff" />
    <g fill="#818bf6"><path d="M80 174h240a40 40 0 0 0-40-40h-34a62 62 0 0 0-120 0h-16a40 40 0 0 0-30 40Z"/><path d="M950 350h310a42 42 0 0 0-42-42h-44a70 70 0 0 0-136 0h-46a42 42 0 0 0-42 42Z"/></g>
    <path fill="#434fc4" d="M0 450q180-150 350 50t420 0 670-80v480H0Z" />
    <path fill="#343f9b" d="M0 660q220-160 460-30t450-20 530 50v240H0Z" />
    <path fill="#8991ed" d="M590 900q180-140 45-220t60-175q-100 95 50 165t-30 230Z" />
    <g fill="#273179"><path d="M90 900V550h14v350Zm-30-330 37-145 38 145Zm5 70 32-140 33 140Z"/><path d="M1290 900V610h14v290Zm-30-270 37-145 38 145Zm5 70 32-140 33 140Z"/></g>
    <g transform="translate(170 570) rotate(-8)"><rect width="156" height="104" rx="12" fill="#c1c7ff"/><path fill="#c1c7ff" d="m30 100 0 30 36-30Z"/><path d="M28 32h100M28 52h70M28 72h85" stroke="#5865f2" strokeWidth="9" strokeLinecap="round"/></g>
    <g transform="translate(1080 590) rotate(10)"><rect width="130" height="94" rx="12" fill="#f5c7b0"/><path fill="#f5c7b0" d="m70 90 35 30V90Z"/><path d="m30 45 20 20 45-38" fill="none" stroke="#bd786d" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/></g>
    <g fill="#bec5ff"><circle cx="410" cy="165" r="4"/><circle cx="850" cy="100" r="5"/><circle cx="1320" cy="400" r="4"/><circle cx="78" cy="340" r="4"/></g>
  </svg>;
}
