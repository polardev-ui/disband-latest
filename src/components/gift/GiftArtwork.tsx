import { AeroIcon } from "@/components/icons/AeroIcon";
import type { GiftPlan } from "@/lib/gifts";

/** Original Disband gift illustration, shared by the inline and standalone cards. */
export function GiftArtwork({ plan }: { plan: GiftPlan }) {
  const lite = plan === "lite";
  return (
    <div aria-hidden="true" className={`relative h-[160px] overflow-hidden @[480px]:h-full @[480px]:min-h-[180px] ${lite ? "bg-[#397e97]" : "bg-[#8271c7]"}`}>
      <div className="absolute inset-x-0 top-3 z-10 text-center text-white">
        <p className="text-[10px] font-bold uppercase leading-3 tracking-[0.2em]">Disband</p>
        <p className="text-[30px] font-black italic leading-8 tracking-[0.04em]">{lite ? "LITE" : "AERO"}</p>
      </div>
      <svg className="absolute bottom-0 h-[130px] w-full" viewBox="0 0 300 150" fill="none">
        <g stroke="white" strokeOpacity=".22" strokeWidth="1.5" strokeLinecap="round">
          <path d="M22 47h43m-27-9h15m168 29h52m-37-9h18M13 94h38m194 12h32" />
          <path d="M18 25h34c-2-5-6-8-11-6-2-13-19-12-20 0-5-1-8 2-8 6h5ZM242 35h34c0-6-5-9-10-7-2-11-17-11-19 0-5-1-8 3-8 7h3Z" />
        </g>
        <ellipse cx="153" cy="130" rx="47" ry="5" fill={lite ? "#28677e" : "#6d5eb0"} />
        <g transform="rotate(-9 151 88)">
          <path d="m120 75-42-12 8 17 29 9ZM180 75l42-12-8 17-29 9Z" fill="#e5e8ff" />
          <path d="m116 91-28-7 8 14 20 6Zm68 0 28-7-8 14-20 6Z" fill="#bdc6ef" />
          <rect x="115" y="66" width="70" height="57" rx="4" fill="#e5e8ff" />
          <path d="M151 66h34v53a4 4 0 0 1-4 4h-30V66Z" fill="#bdc6ef" />
          <rect x="111" y="58" width="78" height="17" rx="3" fill="#f7f8ff" />
          <path d="M151 58h35a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-35V58Z" fill="#d7dcf7" />
          <path d="M143 58h16v65h-16z" fill={lite ? "#82ddd1" : "#ffd399"} />
          <path d="M151 58c-25-1-32-10-24-17 9-8 22 6 24 17Zm0 0c25-1 32-10 24-17-9-8-22 6-24 17Z" stroke={lite ? "#82ddd1" : "#ffd399"} strokeWidth="7" strokeLinejoin="round" />
        </g>
        <path d="M0 150v-11c14-15 32-14 45 0 13-7 26-4 33 11h143c8-16 26-18 39-9 13-19 29-22 40-15v24H0Z" fill="#f0edff" />
      </svg>
      <div className="absolute bottom-[47px] left-1/2 -translate-x-1/2 -rotate-9 text-[#6d5eb0]">
        <AeroIcon size={22} colour={lite ? "#28677e" : "#6d5eb0"} lite />
      </div>
    </div>
  );
}
